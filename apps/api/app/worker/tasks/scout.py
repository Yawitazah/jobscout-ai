from __future__ import annotations

import asyncio
import logging

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

MAX_JOBS_PER_USER = 200


def _get_supabase():
    from app.config import get_settings
    from app.db.supabase_client import get_supabase_service_client

    return get_supabase_service_client(get_settings())


@celery_app.task(name="app.worker.tasks.scout.scout_all_users")
def scout_all_users():
    supabase = _get_supabase()
    # Fetch users that have both a profile and preferences
    profiles = supabase.table("profiles").select("id").execute()
    user_ids = [p["id"] for p in (profiles.data or [])]

    scheduled = 0
    for uid in user_ids:
        prefs = (
            supabase.table("preferences")
            .select("user_id")
            .eq("user_id", uid)
            .execute()
        )
        if prefs.data:
            scout_for_user.delay(uid)
            scheduled += 1

    return {"users_scheduled": scheduled}


@celery_app.task(
    name="app.worker.tasks.scout.scout_for_user",
    bind=True,
)
def scout_for_user(self, user_id: str):
    from app.scout.persist import upsert_job_sync
    from app.scout.registry import ALL_ADAPTERS
    from app.worker.tasks.scoring import (
        fetch_preferences,
        fetch_profile,
        score_job_for_user,
    )

    supabase = _get_supabase()

    run_result = (
        supabase.table("scout_runs")
        .insert(
            {
                "user_id": user_id,
                "status": "running",
                "sources_used": [a.name for a in ALL_ADAPTERS],
            }
        )
        .execute()
    )
    run_id = run_result.data[0]["id"]

    try:
        profile = fetch_profile(supabase, user_id)
        preferences = fetch_preferences(supabase, user_id) or {}

        if not profile:
            raise ValueError("User missing profile")

        async def fetch_all():
            results = []
            for adapter in ALL_ADAPTERS:
                for slug in adapter.list_known_companies():
                    try:
                        jobs = await adapter.fetch_company_jobs(slug)
                        results.extend(jobs)
                    except Exception as exc:
                        logger.warning(f"{adapter.name}/{slug} failed: {exc}")
            return results

        raw_jobs = asyncio.run(fetch_all())
        jobs_fetched = len(raw_jobs)

        # Pre-filter by title keywords and recency
        filtered = []
        for job in raw_jobs:
            if _pre_filter(job, preferences):
                filtered.append(job)
            if len(filtered) >= MAX_JOBS_PER_USER:
                break

        # Upsert jobs and queue scoring
        job_ids = []
        for normalized in filtered:
            try:
                job_id = upsert_job_sync(supabase, normalized)
                job_ids.append(job_id)
            except Exception as exc:
                logger.warning(f"Failed to upsert job {normalized.source_id}: {exc}")

        # Pre-populate user_jobs immediately so jobs appear in the queue right away.
        # The score_job_for_user task will update these rows with real AI scores.
        if job_ids:
            preliminary_rows = [
                {
                    "user_id": user_id,
                    "job_id": job_id,
                    "score": 50,
                    "status": "pending",
                    "decision_source": None,
                    "match_reasons": [],
                    "deal_breakers_hit": [],
                }
                for job_id in job_ids
            ]
            try:
                # ignore_duplicates=True preserves existing rows that have real AI scores
                supabase.table("user_jobs").upsert(
                    preliminary_rows,
                    on_conflict="user_id,job_id",
                    ignore_duplicates=True,
                ).execute()
                logger.info(f"Pre-inserted {len(preliminary_rows)} user_jobs for user {user_id}")
            except Exception as exc:
                logger.warning(f"Failed to pre-insert user_jobs: {exc}")

        for job_id in job_ids:
            score_job_for_user.delay(user_id, job_id)

        supabase.table("scout_runs").update(
            {
                "status": "complete",
                "jobs_fetched": jobs_fetched,
                "jobs_queued": len(job_ids),
                "completed_at": "now()",
            }
        ).eq("id", run_id).execute()

        return {"fetched": jobs_fetched, "queued": len(job_ids)}

    except Exception as exc:
        supabase.table("scout_runs").update(
            {
                "status": "failed",
                "error_message": str(exc),
                "completed_at": "now()",
            }
        ).eq("id", run_id).execute()
        raise


def _pre_filter(job, preferences: dict) -> bool:
    from app.scout.base import NormalizedJob

    is_normalized = isinstance(job, NormalizedJob)
    job_title = (job.title if is_normalized else job.get("title", "")).lower()
    job_work_mode = (job.work_mode if is_normalized else job.get("work_mode", "") or "").lower()

    # --- Title keyword filter ---
    target_titles = [t.lower() for t in preferences.get("target_titles", [])]
    if target_titles:
        # Build keyword set — keep all meaningful words including short ones like
        # "SWE", "iOS", "QA", "ML", "VP", "PM". Only drop true stop words.
        _stop = {"and", "the", "for", "with", "a", "an", "of", "in", "at", "to"}
        keywords: set[str] = set()
        for t in target_titles:
            for word in t.split():
                if word not in _stop:
                    keywords.add(word)

        if keywords and not any(kw in job_title for kw in keywords):
            return False

    # --- Work mode filter ---
    # Normalize preference work modes (e.g. "Remote" → "remote")
    pref_modes = [m.lower() for m in preferences.get("work_modes", [])]
    if pref_modes and job_work_mode:
        # Map job work modes to our labels
        _mode_map = {
            "remote": "remote",
            "hybrid": "hybrid",
            "onsite": "onsite",
            "on-site": "onsite",
            "in-person": "onsite",
            "in person": "onsite",
        }
        normalized_job_mode = _mode_map.get(job_work_mode, job_work_mode)
        if not any(normalized_job_mode == pm or pm in normalized_job_mode for pm in pref_modes):
            return False

    return True

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_supabase():
    from app.config import get_settings
    from app.db.supabase_client import get_supabase_service_client
    return get_supabase_service_client(get_settings())


@celery_app.task(
    name="app.worker.tasks.apply.submit_application",
    bind=True,
    max_retries=1,
)
def submit_application(self, application_id: str, user_id: str):
    """
    Phase 1 of the apply pipeline (runs on Railway):
      1. Tailor resume via Claude
      2. Generate cover letter via Claude
      3. Set status → ready_to_submit

    Phase 2 (runs on the user's local machine via local_runner.py):
      4. Open real browser, navigate to job URL
      5. Use Claude computer use to fill & submit any ATS form
      6. Report confirmation back
    """
    try:
        _prepare(application_id, user_id)
    except Exception as exc:
        logger.exception("submit_application failed for %s: %s", application_id, exc)
        _mark_failed(_get_supabase(), application_id, str(exc))
        raise self.retry(exc=exc, countdown=60)


def _prepare(application_id: str, user_id: str) -> None:
    supabase = _get_supabase()

    # ------------------------------------------------------------------ #
    # 1. Load application
    # ------------------------------------------------------------------ #
    app_row = (
        supabase.table("applications")
        .select("*, user_jobs(job_id)")
        .eq("id", application_id)
        .single()
        .execute()
    )
    if not app_row.data:
        logger.error("Application %s not found", application_id)
        return

    app = app_row.data
    job_id = (app.get("user_jobs") or {}).get("job_id")
    user_job_id = app.get("user_job_id")
    if not job_id:
        _mark_failed(supabase, application_id, "job_id missing from user_jobs")
        return

    job_row = (
        supabase.table("jobs")
        .select("id, title, description, location, work_mode, company_id")
        .eq("id", job_id)
        .single()
        .execute()
    )
    if not job_row.data:
        _mark_failed(supabase, application_id, "job not found")
        return
    job = job_row.data

    company_row = (
        supabase.table("companies")
        .select("name")
        .eq("id", job.get("company_id", ""))
        .limit(1)
        .execute()
    )
    company_data = (company_row.data or [])[0] if company_row.data else None
    job["company_name"] = company_data["name"] if company_data else ""

    profile_row = (
        supabase.table("profiles")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not profile_row.data:
        _mark_failed(supabase, application_id, "profile not found")
        return
    profile = profile_row.data

    # ------------------------------------------------------------------ #
    # 2. Tailor resume (if not already done)
    # ------------------------------------------------------------------ #
    resume_doc_id = app.get("resume_doc_id")
    has_profile_data = bool(profile.get("experience") or profile.get("skills"))

    if not resume_doc_id and has_profile_data:
        _set_status(supabase, application_id, "tailoring_resume")
        try:
            from app.services.ai.resume_tailor import tailor_resume
            from app.routers.applications import _render_text, _build_contact

            tailored = tailor_resume(profile, job)
            tailored["contact"] = _build_contact(profile)
            content_text = _render_text(tailored, profile)

            now = datetime.now(timezone.utc).isoformat()
            doc = (
                supabase.table("generated_documents")
                .insert({
                    "user_id": user_id,
                    "user_job_id": user_job_id,
                    "document_type": "resume",
                    "content_json": tailored,
                    "content_text": content_text,
                    "generation_model": "claude-haiku-4-5",
                    "verification_status": "passed",
                    "verification_notes": [],
                    "created_at": now,
                })
                .select("id")
                .execute()
            )
            resume_doc_id = doc.data[0]["id"]
            supabase.table("applications").update({
                "resume_doc_id": resume_doc_id,
                "updated_at": now,
            }).eq("id", application_id).execute()
            logger.info("Auto-generated resume %s for application %s", resume_doc_id, application_id)
        except Exception as exc:
            logger.warning("Resume tailoring failed: %s", exc)
            _mark_failed(
                supabase, application_id,
                f"Resume generation failed: {exc}. Add API credits then click 'Regenerate Docs'."
            )
            return

    # ------------------------------------------------------------------ #
    # 3. Generate cover letter (if not already done)
    # ------------------------------------------------------------------ #
    cover_letter_doc_id = app.get("cover_letter_doc_id")

    if not cover_letter_doc_id and has_profile_data:
        _set_status(supabase, application_id, "writing_cover_letter")
        try:
            from app.services.ai.cover_letter import generate_cover_letter

            result = generate_cover_letter(profile, job)
            paragraphs = result.get("paragraphs", [])
            cover_letter_text = "\n\n".join(paragraphs)
            content_json = {
                "paragraphs": paragraphs,
                "word_count": result.get("word_count", 0),
                "banned_words_found": result.get("banned_words_found", []),
            }

            now = datetime.now(timezone.utc).isoformat()
            cl_doc = (
                supabase.table("generated_documents")
                .insert({
                    "user_id": user_id,
                    "user_job_id": user_job_id,
                    "document_type": "cover_letter",
                    "content_json": content_json,
                    "content_text": cover_letter_text,
                    "generation_model": "claude-sonnet-4-6",
                    "verification_status": "passed",
                    "created_at": now,
                })
                .select("id")
                .execute()
            )
            cover_letter_doc_id = cl_doc.data[0]["id"]
            supabase.table("applications").update({
                "cover_letter_doc_id": cover_letter_doc_id,
                "updated_at": now,
            }).eq("id", application_id).execute()
            logger.info("Auto-generated cover letter %s for application %s", cover_letter_doc_id, application_id)
        except Exception as exc:
            # Cover letter failure is non-fatal — we can still submit with just the resume
            logger.warning("Cover letter generation failed (will continue without): %s", exc)

    # ------------------------------------------------------------------ #
    # 4. Hand off to local agent
    # ------------------------------------------------------------------ #
    _set_status(supabase, application_id, "ready_to_submit")
    logger.info(
        "Application %s is ready_to_submit — local agent will open browser and submit",
        application_id,
    )


def _set_status(supabase, application_id: str, status: str) -> None:
    supabase.table("applications").update({
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", application_id).execute()


def _mark_failed(supabase, application_id: str, reason: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("applications").update({
        "status": "submit_failed",
        "submission_log": [{"action": "error", "detail": reason, "ok": False}],
        "updated_at": now,
    }).eq("id", application_id).execute()

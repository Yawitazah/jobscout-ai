from __future__ import annotations

import logging

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_supabase():
    from app.config import get_settings
    from app.db.supabase_client import get_supabase_service_client
    return get_supabase_service_client(get_settings())


def fetch_profile(supabase, user_id: str) -> dict | None:
    r = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    return r.data


def fetch_preferences(supabase, user_id: str) -> dict | None:
    r = (
        supabase.table("preferences")
        .select("*")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    return r.data


def fetch_job(supabase, job_id: str) -> dict | None:
    r = (
        supabase.table("jobs")
        .select("*, companies(name, website)")
        .eq("id", job_id)
        .single()
        .execute()
    )
    if not r.data:
        return None
    job = r.data
    if job.get("companies"):
        job["company_name"] = job["companies"]["name"]
    return job


@celery_app.task(
    name="app.worker.tasks.scoring.score_job_for_user",
    bind=True,
    max_retries=2,
)
def score_job_for_user(self, user_id: str, job_id: str):
    from app.services.ai.job_scorer import score_job

    try:
        supabase = _get_supabase()

        # Check if a row already exists (may be a preliminary placeholder)
        existing = (
            supabase.table("user_jobs")
            .select("id, status, decision_source")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
        existing_data = (existing.data or [])[0] if existing.data else None
        # Skip only if user has already made a manual decision on this job
        if existing_data and existing_data.get("decision_source") == "manual":
            return {"status": "skipped", "reason": "manual_decision"}

        profile = fetch_profile(supabase, user_id)
        preferences = fetch_preferences(supabase, user_id)
        job = fetch_job(supabase, job_id)

        if not profile or not job:
            return {"status": "skipped", "reason": "missing_data"}

        result = score_job(profile, preferences or {}, job)
        score_val = result["score"]

        row = {
            "user_id": user_id,
            "job_id": job_id,
            "score": score_val,
            "match_reasons": result.get("reasons", []),
            "deal_breakers_hit": result.get("deal_breakers_hit", []),
            "status": "pending",
            "decision_source": None,
        }

        # Evaluate auto-rules
        auto_approve = preferences.get("auto_approve_rules", []) if preferences else []
        auto_reject = preferences.get("auto_reject_rules", []) if preferences else []
        context = {
            "score": score_val,
            "work_mode": job.get("work_mode"),
            "salary_min": job.get("salary_min"),
            "salary_max": job.get("salary_max"),
            "has_deal_breaker": len(result.get("deal_breakers_hit", [])) > 0,
            "company_in_greenlist": False,
            "company_in_blocklist": False,
        }

        matched_reject, _ = evaluate_rules(auto_reject, context)
        if matched_reject:
            row["status"] = "rejected"
            row["decision_source"] = "auto"
        else:
            matched_approve, _ = evaluate_rules(auto_approve, context)
            if matched_approve:
                row["status"] = "approved"
                row["decision_source"] = "auto"

        supabase.table("user_jobs").upsert(
            row, on_conflict="user_id,job_id"
        ).execute()
        return {"status": "scored", "score": score_val}

    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


def evaluate_rules(rules: list, context: dict) -> tuple[bool, str | None]:
    for rule in rules:
        if not rule.get("active"):
            continue
        clauses = rule.get("all_of", [])
        if all(_eval_clause(c, context) for c in clauses):
            return True, rule.get("name")
    return False, None


def _eval_clause(clause: dict, context: dict) -> bool:
    field = clause.get("field")
    op = clause.get("op")
    value = clause.get("value")
    ctx_val = context.get(field)

    if ctx_val is None:
        return False

    if op == ">=":
        return float(ctx_val) >= float(value)
    if op == "<=":
        return float(ctx_val) <= float(value)
    if op == "equals":
        return str(ctx_val).lower() == str(value).lower()
    if op == "in":
        return ctx_val in (value if isinstance(value, list) else [value])
    if op == "contains":
        return str(value).lower() in str(ctx_val).lower()
    return False

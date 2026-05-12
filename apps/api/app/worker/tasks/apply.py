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
    try:
        asyncio.run(_submit(application_id, user_id))
    except Exception as exc:
        logger.exception("submit_application failed for %s: %s", application_id, exc)
        _mark_failed(_get_supabase(), application_id, str(exc))
        raise self.retry(exc=exc, countdown=60)


async def _submit(application_id: str, user_id: str) -> None:
    supabase = _get_supabase()

    app_row = (
        supabase.table("applications")
        .select("*, user_jobs(job_id), generated_documents!resume_doc_id(content_json, content_text), generated_documents!cover_letter_doc_id(content_text)")
        .eq("id", application_id)
        .single()
        .execute()
    )
    if not app_row.data:
        logger.error("Application %s not found", application_id)
        return

    app = app_row.data
    job_id = (app.get("user_jobs") or {}).get("job_id")
    if not job_id:
        _mark_failed(supabase, application_id, "job_id missing from user_jobs")
        return

    job_row = (
        supabase.table("jobs")
        .select("source_url, source_platform, title, company_id")
        .eq("id", job_id)
        .single()
        .execute()
    )
    if not job_row.data:
        _mark_failed(supabase, application_id, "job not found")
        return
    job = job_row.data

    platform = job.get("source_platform")
    apply_url = job.get("source_url")
    if not platform or not apply_url:
        _mark_failed(supabase, application_id, "missing platform or source_url")
        return

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

    saved_row = (
        supabase.table("application_answers")
        .select("question_key, answer")
        .eq("user_id", user_id)
        .execute()
    )
    saved_answers = {r["question_key"]: r["answer"] for r in (saved_row.data or [])}

    resume_doc = app.get("generated_documents!resume_doc_id") or {}
    cover_letter_doc = app.get("generated_documents!cover_letter_doc_id") or {}
    cover_letter_text = cover_letter_doc.get("content_text") or ""

    resume_json = resume_doc.get("content_json") or {}
    resume_pdf: bytes | None = None
    if resume_json:
        try:
            from app.services.documents.resume_builder import build_pdf
            resume_pdf = build_pdf(resume_json, profile.get("full_name") or "")
        except Exception as exc:
            logger.warning("PDF generation failed, continuing without: %s", exc)

    _set_status(supabase, application_id, "submitting")

    from app.agent.browser import get_page
    from app.agent.registry import get_filler
    from app.agent.screenshots import capture_and_upload

    async with get_page(headless=True) as (_, __, page):
        try:
            filler = get_filler(
                platform=platform,
                page=page,
                profile=profile,
                saved_answers=saved_answers,
                apply_url=apply_url,
                cover_letter_text=cover_letter_text,
                resume_pdf_bytes=resume_pdf,
            )
            await filler.fill()
            result = await filler.submit_with_proof()
        except Exception as exc:
            logger.exception("Filler raised for application %s: %s", application_id, exc)
            _mark_failed(supabase, application_id, str(exc))
            return

    screenshot_paths: list[str] = []
    if result.get("screenshot_bytes"):
        path = await _upload_screenshot(
            supabase, result["screenshot_bytes"], user_id, application_id
        )
        if path:
            screenshot_paths.append(path)

    now = datetime.now(timezone.utc).isoformat()
    if result.get("submitted"):
        supabase.table("applications").update({
            "status": "submitted",
            "submission_method": "agent_auto",
            "confirmation_number": result.get("confirmation_number"),
            "confirmation_email": result.get("confirmation_email"),
            "form_responses": result.get("form_responses", {}),
            "submission_log": result.get("submission_log", []),
            "screenshot_paths": screenshot_paths,
            "submitted_at": now,
            "updated_at": now,
        }).eq("id", application_id).execute()
    else:
        _mark_failed(supabase, application_id, "submit returned submitted=False")


async def _upload_screenshot(supabase, png: bytes, user_id: str, application_id: str) -> str | None:
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = f"{user_id}/{application_id}/{ts}_confirmation.png"
    try:
        supabase.storage.from_("generated-documents").upload(
            path, png, file_options={"content-type": "image/png"}
        )
        return path
    except Exception as exc:
        logger.warning("Screenshot upload failed: %s", exc)
        return None


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

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

    # ------------------------------------------------------------------ #
    # 1. Load application + related records
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
    if not job_id:
        _mark_failed(supabase, application_id, "job_id missing from user_jobs")
        return

    job_row = (
        supabase.table("jobs")
        .select("source_url, source_platform, title, description, location, work_mode, company_id")
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

    company_row = (
        supabase.table("companies")
        .select("name")
        .eq("id", job.get("company_id", ""))
        .maybe_single()
        .execute()
    )
    job["company_name"] = company_row.data["name"] if company_row.data else ""

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

    # ------------------------------------------------------------------ #
    # 2. Generate tailored resume (if not already done)
    # ------------------------------------------------------------------ #
    user_job_id = app.get("user_job_id")
    resume_doc_id = app.get("resume_doc_id")
    resume_json: dict = {}
    resume_pdf: bytes | None = None

    if resume_doc_id:
        # Already generated — just fetch the JSON
        existing_doc = (
            supabase.table("generated_documents")
            .select("content_json")
            .eq("id", resume_doc_id)
            .single()
            .execute()
        )
        resume_json = (existing_doc.data or {}).get("content_json") or {}
    elif profile.get("experience") or profile.get("skills"):
        # Auto-generate now
        _set_status(supabase, application_id, "tailoring_resume")
        try:
            from app.services.ai.resume_tailor import tailor_resume
            from app.services.ai.resume_verifier import verify_and_fix
            from app.routers.applications import _render_text

            raw_tailored = tailor_resume(profile, job)
            try:
                tailored, verification = verify_and_fix(profile, raw_tailored, max_cycles=2)
            except Exception as ve:
                logger.warning("Resume verification failed, using raw: %s", ve)
                tailored = raw_tailored
                verification = {"passed": False, "violations": [], "fix_instructions": ""}

            v_status = "passed" if verification.get("passed") else "failed_review"
            content_text = _render_text(tailored, profile)
            resume_json = tailored

            now = datetime.now(timezone.utc).isoformat()
            doc = (
                supabase.table("generated_documents")
                .insert({
                    "user_id": user_id,
                    "user_job_id": user_job_id,
                    "document_type": "resume",
                    "content_json": tailored,
                    "content_text": content_text,
                    "generation_model": "claude-sonnet-4-6",
                    "verification_status": v_status,
                    "verification_notes": verification.get("violations", []),
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
            logger.warning("Resume tailoring failed, continuing without: %s", exc)

    if resume_json:
        try:
            from app.services.documents.resume_builder import build_pdf
            resume_pdf = build_pdf(resume_json, profile.get("full_name") or "")
        except Exception as exc:
            logger.warning("PDF generation failed, continuing without: %s", exc)

    # ------------------------------------------------------------------ #
    # 3. Generate cover letter (if not already done)
    # ------------------------------------------------------------------ #
    cover_letter_doc_id = app.get("cover_letter_doc_id")
    cover_letter_text = ""

    if cover_letter_doc_id:
        existing_cl = (
            supabase.table("generated_documents")
            .select("content_text")
            .eq("id", cover_letter_doc_id)
            .single()
            .execute()
        )
        cover_letter_text = (existing_cl.data or {}).get("content_text") or ""
    elif profile.get("experience") or profile.get("skills"):
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
            logger.warning("Cover letter generation failed, continuing without: %s", exc)

    # ------------------------------------------------------------------ #
    # 4. Submit via Playwright
    # ------------------------------------------------------------------ #
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

"""
JobScout AI — Local Browser Agent
==================================
Runs on your machine. Polls Supabase for applications that are
ready_to_submit, opens a real browser window, and uses Claude computer
use to fill & submit the form on any ATS platform.

Quick start
-----------
1.  cd apps/api
2.  pip install -r requirements.txt
    playwright install chromium

3.  Copy the values from your .env file and set them in your shell:

        export SUPABASE_URL=https://xxxx.supabase.co
        export SUPABASE_SERVICE_ROLE_KEY=eyJ...
        export ANTHROPIC_API_KEY=sk-ant-...
        export AGENT_USER_ID=<your Supabase auth user UUID>

4.  python -m app.agent.local_runner

Optional env vars
-----------------
HEADLESS=true          Run browser headlessly (default: false — you see it)
POLL_INTERVAL=30       Seconds between Supabase polls (default: 30)
USE_FAST_PATH=true     Try Greenhouse/Lever CSS fillers first (default: true)
"""
from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import sys
from datetime import datetime, timezone


def _load_agent_env() -> None:
    """Auto-load jobscout-agent.env (or .env) from cwd or parent dirs."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return  # python-dotenv not installed; fall through to env vars

    for name in ("jobscout-agent.env", ".env"):
        for directory in (pathlib.Path.cwd(), pathlib.Path.cwd().parent):
            candidate = directory / name
            if candidate.exists():
                load_dotenv(candidate, override=True)
                return


_load_agent_env()


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("local_runner")

HEADLESS = os.environ.get("HEADLESS", "false").lower() == "true"
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", "30"))
USE_FAST_PATH = os.environ.get("USE_FAST_PATH", "true").lower() == "true"


# ------------------------------------------------------------------ #
# Supabase helpers
# ------------------------------------------------------------------ #

def _get_supabase():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _set_status(supabase, app_id: str, status: str) -> None:
    supabase.table("applications").update({
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", app_id).execute()


def _mark_failed(supabase, app_id: str, reason: str) -> None:
    supabase.table("applications").update({
        "status": "submit_failed",
        "submission_log": [{"action": "error", "detail": reason, "ok": False}],
        "live_screenshot_path": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", app_id).execute()
    logger.error("✗  Application %s failed: %s", app_id, reason)


def _mark_more_info_needed(
    supabase, app_id: str, user_id: str, job_title: str, company_name: str, questions: list[str]
) -> None:
    supabase.table("applications").update({
        "status": "more_info_needed",
        "missing_questions": questions,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", app_id).execute()

    # Create in-app notification
    try:
        q_preview = "; ".join(
            q.split("|")[-1].strip() for q in questions[:2]
        )
        supabase.table("notifications").insert({
            "user_id": user_id,
            "event_type": "more_info_needed",
            "title": "More information needed",
            "body": f"Agent paused on {job_title} @ {company_name}. Needed: {q_preview}",
            "action_url": f"/applications/{app_id}",
            "related_application_id": app_id,
            "priority": "high",
        }).execute()
    except Exception as exc:
        logger.warning("Could not create notification: %s", exc)

    logger.info("⚠  Application %s needs more info: %s", app_id, questions)


async def _upload_screenshot(supabase, png: bytes, user_id: str, app_id: str) -> str | None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = f"{user_id}/{app_id}/{ts}_confirmation.png"
    try:
        supabase.storage.from_("generated-documents").upload(
            path, png, file_options={"content-type": "image/png"}
        )
        return path
    except Exception as exc:
        logger.warning("Screenshot upload failed: %s", exc)
        return None


# ------------------------------------------------------------------ #
# Core submission logic
# ------------------------------------------------------------------ #

async def process_application(supabase, app: dict) -> None:
    app_id = app["id"]
    user_id = app["user_id"]
    user_job_id = app.get("user_job_id")

    logger.info("─── Processing application %s ───", app_id)

    # Guard: don't submit without a resume doc — something went wrong upstream
    if not app.get("resume_doc_id"):
        logger.warning("  Skipping %s — no resume_doc_id (docs may not have been generated yet)", app_id)
        return

    _set_status(supabase, app_id, "submitting")

    # ── Fetch job ──
    uj = supabase.table("user_jobs").select("job_id").eq("id", user_job_id).single().execute()
    if not uj.data:
        _mark_failed(supabase, app_id, "user_job not found")
        return
    job_id = uj.data["job_id"]

    job_row = (
        supabase.table("jobs")
        .select("source_url, source_platform, title, description, location, work_mode, company_id")
        .eq("id", job_id)
        .single()
        .execute()
    )
    if not job_row.data:
        _mark_failed(supabase, app_id, "job not found")
        return
    job = job_row.data

    co = supabase.table("companies").select("name").eq("id", job.get("company_id", "")).limit(1).execute()
    co_data = (co.data or [])[0] if co.data else None
    job["company_name"] = co_data["name"] if co_data else ""

    platform = job.get("source_platform") or ""
    apply_url = job.get("source_url") or ""
    if not apply_url:
        _mark_failed(supabase, app_id, "no source_url on job")
        return

    logger.info("  Job     : %s @ %s", job.get("title"), job["company_name"])
    logger.info("  Platform: %s", platform)
    logger.info("  URL     : %s", apply_url)

    # ── Fetch profile ──
    prof_row = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if not prof_row.data:
        _mark_failed(supabase, app_id, "profile not found")
        return
    profile = prof_row.data

    # ── Fetch saved Q&A answers ──
    ans = supabase.table("application_answers").select("question_key, answer").eq("user_id", user_id).execute()
    saved_answers = {r["question_key"]: r["answer"] for r in (ans.data or [])}

    # ── Build PDF from stored resume JSON ──
    resume_pdf_bytes: bytes | None = None
    if app.get("resume_doc_id"):
        doc = supabase.table("generated_documents").select("content_json").eq("id", app["resume_doc_id"]).single().execute()
        if doc.data and doc.data.get("content_json"):
            try:
                from app.services.documents.resume_builder import build_pdf
                resume_pdf_bytes = build_pdf(doc.data["content_json"], profile.get("full_name") or "")
                logger.info("  Resume PDF built (%d bytes)", len(resume_pdf_bytes))
            except Exception as exc:
                logger.warning("  PDF build failed (will continue without): %s", exc)

    # ── Fetch cover letter text ──
    cover_letter_text = ""
    if app.get("cover_letter_doc_id"):
        cl = supabase.table("generated_documents").select("content_text").eq("id", app["cover_letter_doc_id"]).single().execute()
        cover_letter_text = (cl.data or {}).get("content_text") or ""
        logger.info("  Cover letter: %d chars", len(cover_letter_text))

    # ── Open browser & submit ──
    from app.agent.browser import get_page

    async with get_page(headless=HEADLESS) as (_, __, page):
        try:
            filler = _choose_filler(
                platform=platform,
                page=page,
                profile=profile,
                saved_answers=saved_answers,
                apply_url=apply_url,
                cover_letter_text=cover_letter_text,
                resume_pdf_bytes=resume_pdf_bytes,
                job=job,
                supabase=supabase,
                user_id=user_id,
                app_id=app_id,
            )
            logger.info("  Filler  : %s", type(filler).__name__)
            await filler.fill()
            result = await filler.submit_with_proof()
        except Exception as exc:
            logger.exception("  Filler raised: %s", exc)
            _mark_failed(supabase, app_id, str(exc))
            return

    # ── More information needed ──
    if result.get("missing_info"):
        questions = result.get("missing_questions") or []
        _mark_more_info_needed(
            supabase, app_id, user_id,
            job.get("title", "this role"), job.get("company_name", "the company"),
            questions,
        )
        return

    # ── Clear live screenshot ──
    try:
        supabase.table("applications").update(
            {"live_screenshot_path": None}
        ).eq("id", app_id).execute()
    except Exception:
        pass

    # ── Persist result ──
    screenshot_paths: list[str] = []
    if result.get("screenshot_bytes"):
        path = await _upload_screenshot(supabase, result["screenshot_bytes"], user_id, app_id)
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
        }).eq("id", app_id).execute()
        logger.info("  ✓  Submitted! confirmation=%s", result.get("confirmation_number"))
    else:
        _mark_failed(supabase, app_id, "filler reported submitted=False")


def _choose_filler(platform, page, profile, saved_answers, apply_url,
                   cover_letter_text, resume_pdf_bytes, job,
                   supabase=None, user_id=None, app_id=None):
    """
    Tier 1: Playwright CSS filler for Greenhouse/Lever (zero AI cost).
            The filler auto-detects company-hosted embeds (e.g. stripe.com?gh_jid=...)
            and navigates to the canonical board URL automatically.
    Tier 2: answer_resolver uses Claude Haiku only for individual unknown questions.
    Tier 3: Claude computer-use (Haiku, 15 iterations) as absolute last resort.
    """
    if USE_FAST_PATH and platform == "greenhouse":
        try:
            from app.agent.adapters.greenhouse_filler import GreenhouseFiller
            logger.info("  Using GreenhouseFiller (script-based, zero AI cost for form fill)")
            return GreenhouseFiller(
                page=page,
                profile=profile,
                saved_answers=saved_answers,
                apply_url=apply_url,
                cover_letter_text=cover_letter_text,
                resume_pdf_bytes=resume_pdf_bytes,
                company_name=job.get("company_name", ""),
            )
        except Exception as exc:
            logger.warning("GreenhouseFiller init failed, falling back to computer use: %s", exc)

    if USE_FAST_PATH and platform == "lever":
        try:
            from app.agent.registry import get_filler
            return get_filler(
                platform=platform,
                page=page,
                profile=profile,
                saved_answers=saved_answers,
                apply_url=apply_url,
                cover_letter_text=cover_letter_text,
                resume_pdf_bytes=resume_pdf_bytes,
            )
        except Exception as exc:
            logger.warning("LeverFiller init failed, falling back to computer use: %s", exc)

    # Last resort: Claude computer-use (cheap Haiku model, capped at 15 iterations)
    logger.info("  Falling back to ComputerUseFiller (platform=%s)", platform)
    from app.agent.computer_use_filler import ComputerUseFiller
    return ComputerUseFiller(
        page=page,
        profile=profile,
        apply_url=apply_url,
        cover_letter_text=cover_letter_text,
        resume_pdf_bytes=resume_pdf_bytes,
        job=job,
        supabase=supabase,
        user_id=user_id,
        app_id=app_id,
    )


# ------------------------------------------------------------------ #
# Polling loop
# ------------------------------------------------------------------ #

async def run(user_id: str) -> None:
    supabase = _get_supabase()
    logger.info("=" * 55)
    logger.info("  JobScout AI — Local Browser Agent")
    logger.info("  User     : %s", user_id)
    logger.info("  Headless : %s", HEADLESS)
    logger.info("  Interval : %ds", POLL_INTERVAL)
    logger.info("=" * 55)

    while True:
        try:
            rows = (
                supabase.table("applications")
                .select("id, user_id, user_job_id, resume_doc_id, cover_letter_doc_id, status")
                .eq("user_id", user_id)
                .eq("status", "ready_to_submit")
                .execute()
            )
            apps = rows.data or []
            if apps:
                logger.info("Found %d application(s) ready to submit", len(apps))
                for app in apps:
                    await process_application(supabase, app)
            else:
                logger.info("No pending applications — sleeping %ds…", POLL_INTERVAL)
        except Exception as exc:
            logger.error("Poll loop error: %s", exc, exc_info=True)

        await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    missing = [v for v in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "AGENT_USER_ID") if not os.environ.get(v)]
    if missing:
        print(f"ERROR: Missing environment variables: {', '.join(missing)}")
        print()
        print("Set them from your apps/api/.env file, e.g.:")
        for v in missing:
            print(f"  export {v}=...")
        sys.exit(1)

    asyncio.run(run(os.environ["AGENT_USER_ID"]))

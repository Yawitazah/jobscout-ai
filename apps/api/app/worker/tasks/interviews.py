from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_supabase():
    from app.config import get_settings
    from app.db.supabase_client import get_supabase_service_client
    return get_supabase_service_client(get_settings())


@celery_app.task(name="app.worker.tasks.interviews.create_interview_task")
def create_interview_task(message_id: str) -> None:
    supabase = _get_supabase()

    msg_row = (
        supabase.table("inbox_messages")
        .select("*")
        .eq("id", message_id)
        .single()
        .execute()
    )
    if not msg_row.data:
        return

    msg = msg_row.data
    app_id = msg.get("application_id")
    if not app_id:
        logger.warning("create_interview_task: message %s has no application_id", message_id)
        return

    extracted = msg.get("extracted_data") or {}
    confirmed_time = extracted.get("confirmed_time")
    status = "scheduled" if confirmed_time else "proposed"

    count_row = (
        supabase.table("interviews")
        .select("id", count="exact")
        .eq("application_id", app_id)
        .execute()
    )
    round_number = (count_row.count or 0) + 1

    now = datetime.now(timezone.utc).isoformat()
    inserted = (
        supabase.table("interviews")
        .insert({
            "user_id": msg["user_id"],
            "application_id": app_id,
            "source_message_id": message_id,
            "round_name": extracted.get("round_name"),
            "round_number": round_number,
            "scheduled_at": confirmed_time,
            "duration_minutes": extracted.get("duration_minutes"),
            "format": extracted.get("format", "unknown"),
            "meeting_link": extracted.get("meeting_link"),
            "interviewer_names": extracted.get("interviewer_names", []),
            "interviewer_emails": extracted.get("interviewer_emails", []),
            "status": status,
            "created_at": now,
            "updated_at": now,
        })
        .select("id")
        .execute()
    )

    if not inserted.data:
        logger.error("Failed to insert interview for message %s", message_id)
        return

    interview_id = inserted.data[0]["id"]

    new_app_status = "interview_scheduled" if status == "scheduled" else "interview_proposed"
    supabase.table("applications").update({
        "status": new_app_status,
        "updated_at": now,
    }).eq("id", app_id).execute()

    supabase.table("application_events").insert({
        "user_id": msg["user_id"],
        "application_id": app_id,
        "event_type": "interview_scheduled" if status == "scheduled" else "interview_proposed",
        "event_data": {"interview_id": interview_id, "round_number": round_number},
        "occurred_at": now,
    }).execute()

    if status == "scheduled":
        generate_interview_prep.delay(interview_id)
        sync_interview_to_calendar.delay(interview_id)


@celery_app.task(name="app.worker.tasks.interviews.generate_interview_prep")
def generate_interview_prep(interview_id: str) -> None:
    from app.services.ai.interview_prep import generate_prep_packet

    supabase = _get_supabase()

    interview_row = (
        supabase.table("interviews")
        .select("*, application:applications(user_id, user_jobs(job:jobs(title, company:companies(name))))")
        .eq("id", interview_id)
        .single()
        .execute()
    )
    if not interview_row.data:
        return

    interview = interview_row.data
    app = interview.get("application") or {}
    user_job = app.get("user_jobs") or {}
    job = user_job.get("job") or {}
    company = job.get("company") or {}

    profile_row = (
        supabase.table("profiles")
        .select("*")
        .eq("id", app.get("user_id", ""))
        .single()
        .execute()
    )
    if not profile_row.data:
        return

    try:
        prep = generate_prep_packet(
            profile=profile_row.data,
            company_name=company.get("name", ""),
            job_title=job.get("title", ""),
            round_name=interview.get("round_name"),
        )
        supabase.table("interviews").update({
            "preparation_notes": prep,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", interview_id).execute()
    except Exception as exc:
        logger.exception("Interview prep generation failed for %s: %s", interview_id, exc)


@celery_app.task(name="app.worker.tasks.interviews.sync_interview_to_calendar")
def sync_interview_to_calendar(interview_id: str) -> None:
    from app.services.calendar_export import generate_ics_for_interview

    supabase = _get_supabase()

    interview_row = (
        supabase.table("interviews")
        .select("*, application:applications(user_id, user_jobs(job:jobs(title, company:companies(name))))")
        .eq("id", interview_id)
        .single()
        .execute()
    )
    if not interview_row.data:
        return

    interview = interview_row.data
    app = interview.get("application") or {}
    user_job = app.get("user_jobs") or {}
    job = user_job.get("job") or {}
    company = job.get("company") or {}

    if not interview.get("scheduled_at"):
        return

    try:
        ics_bytes = generate_ics_for_interview(
            interview=interview,
            application=app,
            company_name=company.get("name", ""),
            job_title=job.get("title", ""),
        )
        path = f"calendar/{interview['user_id']}/{interview_id}.ics"
        supabase.storage.from_("generated-documents").upload(
            path,
            ics_bytes,
            file_options={"content-type": "text/calendar"},
        )
        supabase.table("interviews").update({
            "calendar_event_id": path,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", interview_id).execute()
    except Exception as exc:
        logger.exception("Calendar sync failed for interview %s: %s", interview_id, exc)

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_supabase():
    from app.config import get_settings
    from app.db.supabase_client import get_supabase_service_client
    return get_supabase_service_client(get_settings())


@celery_app.task(name="app.worker.tasks.inbox.sync_all_inboxes")
def sync_all_inboxes() -> None:
    supabase = _get_supabase()
    conns = (
        supabase.table("email_connections")
        .select("id")
        .eq("is_active", True)
        .execute()
    )
    for row in conns.data or []:
        sync_inbox.delay(row["id"])


@celery_app.task(
    name="app.worker.tasks.inbox.sync_inbox",
    bind=True,
    max_retries=2,
)
def sync_inbox(self, connection_id: str) -> dict:
    from app.services.google_gmail import GmailClient, should_skip_message

    try:
        supabase = _get_supabase()
        conn_row = (
            supabase.table("email_connections")
            .select("*")
            .eq("id", connection_id)
            .single()
            .execute()
        )
        if not conn_row.data:
            return {"status": "not_found"}

        conn = conn_row.data
        client = GmailClient(conn)
        client.refresh_if_needed(supabase)

        if conn.get("history_id"):
            msg_ids, new_hist_id = client.list_history_since(conn["history_id"])
        else:
            from_ts = datetime.now(timezone.utc) - timedelta(days=30)
            msg_ids = client.list_messages_in_range(from_ts)
            new_hist_id = None

        ingested = 0
        for msg_id in msg_ids:
            existing = (
                supabase.table("inbox_messages")
                .select("id")
                .eq("connection_id", connection_id)
                .eq("provider_message_id", msg_id)
                .execute()
            )
            if existing.data:
                continue

            parsed = client.get_message(msg_id)
            if not parsed:
                continue

            if should_skip_message(parsed):
                continue

            now = datetime.now(timezone.utc).isoformat()
            row_data = {
                "user_id": conn["user_id"],
                "connection_id": connection_id,
                "provider_message_id": parsed.id,
                "thread_id": parsed.thread_id,
                "from_address": parsed.from_address,
                "from_name": parsed.from_name,
                "to_address": parsed.to_address,
                "subject": parsed.subject,
                "snippet": parsed.snippet,
                "body_text": parsed.body_text[:50000],
                "body_html": parsed.body_html[:100000],
                "received_at": parsed.received_at.isoformat(),
                "classification": "unclassified",
                "created_at": now,
            }

            inserted = (
                supabase.table("inbox_messages")
                .insert(row_data)
                .select("id")
                .execute()
            )
            if inserted.data:
                process_message.delay(inserted.data[0]["id"])
                ingested += 1

        update_payload: dict = {"last_synced_at": datetime.now(timezone.utc).isoformat()}
        if new_hist_id:
            update_payload["history_id"] = new_hist_id

        supabase.table("email_connections").update(update_payload).eq("id", connection_id).execute()
        return {"status": "ok", "ingested": ingested}

    except Exception as exc:
        logger.exception("sync_inbox failed for %s: %s", connection_id, exc)
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.worker.tasks.inbox.process_message")
def process_message(message_id: str) -> None:
    from app.services.email_matcher import match_email_to_application
    from app.services.ai.email_classifier import classify_email

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

    app_id, confidence = match_email_to_application(supabase, msg)
    if app_id:
        supabase.table("inbox_messages").update({
            "application_id": app_id,
        }).eq("id", message_id).execute()
        msg["application_id"] = app_id

        supabase.table("application_events").insert({
            "user_id": msg["user_id"],
            "application_id": app_id,
            "event_type": "email_received",
            "event_data": {
                "message_id": message_id,
                "subject": msg.get("subject", ""),
                "from_address": msg.get("from_address", ""),
                "match_confidence": confidence,
            },
        }).execute()

    app = None
    if app_id:
        app_row = (
            supabase.table("applications")
            .select("*, user_jobs(job:jobs(title, company:companies(name)))")
            .eq("id", app_id)
            .single()
            .execute()
        )
        app = app_row.data

    result = classify_email(msg, app)
    now = datetime.now(timezone.utc).isoformat()

    supabase.table("inbox_messages").update({
        "classification": result.get("classification", "unknown"),
        "classification_confidence": result.get("confidence", "low"),
        "extracted_data": result.get("extracted", {}),
        "classified_at": now,
    }).eq("id", message_id).execute()

    classification = result.get("classification")

    if classification == "interview_request" and app_id:
        from app.worker.tasks.interviews import create_interview_task
        create_interview_task.delay(message_id)

    elif classification == "rejection" and app_id:
        _update_application_status(supabase, app_id, "closed_rejected")

    elif classification == "offer" and app_id:
        _update_application_status(supabase, app_id, "offer_received")

    if result.get("requires_user_attention") and app_id:
        _create_notification(supabase, msg["user_id"], result, app_id)


def _update_application_status(supabase, app_id: str, status: str) -> None:
    supabase.table("applications").update({
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", app_id).execute()


def _create_notification(supabase, user_id: str, result: dict, app_id: str) -> None:
    classification = result.get("classification", "unknown")
    priority_map = {
        "interview_request": "high",
        "offer": "urgent",
        "rejection": "low",
        "request_info": "normal",
    }
    title_map = {
        "interview_request": "Interview requested",
        "offer": "Offer received",
        "rejection": "Application closed",
        "request_info": "Recruiter needs more info",
    }
    priority = priority_map.get(classification, "normal")
    title = title_map.get(classification, "New recruiter email")
    body = result.get("suggested_action")

    supabase.table("notifications").insert({
        "user_id": user_id,
        "event_type": classification,
        "title": title,
        "body": body,
        "action_url": f"/applications/{app_id}",
        "related_application_id": app_id,
        "priority": priority,
    }).execute()


@celery_app.task(name="app.worker.tasks.inbox.send_daily_digests")
def send_daily_digests() -> None:
    from app.services.notify import send_digest_for_due_users
    send_digest_for_due_users()

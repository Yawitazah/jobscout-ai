from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def create_notification(
    supabase,
    user_id: str,
    event_type: str,
    title: str,
    body: str | None = None,
    action_url: str | None = None,
    application_id: str | None = None,
    priority: str = "normal",
) -> None:
    supabase.table("notifications").insert({
        "user_id": user_id,
        "event_type": event_type,
        "title": title,
        "body": body,
        "action_url": action_url,
        "related_application_id": application_id,
        "priority": priority,
    }).execute()


def send_digest_for_due_users() -> None:
    """Find users whose digest time is within the current 15-min window and send."""
    from app.config import get_settings
    from app.db.supabase_client import get_supabase_service_client

    supabase = get_supabase_service_client(get_settings())

    prefs_row = (
        supabase.table("notification_preferences")
        .select("user_id, email_digest_time, email_timezone, email_enabled")
        .eq("email_enabled", True)
        .execute()
    )

    now_utc = datetime.now(timezone.utc)
    resend_key = os.environ.get("RESEND_API_KEY")

    for pref in prefs_row.data or []:
        if not _is_digest_due(pref, now_utc):
            continue
        try:
            _send_digest(supabase, pref["user_id"], resend_key)
        except Exception as exc:
            logger.exception("Digest failed for user %s: %s", pref["user_id"], exc)


def _is_digest_due(pref: dict, now_utc: datetime) -> bool:
    import zoneinfo
    tz_str = pref.get("email_timezone") or "America/New_York"
    try:
        tz = zoneinfo.ZoneInfo(tz_str)
    except Exception:
        tz = zoneinfo.ZoneInfo("America/New_York")

    now_local = now_utc.astimezone(tz)
    digest_time_str = pref.get("email_digest_time") or "08:00:00"
    try:
        h, m, *_ = digest_time_str.split(":")
        digest_hour, digest_minute = int(h), int(m)
    except Exception:
        return False

    local_hour = now_local.hour
    local_minute = now_local.minute

    # Within the 15-min window
    total_local = local_hour * 60 + local_minute
    total_digest = digest_hour * 60 + digest_minute
    return 0 <= total_local - total_digest < 15


def _send_digest(supabase, user_id: str, resend_key: str | None) -> None:
    if not resend_key:
        logger.info("RESEND_API_KEY not set — skipping digest for %s", user_id)
        return

    profile_row = supabase.table("profiles").select("full_name, email").eq("id", user_id).single().execute()
    if not profile_row.data:
        return
    profile = profile_row.data
    user_email = profile.get("email")
    if not user_email:
        return

    unread = (
        supabase.table("notifications")
        .select("id, title, body, action_url, event_type, created_at")
        .eq("user_id", user_id)
        .is_("sent_email_at", "null")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    notifications = unread.data or []
    if not notifications:
        return

    queue_count = (
        supabase.table("user_jobs")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .execute()
    ).count or 0

    html = _build_digest_html(profile.get("full_name") or "there", notifications, queue_count)
    plain = _build_digest_plain(profile.get("full_name") or "there", notifications, queue_count)

    import httpx
    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
        json={
            "from": "JobScout AI <noreply@jobscout.ai>",
            "to": [user_email],
            "subject": f"Your JobScout summary — {len(notifications)} update{'s' if len(notifications) != 1 else ''}",
            "html": html,
            "text": plain,
        },
    )
    if resp.status_code == 200:
        ids = [n["id"] for n in notifications]
        supabase.table("notifications").update(
            {"sent_email_at": datetime.now(timezone.utc).isoformat()}
        ).in_("id", ids).execute()
    else:
        logger.warning("Resend returned %s: %s", resp.status_code, resp.text[:200])


def _build_digest_html(name: str, notifications: list[dict], queue_count: int) -> str:
    items_html = "".join(
        f"<li><strong>{n['title']}</strong>"
        f"{': ' + n['body'] if n.get('body') else ''}"
        f"</li>"
        for n in notifications
    )
    return f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <h2>Hi {name},</h2>
    <p>Here's your JobScout update:</p>
    <h3>Updates ({len(notifications)})</h3>
    <ul>{items_html}</ul>
    {"<h3>Queue</h3><p>" + str(queue_count) + " new matches waiting for your review.</p>" if queue_count else ""}
    <p><a href="https://jobscout.ai/dashboard">Open JobScout AI</a></p>
    <p style="color:#999;font-size:12px">You're receiving this because you enabled email digests.
    <a href="https://jobscout.ai/settings/notifications">Change preferences</a></p>
    </body></html>
    """


def _build_digest_plain(name: str, notifications: list[dict], queue_count: int) -> str:
    lines = [f"Hi {name},", "", "Your JobScout update:", ""]
    for n in notifications:
        line = f"- {n['title']}"
        if n.get("body"):
            line += f": {n['body']}"
        lines.append(line)
    if queue_count:
        lines += ["", f"{queue_count} new matches waiting in your queue."]
    lines += ["", "Open JobScout AI: https://jobscout.ai/dashboard"]
    return "\n".join(lines)

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ATS platform domains that host application emails but don't identify the company
ATS_DOMAINS = {
    "greenhouse-mail.io",
    "hire.lever.co",
    "myworkday.com",
    "workday.com",
    "taleo.net",
    "icims.com",
    "smartrecruiters.com",
    "ashbyhq.com",
    "jobvite.com",
    "bamboohr.com",
    "rippling.com",
}


def match_email_to_application(supabase, message: dict) -> tuple[str | None, str | None]:
    """Return (application_id, confidence) or (None, None)."""
    user_id = message.get("user_id")
    if not user_id:
        return None, None

    apps = _fetch_active_applications(supabase, user_id)
    if not apps:
        return None, None

    from_address = (message.get("from_address") or "").lower()
    from_domain = _extract_domain(from_address)
    subject_lower = (message.get("subject") or "").lower()
    thread_id = message.get("thread_id")
    body_lower = ((message.get("body_text") or "")[:500]).lower()

    # 1. From-domain match (non-ATS)
    if from_domain and from_domain not in ATS_DOMAINS:
        for app in apps:
            company_domain = _extract_domain(app.get("company_website") or "")
            if company_domain and company_domain == from_domain:
                return app["id"], "high"

    # 2. Thread continuation
    if thread_id:
        prev = (
            supabase.table("inbox_messages")
            .select("application_id")
            .eq("thread_id", thread_id)
            .not_.is_("application_id", "null")
            .order("received_at", desc=True)
            .limit(1)
            .execute()
        )
        if prev.data and prev.data[0].get("application_id"):
            return prev.data[0]["application_id"], "high"

    # 3. ATS domain + subject matching
    if from_domain in ATS_DOMAINS:
        for app in apps:
            cname = (app.get("company_name") or "").lower()
            jtitle = (app.get("job_title") or "").lower()
            if cname and jtitle and cname in subject_lower and jtitle in subject_lower:
                return app["id"], "medium"
            if cname and cname in subject_lower:
                return app["id"], "medium"

    # 4. Subject match (both company + title)
    for app in apps:
        cname = (app.get("company_name") or "").lower()
        jtitle = (app.get("job_title") or "").lower()
        if cname and jtitle and cname in subject_lower and jtitle in subject_lower:
            return app["id"], "medium"

    # 5. Company name in subject only
    for app in apps:
        cname = (app.get("company_name") or "").lower()
        if cname and len(cname) > 3 and cname in subject_lower:
            return app["id"], "medium"

    # 6. Body mention (low confidence — don't auto-link)
    # Return None so we don't create false associations
    return None, None


def _fetch_active_applications(supabase, user_id: str) -> list[dict]:
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()

    result = (
        supabase.table("applications")
        .select("""
            id,
            status,
            user_jobs (
                job:jobs (
                    title,
                    company:companies ( name, website )
                )
            )
        """)
        .eq("user_id", user_id)
        .neq("status", "withdrawn")
        .gte("created_at", cutoff)
        .execute()
    )

    apps = []
    for row in result.data or []:
        user_job = row.get("user_jobs") or {}
        job = user_job.get("job") or {}
        company = job.get("company") or {}
        apps.append({
            "id": row["id"],
            "status": row["status"],
            "company_name": company.get("name", ""),
            "company_website": company.get("website", ""),
            "job_title": job.get("title", ""),
        })
    return apps


def _extract_domain(value: str) -> str:
    """Extract bare domain from email address or URL."""
    if not value:
        return ""
    # Try as email
    if "@" in value:
        return value.split("@")[-1].lower().strip()
    # Try as URL
    try:
        parsed = urlparse(value if "://" in value else f"https://{value}")
        host = parsed.hostname or ""
        # Strip www.
        return re.sub(r"^www\.", "", host).lower()
    except Exception:
        return value.lower()

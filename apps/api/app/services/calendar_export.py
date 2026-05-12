from __future__ import annotations

from datetime import datetime, timedelta, timezone

from icalendar import Calendar, Event


def generate_ics_for_interview(
    interview: dict,
    application: dict,
    company_name: str,
    job_title: str,
) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//JobScout AI//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "REQUEST")

    ev = Event()

    round_name = interview.get("round_name") or "Interview"
    ev.add("summary", f"{round_name}: {company_name} — {job_title}")

    scheduled_at_raw = interview.get("scheduled_at")
    if scheduled_at_raw:
        scheduled_at = datetime.fromisoformat(scheduled_at_raw.replace("Z", "+00:00"))
    else:
        scheduled_at = datetime.now(timezone.utc)

    duration_min = interview.get("duration_minutes") or 60
    ev.add("dtstart", scheduled_at)
    ev.add("dtend", scheduled_at + timedelta(minutes=duration_min))

    meeting_link = interview.get("meeting_link") or ""
    ev.add("location", meeting_link)

    description_parts = [
        f"Company: {company_name}",
        f"Role: {job_title}",
        f"Round: {round_name}",
        f"Format: {interview.get('format', 'unknown')}",
    ]
    if meeting_link:
        description_parts.append(f"Link: {meeting_link}")
    interviewer_names = interview.get("interviewer_names") or []
    if interviewer_names:
        description_parts.append(f"Interviewers: {', '.join(interviewer_names)}")
    prep = interview.get("preparation_notes")
    if prep:
        description_parts.append(f"\nPrep notes:\n{prep[:500]}")

    ev.add("description", "\n".join(description_parts))
    ev.add("uid", f"interview-{interview['id']}@jobscout.ai")

    cal.add_component(ev)
    return bytes(cal.to_ical())

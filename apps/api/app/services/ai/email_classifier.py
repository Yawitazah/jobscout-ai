from __future__ import annotations

import json
import logging
import os

import anthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You classify recruiting emails. Given the email and the user's application context, identify
the message type and extract useful data points.

Categories:

application_ack:
  Automated confirmation that the application was received. E.g., 'We received your application'.

interview_request:
  A recruiter or hiring manager asks to schedule an interview, proposes specific times,
  or invites to a screening call. Includes 'I'd like to set up a call' wording.

interview_followup:
  Confirmation of a scheduled time, calendar invite, prep info, or post-interview communication.

request_info:
  Asks the candidate for additional information: portfolio, references, assignment,
  salary expectation, etc.

rejection:
  The candidate is no longer being considered. Phrasings vary: 'unfortunately',
  'we have decided to move forward with other', 'position has been filled'.

offer:
  Offer letter or offer details, salary numbers, start dates.

withdrawn:
  The position is no longer open / req cancelled.

irrelevant:
  Not related to a job application (mass marketing, newsletter, generic recruiter
  outreach to a different role).

unknown:
  Cannot confidently determine.

Extract these fields when present:

For interview_request and interview_followup:
  proposed_times: list of ISO datetimes or natural language slots
  confirmed_time: ISO datetime if a specific time is locked
  duration_minutes: integer if mentioned
  format: 'phone' | 'video' | 'onsite' | 'take_home' | 'unknown'
  meeting_link: URL if provided
  interviewer_names: list of strings
  interviewer_emails: list of strings
  round_name: string if discernible
  preparation_topics: list of strings if mentioned

For offer:
  base_salary: number or null
  total_comp: number or null
  equity_mentioned: boolean
  start_date_proposed: ISO date if mentioned
  response_deadline: ISO date if mentioned

For request_info:
  info_requested: list of strings
  deadline: ISO date if mentioned

For rejection:
  feedback_provided: boolean
  encouragement_to_reapply: boolean

Output JSON exactly:
{
  "classification": <category>,
  "confidence": "low" | "medium" | "high",
  "reasoning": "<one short sentence>",
  "extracted": {},
  "requires_user_attention": <boolean>,
  "suggested_action": <string or null>
}

Return only valid JSON, no markdown, no commentary.
"""


def classify_email(message: dict, application: dict | None) -> dict:
    company_name = ""
    job_title = ""
    submitted_at = ""
    app_status = ""

    if application:
        user_job = application.get("user_jobs") or {}
        job = user_job.get("job") or {}
        company = job.get("company") or {}
        company_name = company.get("name", "")
        job_title = job.get("title", "")
        submitted_at = application.get("submitted_at", "")
        app_status = application.get("status", "")

    body = (message.get("body_text") or message.get("snippet") or "")[:8000]

    user_msg = (
        f"APPLICATION CONTEXT:\n"
        f"Company: {company_name or 'unknown'}\n"
        f"Role: {job_title or 'unknown'}\n"
        f"Submitted: {submitted_at or 'unknown'}\n"
        f"Current status: {app_status or 'unknown'}\n\n"
        f"EMAIL:\n"
        f"From: {message.get('from_name', '')} <{message.get('from_address', '')}>\n"
        f"Subject: {message.get('subject', '')}\n"
        f"Received: {message.get('received_at', '')}\n\n"
        f"Body:\n{body}"
    )

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = resp.content[0].text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        logger.warning("Email classifier returned non-JSON: %s", text[:200])
        return {
            "classification": "unknown",
            "confidence": "low",
            "reasoning": "Failed to parse classifier output",
            "extracted": {},
            "requires_user_attention": False,
            "suggested_action": None,
        }

from __future__ import annotations

import json
import logging
import os

import anthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are filling out a job application form on behalf of a candidate.
Given the form question and the candidate's profile + saved answers, provide the best answer.

Rules:
- Only use information from the candidate's profile or saved answers.
- If the answer is not in the profile, return null.
- Keep answers concise and professional.
- For yes/no questions, return "Yes" or "No".
- For numeric questions, return only the number.

Output JSON exactly:
{
  "answer": "the answer string, or null if unknown",
  "confidence": "high" | "medium" | "low",
  "source": "profile" | "saved_answers" | "inferred" | "unknown"
}
"""


def resolve_answer(
    question_text: str,
    question_key: str,
    profile: dict,
    saved_answers: dict[str, str],
) -> dict:
    if question_key in saved_answers:
        return {
            "answer": saved_answers[question_key],
            "confidence": "high",
            "source": "saved_answers",
        }

    user_msg = (
        f"QUESTION KEY: {question_key}\n"
        f"QUESTION TEXT: {question_text}\n\n"
        f"CANDIDATE PROFILE:\n{json.dumps(_slim(profile), indent=2)}\n\n"
        f"SAVED ANSWERS:\n{json.dumps(saved_answers, indent=2)}"
    )

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = resp.content[0].text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def _slim(profile: dict) -> dict:
    return {
        "full_name": profile.get("full_name"),
        "email": profile.get("resume_email") or profile.get("email"),
        "phone": profile.get("phone"),
        "location": profile.get("location"),
        "linkedin_url": profile.get("linkedin_url"),
        "github_url": profile.get("github_url"),
        "portfolio_url": profile.get("portfolio_url"),
        "summary": profile.get("summary"),
        "additional_context": profile.get("additional_context"),
        "skills": profile.get("skills", [])[:20],
        "experience": [
            {
                "title": e.get("title"),
                "company": e.get("company"),
                "start_date": e.get("start_date"),
                "end_date": e.get("end_date"),
            }
            for e in (profile.get("experience") or [])[:5]
        ],
        "education": profile.get("education", []),
    }

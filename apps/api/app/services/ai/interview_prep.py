from __future__ import annotations

import json
import logging
import os

import anthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an expert interview coach preparing a candidate for a specific interview.

ABSOLUTE RULES — the same anti-fabrication rules as for resume tailoring apply:
- Only reference skills, experience, and facts from the source profile.
- Do not invent achievements, tools, or credentials the candidate does not have.
- Stories and examples must come from real experience in the profile.

Generate a concise prep packet in Markdown containing three sections:

## Likely questions
5 questions likely to come up for this role, company, and interview round.
For each, include a one-line note on what the interviewer is really probing for.

## Your strong stories
3 STAR-format stories (Situation, Task, Action, Result) drawn directly from the
candidate's profile experience that map to common behavioral questions.
Ground every detail in the actual profile — do not embellish numbers.

## Questions to ask the interviewer
3 thoughtful questions the candidate should ask that show genuine interest in
the role, team, or company.
"""


def generate_prep_packet(
    profile: dict,
    company_name: str,
    job_title: str,
    round_name: str | None,
) -> str:
    user_msg = (
        f"CANDIDATE PROFILE:\n{json.dumps(_slim(profile), indent=2)}\n\n"
        f"INTERVIEW DETAILS:\n"
        f"Company: {company_name}\n"
        f"Role: {job_title}\n"
        f"Round: {round_name or 'unspecified'}"
    )

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    return resp.content[0].text.strip()


def _slim(profile: dict) -> dict:
    return {
        "full_name": profile.get("full_name"),
        "summary": profile.get("summary"),
        "skills": profile.get("skills", []),
        "experience": profile.get("experience", []),
        "education": profile.get("education", []),
    }

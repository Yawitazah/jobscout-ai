from __future__ import annotations

import json
import os

import anthropic

SYSTEM_PROMPT = """
You are a job match scorer. Score this job listing against the
user profile and preferences on a 0 to 100 scale.

Weighting:
- Title match (semantic similarity to target titles): 25 points
- Skill overlap (skills in job vs skills in profile): 25 points
- Location and work mode match: 15 points
- Salary alignment: 10 points
- Seniority match (years of experience): 10 points
- Industry and company-size fit: 10 points
- Deal-breakers (binary disqualifier if hit): 5 points

Critical rules:
- If the listing is remote but restricts to a region the user
  is not in (e.g., 'Remote, US only' and user is in UK),
  score 0 and flag as deal_breaker.
- If it explicitly says 'no sponsorship' and the user needs it,
  score 0.
- If user's company blocklist contains this company, score 0.
- If user's company greenlist contains this company, add 10 points.

Output JSON exactly:
{
  "score": <int 0-100>,
  "reasons": [
    <2-5 short phrases explaining the match, max 60 chars each>
  ],
  "deal_breakers_hit": [<strings, empty if none>],
  "confidence": "low" | "medium" | "high"
}

Return only valid JSON, no markdown, no commentary.
"""


def _profile_for_scoring(profile: dict) -> dict:
    return {
        "full_name": profile.get("full_name"),
        "location": profile.get("location"),
        "summary": (profile.get("summary") or "")[:500],
        "skills": profile.get("skills", []),
        "experience": [
            {
                "title": e.get("title"),
                "company": e.get("company"),
                "years": e.get("years"),
            }
            for e in (profile.get("experience") or [])[:5]
        ],
        "education": profile.get("education", []),
    }


def score_job(profile: dict, preferences: dict, job: dict) -> dict:
    user_msg = (
        f"USER PROFILE:\n{json.dumps(_profile_for_scoring(profile), indent=2)}\n\n"
        f"USER PREFERENCES:\n{json.dumps(preferences, indent=2)}\n\n"
        f"JOB LISTING:\n"
        f"Title: {job['title']}\n"
        f"Company: {job.get('company_name', '')}\n"
        f"Location: {job.get('location') or 'unspecified'}\n"
        f"Mode: {job.get('work_mode') or 'unspecified'}\n"
        f"Description:\n{(job.get('description') or '')[:6000]}"
    )

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = resp.content[0].text.strip()

    # Strip code fences if present
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]

    return json.loads(text.strip())

from __future__ import annotations

import json
import os

import anthropic

SYSTEM_PROMPT = """\
You are a resume tailoring specialist. Rewrite the candidate's resume to target a specific job listing.

ABSOLUTE RULES — breaking any of these is grounds for rejection:
1. Never invent skills, technologies, tools, or frameworks the candidate did not mention.
2. Never fabricate job titles, employers, dates, or education credentials.
3. Never exaggerate years of experience beyond what is stated.
4. Never add certifications, awards, or publications that aren't in the source profile.
5. Never change numbers (team sizes, revenue figures, percentages) to be more impressive.
6. Never add responsibilities or achievements not traceable to the source profile.
7. Every bullet point must be grounded in something the candidate actually did.
8. If a required skill is missing from the profile, do not add it — leave it absent.

TAILORING GOALS (within the rules above):
- Reorder and emphasise skills and experience that match the job requirements.
- Use keywords from the job description naturally in bullets.
- Tighten language; prefer active verbs and quantified impact where the data exists.
- Adjust the summary to speak directly to this role.

Output a JSON object with this exact schema:
{
  "summary": "2-3 sentence tailored professional summary",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "start_date": "YYYY-MM or null",
      "end_date": "YYYY-MM or null",
      "bullets": ["bullet1", "bullet2", ...]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "Institution Name",
      "graduation_year": "YYYY or null"
    }
  ],
  "tailoring_notes": ["brief note on what was emphasised and why", ...]
}

Return only valid JSON, no markdown, no commentary.
"""


def tailor_resume(profile: dict, job: dict) -> dict:
    user_msg = (
        f"SOURCE PROFILE:\n{json.dumps(_slim_profile(profile), indent=2)}\n\n"
        f"TARGET JOB:\n"
        f"Title: {job.get('title', '')}\n"
        f"Company: {job.get('company_name', '')}\n"
        f"Location: {job.get('location') or 'unspecified'}\n"
        f"Description:\n{(job.get('description') or '')[:8000]}"
    )

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
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


def _slim_profile(profile: dict) -> dict:
    return {
        "full_name": profile.get("full_name"),
        "location": profile.get("location"),
        "summary": profile.get("summary"),
        "skills": profile.get("skills", []),
        "experience": profile.get("experience", []),
        "education": profile.get("education", []),
    }

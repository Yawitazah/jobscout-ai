from __future__ import annotations

import json
import os
import re

import anthropic

# Clichés that make hiring managers cringe
BANNED_WORDS: list[str] = [
    "passionate",
    "ninja",
    "rockstar",
    "guru",
    "synergy",
    "leverage",
    "utilize",
    "utilise",
    "dynamic",
    "innovative",
    "thought leader",
    "game changer",
    "game-changer",
    "disruptive",
    "holistic",
    "ecosystem",
    "proactive",
    "go-getter",
    "self-starter",
    "team player",
    "detail-oriented",
    "results-driven",
    "hardworking",
    "motivated",
    "enthusiastic",
]

SYSTEM_PROMPT = """\
You are an expert cover letter writer. Write a concise, compelling cover letter for the candidate
targeting the specific job. The letter should be 3-4 short paragraphs:
1. Opening: why this role, why this company (be specific, not generic).
2. Proof: 2-3 concrete examples of relevant experience from the candidate's profile.
3. Value add: what specific problem you'd solve or goal you'd advance.
4. Close: confident call to action.

STRICT RULES:
- Only reference skills, experience, and facts that appear in the source profile.
- Do not invent metrics, titles, or achievements.
- Maximum 350 words.
- No greeting salutation (skip "Dear Hiring Manager").
- No sign-off (skip "Sincerely, ...").

Output JSON exactly:
{
  "paragraphs": ["paragraph 1", "paragraph 2", "paragraph 3", "paragraph 4"],
  "word_count": <int>
}

Return only valid JSON, no markdown, no commentary.
"""


def generate_cover_letter(profile: dict, job: dict) -> dict:
    user_msg = (
        f"CANDIDATE PROFILE:\n{json.dumps(_slim(profile), indent=2)}\n\n"
        f"TARGET JOB:\n"
        f"Title: {job.get('title', '')}\n"
        f"Company: {job.get('company_name', '')}\n"
        f"Description:\n{(job.get('description') or '')[:6000]}"
    )

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-sonnet-4-6",
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
    result = json.loads(text.strip())
    result["banned_words_found"] = check_banned_words(result.get("paragraphs", []))
    return result


def check_banned_words(paragraphs: list[str]) -> list[str]:
    """Return list of banned words found across all paragraphs."""
    full_text = " ".join(paragraphs).lower()
    found: list[str] = []
    for word in BANNED_WORDS:
        pattern = r"\b" + re.escape(word.lower()) + r"\b"
        if re.search(pattern, full_text):
            found.append(word)
    return found


def _slim(profile: dict) -> dict:
    return {
        "full_name": profile.get("full_name"),
        "location": profile.get("location"),
        "summary": profile.get("summary"),
        "skills": profile.get("skills", []),
        "experience": profile.get("experience", []),
        "education": profile.get("education", []),
    }

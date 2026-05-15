from __future__ import annotations

import json
import os
import re

import anthropic

BANNED_WORDS: list[str] = [
    "passionate", "ninja", "rockstar", "guru", "synergy", "leverage", "utilize",
    "utilise", "dynamic", "innovative", "thought leader", "game changer", "game-changer",
    "disruptive", "holistic", "ecosystem", "proactive", "go-getter", "self-starter",
    "team player", "detail-oriented", "results-driven", "hardworking", "motivated",
    "enthusiastic", "seasoned professional", "proven track record",
]

SYSTEM_PROMPT = """\
You are a world-class cover letter writer. You write letters that get read because they are \
specific, confident, and show real understanding of what the company needs.

STRUCTURE (4 tight paragraphs, ≤ 350 words total):

Paragraph 1 — HOOK (2-3 sentences)
• Open with a specific insight about the company or role — something that shows you actually \
  understand their business, product, challenge, or market.
• State the role you're applying for.
• One sentence why you are the right person (most relevant credential or achievement).

Paragraph 2 — PROOF (3-4 sentences)
• Pick the 2-3 most relevant achievements from the candidate's background.
• Each achievement must be concrete: include a number, outcome, or named technology/brand where available.
• Mirror the language and priorities of the job description.
• If `additional_context` exists in the profile, mine it for your best proof points.

Paragraph 3 — VALUE ADD (2-3 sentences)
• Describe the specific problem you would solve or goal you would advance in this role.
• Make it feel like you've already thought about how you'd succeed in their context.
• Reference something specific about the company (product, growth stage, challenge, mission).

Paragraph 4 — CLOSE (1-2 sentences)
• Confident, forward-looking close. Express genuine interest.
• No weak phrases like "I hope to hear from you" — use "I'd welcome the chance to discuss…"

RULES:
• No greeting salutation ("Dear Hiring Manager" etc.)
• No sign-off ("Sincerely" etc.)
• Only reference skills and experience traceable to the candidate's profile.
• Never invent metrics, titles, or achievements.
• The letter must feel hand-crafted for THIS company and THIS role — not a template.
• Use the company name at least once by name.

WORDS TO AVOID (corporate clichés — they get flagged and look junior):
passionate, ninja, rockstar, guru, synergy, leverage, utilize, utilise, dynamic,
innovative, thought leader, game changer, game-changer, disruptive, holistic,
ecosystem, proactive, go-getter, self-starter, team player, detail-oriented,
results-driven, hardworking, motivated, enthusiastic, seasoned professional,
proven track record.

Use specific replacements instead. Examples:
  • "leverage X" → "use X" / "apply X" / "build on X"
  • "dynamic CMS systems" → "custom-built CMS" / "modular CMS"
  • "innovative" → name the specific thing and what's new about it
  • "passionate about X" → describe what you actually did with X
  • "results-driven" → cite the actual result
  • "proven track record" → name the proof point directly

Output JSON exactly (no markdown, no commentary):
{
  "paragraphs": ["paragraph 1 text", "paragraph 2 text", "paragraph 3 text", "paragraph 4 text"],
  "word_count": <integer>
}
"""


def generate_cover_letter(profile: dict, job: dict) -> dict:
    user_msg = (
        f"CANDIDATE PROFILE:\n{json.dumps(_slim(profile), indent=2)}\n\n"
        f"TARGET JOB:\n"
        f"Title: {job.get('title', '')}\n"
        f"Company: {job.get('company_name', '')}\n"
        f"Full job description:\n{(job.get('description') or '')[:4000]}"
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
    result = json.loads(text.strip())
    result["banned_words_found"] = check_banned_words(result.get("paragraphs", []))
    return result


def check_banned_words(paragraphs: list[str]) -> list[str]:
    full_text = " ".join(paragraphs).lower()
    found: list[str] = []
    for word in BANNED_WORDS:
        pattern = r"\b" + re.escape(word.lower()) + r"\b"
        if re.search(pattern, full_text):
            found.append(word)
    return found


def _slim(profile: dict) -> dict:
    slim = {
        "full_name": profile.get("full_name"),
        "location": profile.get("location"),
        "summary": profile.get("summary"),
        "skills": profile.get("skills", []),
        "experience": profile.get("experience", []),
        "education": profile.get("education", []),
        "certifications": profile.get("certifications", []),
        "projects": profile.get("projects", []),
        "additional_context": profile.get("additional_context") or "",
    }
    return {k: v for k, v in slim.items() if v not in (None, [], "")}

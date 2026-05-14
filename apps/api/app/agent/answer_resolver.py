"""
Deterministic answer resolver for job application form questions.

No AI calls. Answers come from:
  1. saved_answers (user-provided, exact key match)
  2. Profile field pattern matching on the question text
  3. None — caller decides whether to skip or flag as missing
"""
from __future__ import annotations

import re


# ---------------------------------------------------------------------------
# Pattern → profile field mappings (ordered: more specific patterns first)
# ---------------------------------------------------------------------------

_PATTERNS: list[tuple[list[str], str]] = [
    # Name
    (["first_name", "first name"],                      "first_name"),
    (["last_name", "last name", "surname"],             "last_name"),
    (["full_name", "full name", "name"],                "full_name"),

    # Contact
    (["email"],                                          "email"),
    (["phone", "telephone", "mobile"],                  "phone"),
    (["linkedin"],                                       "linkedin_url"),
    (["github"],                                         "github_url"),
    (["website", "portfolio", "personal url"],          "portfolio_url"),

    # Location
    (["city", "location", "candidate-location",
      "current city", "where do you live",
      "where do you currently live"],                   "location"),
    (["country where you currently reside",
      "country you reside", "country of residence",
      "current country"],                               "country"),

    # Work history — current/most recent
    (["current.*employer", "previous.*employer",
      "current or previous employer",
      "employer", "company name"],                      "current_company"),
    (["current.*title", "previous.*title",
      "current or previous.*title",
      "job title", "position"],                         "current_title"),
    (["years of experience", "how many years"],         "years_experience"),

    # Misc
    (["salary", "compensation", "expected salary"],     ""),   # leave blank
    (["start date", "available to start",
      "earliest start"],                                ""),   # leave blank
]


def resolve_answer(
    question_text: str,
    question_key: str,
    profile: dict,
    saved_answers: dict[str, str],
) -> dict:
    """
    Return {"answer": str | None, "confidence": str, "source": str}.
    answer=None means we cannot answer — caller should skip or flag missing.
    """

    # 1. Exact key match in saved answers
    if question_key in saved_answers:
        return {"answer": saved_answers[question_key], "confidence": "high", "source": "saved_answers"}

    # 2. Fuzzy key match in saved answers (strip underscores / spaces)
    norm_key = re.sub(r"[^a-z0-9]", "", question_key.lower())
    for k, v in saved_answers.items():
        if re.sub(r"[^a-z0-9]", "", k.lower()) == norm_key:
            return {"answer": v, "confidence": "high", "source": "saved_answers"}

    # 3. Pattern matching on question text + key
    needle = (question_text + " " + question_key).lower()
    for patterns, field in _PATTERNS:
        for pat in patterns:
            if re.search(pat, needle):
                answer = _extract_field(field, profile)
                if answer is not None:
                    return {"answer": str(answer), "confidence": "medium", "source": "profile"}
                # field matched but profile has no value — return None
                return {"answer": None, "confidence": "low", "source": "unknown"}

    return {"answer": None, "confidence": "low", "source": "unknown"}


# ---------------------------------------------------------------------------
# Field extractors
# ---------------------------------------------------------------------------

def _extract_field(field: str, profile: dict) -> str | None:
    if not field:
        return None  # intentionally left blank (salary etc.)

    if field == "first_name":
        full = profile.get("full_name") or ""
        parts = full.strip().split(" ", 1)
        return parts[0] if parts[0] else None

    if field == "last_name":
        full = profile.get("full_name") or ""
        parts = full.strip().split(" ", 1)
        return parts[1] if len(parts) > 1 else None

    if field == "full_name":
        return profile.get("full_name") or None

    if field == "email":
        return profile.get("resume_email") or profile.get("email") or None

    if field == "phone":
        return profile.get("phone") or None

    if field == "linkedin_url":
        return profile.get("linkedin_url") or None

    if field == "github_url":
        return profile.get("github_url") or None

    if field == "portfolio_url":
        return profile.get("portfolio_url") or profile.get("github_url") or None

    if field == "location":
        loc = profile.get("location") or ""
        # Return just the city portion (before first comma)
        return loc.split(",")[0].strip() or None

    if field == "country":
        loc = profile.get("location") or ""
        parts = [p.strip() for p in loc.split(",")]
        # Last part is usually country or state
        return parts[-1] if len(parts) > 1 else (parts[0] if parts else None)

    if field == "current_company":
        exp = (profile.get("experience") or [])
        if exp:
            return exp[0].get("company") or None
        return None

    if field == "current_title":
        exp = (profile.get("experience") or [])
        if exp:
            return exp[0].get("title") or None
        return None

    if field == "years_experience":
        exp = profile.get("experience") or []
        if not exp:
            return None
        # Count unique years across all roles (rough estimate)
        return str(min(len(exp) * 2, 10))

    return profile.get(field) or None

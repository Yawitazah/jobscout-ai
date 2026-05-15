"""
One source of truth for "what the AI knows about this user."

The tailoring services (resume + cover letter) and Scout chat used to read
different slices of the user's data:

    resume_tailor / cover_letter  ←  profiles row only
    Scout chat                    ←  profiles + profile_memories
                                       + resume_uploads.extracted_text

This module closes that gap. `enrich_profile()` takes the bare profile row
the caller already fetched and adds the three extra sources so the tailoring
services see exactly the same picture Scout does.

Returns a shallow copy with these additions (never mutates the input):
    • memories             — list[str], most recent first, capped
    • raw_resume_text      — str, capped, from the latest uploaded resume
    • past_application_answers — list[{question_key, answer}]
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# Caps to keep tailoring prompts from ballooning beyond what Haiku/Sonnet
# can usefully chew on. Adjust if context gets too tight.
MAX_MEMORIES = 25
MAX_ANSWERS = 25
MAX_RAW_RESUME_CHARS = 4000


def enrich_profile(profile: dict, user_id: str, supabase: Any) -> dict:
    """
    Return a shallow copy of `profile` with memories, raw resume text, and
    past application answers attached. Safe to call even if any of the side
    sources are empty.
    """
    out = dict(profile or {})

    out["memories"] = _fetch_memories(user_id, supabase)
    out["raw_resume_text"] = _fetch_raw_resume(user_id, supabase)
    out["past_application_answers"] = _fetch_application_answers(user_id, supabase)

    return out


def _fetch_memories(user_id: str, supabase: Any) -> list[str]:
    try:
        res = (
            supabase.table("profile_memories")
            .select("content")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(MAX_MEMORIES)
            .execute()
        )
        return [
            (row.get("content") or "").strip()
            for row in (res.data or [])
            if (row.get("content") or "").strip()
        ]
    except Exception as exc:
        logger.debug("enrich_profile: memories fetch failed: %s", exc)
        return []


def _fetch_raw_resume(user_id: str, supabase: Any) -> str:
    try:
        res = (
            supabase.table("resume_uploads")
            .select("extracted_text")
            .eq("user_id", user_id)
            .eq("status", "done")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return ""
        text = (rows[0].get("extracted_text") or "").strip()
        if len(text) > MAX_RAW_RESUME_CHARS:
            text = text[:MAX_RAW_RESUME_CHARS] + " [...truncated]"
        return text
    except Exception as exc:
        logger.debug("enrich_profile: raw resume fetch failed: %s", exc)
        return ""


def _fetch_application_answers(user_id: str, supabase: Any) -> list[dict]:
    try:
        res = (
            supabase.table("application_answers")
            .select("question_key, answer")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(MAX_ANSWERS)
            .execute()
        )
        out: list[dict] = []
        for row in (res.data or []):
            q = (row.get("question_key") or "").strip()
            a = (row.get("answer") or "").strip()
            if q and a:
                out.append({"question_key": q, "answer": a})
        return out
    except Exception as exc:
        logger.debug("enrich_profile: application_answers fetch failed: %s", exc)
        return []

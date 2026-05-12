from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Any

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.config import Settings, get_settings
from app.deps import get_current_user, get_supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profiles", tags=["profiles"])

_EXTRACT_SYSTEM = """\
You are a resume parser. Given raw resume text, extract structured data and return ONLY a JSON object.
No markdown, no explanation — just the JSON.

Schema:
{
  "full_name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "summary": "2-3 sentence professional summary or null",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "start_date": "YYYY-MM or null",
      "end_date": "YYYY-MM or null (null = present)",
      "description": "brief description"
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "Institution Name",
      "graduation_year": "YYYY or null"
    }
  ]
}
"""


class ExtractProfileResponse(BaseModel):
    profile_id: str
    fields_updated: list[str]


@router.post("/{upload_id}/extract-profile", response_model=ExtractProfileResponse)
async def extract_profile_from_resume(
    upload_id: str,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase_admin)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ExtractProfileResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI extraction not configured")

    upload_row = (
        supabase.table("resume_uploads")
        .select("id, user_id, extracted_text, status")
        .eq("id", upload_id)
        .single()
        .execute()
    )

    if not upload_row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    record = upload_row.data
    if record["user_id"] != user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if record["status"] != "processed" or not record.get("extracted_text"):
        raise HTTPException(
            status_code=422,
            detail="Resume text not yet extracted. Call /extract first.",
        )

    extracted_text: str = record["extracted_text"]

    try:
        ai_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = ai_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=_EXTRACT_SYSTEM,
            messages=[{"role": "user", "content": extracted_text[:12000]}],
        )
        raw = message.content[0].text.strip()
        parsed: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.exception("Claude returned non-JSON: %s", exc)
        raise HTTPException(status_code=502, detail="AI returned invalid JSON") from exc
    except Exception as exc:
        logger.exception("Claude call failed: %s", exc)
        raise HTTPException(status_code=502, detail="AI extraction failed") from exc

    now = datetime.now(timezone.utc).isoformat()
    profile_patch: dict[str, Any] = {
        "extracted_from_upload_id": upload_id,
        "ai_extracted_at": now,
        "updated_at": now,
    }

    field_map = {
        "full_name": "full_name",
        "email": "email",
        "phone": "phone",
        "location": "location",
        "summary": "summary",
        "skills": "skills",
        "experience": "experience",
        "education": "education",
    }
    updated: list[str] = []
    for ai_key, db_key in field_map.items():
        val = parsed.get(ai_key)
        if val is not None and val != "" and val != []:
            profile_patch[db_key] = val
            updated.append(db_key)

    result = (
        supabase.table("profiles")
        .update(profile_patch)
        .eq("id", user["id"])
        .select("id")
        .execute()
    )

    if not result.data:
        supabase.table("profiles").insert({"id": user["id"], **profile_patch}).execute()

    return ExtractProfileResponse(profile_id=user["id"], fields_updated=updated)

from __future__ import annotations

import io
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.deps import get_current_user, get_supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resumes", tags=["resumes"])


class ExtractResponse(BaseModel):
    id: str
    status: str
    char_count: int


@router.post("/{upload_id}/extract", response_model=ExtractResponse)
async def extract_resume_text(
    upload_id: str,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase_admin)],
) -> ExtractResponse:
    row = (
        supabase.table("resume_uploads")
        .select("id, user_id, storage_path, mime_type, status")
        .eq("id", upload_id)
        .single()
        .execute()
    )

    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    record = row.data
    if record["user_id"] != user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if record["status"] == "processed":
        return ExtractResponse(id=upload_id, status="processed", char_count=0)

    supabase.table("resume_uploads").update({"status": "processing"}).eq("id", upload_id).execute()

    try:
        response = supabase.storage.from_("resumes").download(record["storage_path"])
        file_bytes = response
    except Exception as exc:
        _set_failed(supabase, upload_id)
        logger.exception("Storage download failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to download file") from exc

    try:
        text = _extract_text(file_bytes, record["mime_type"])
    except Exception as exc:
        _set_failed(supabase, upload_id)
        logger.exception("Text extraction failed: %s", exc)
        raise HTTPException(status_code=422, detail="Could not extract text from file") from exc

    supabase.table("resume_uploads").update(
        {"status": "processed", "extracted_text": text, "updated_at": "now()"}
    ).eq("id", upload_id).execute()

    return ExtractResponse(id=upload_id, status="processed", char_count=len(text))


def _extract_text(data: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        return _extract_pdf(data)
    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _extract_docx(data)
    raise ValueError(f"Unsupported mime type: {mime_type}")


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)


def _extract_docx(data: bytes) -> str:
    import docx

    doc = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _set_failed(supabase: Client, upload_id: str) -> None:
    try:
        supabase.table("resume_uploads").update({"status": "failed"}).eq("id", upload_id).execute()
    except Exception:
        pass

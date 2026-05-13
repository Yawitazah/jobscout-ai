from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from supabase import Client

from app.deps import get_current_user, get_supabase_admin
from app.services.ai.resume_tailor import tailor_resume
from app.services.ai.resume_verifier import verify_and_fix
from app.services.documents.resume_builder import build_docx, build_pdf
from app.services.ai.cover_letter import generate_cover_letter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applications", tags=["applications"])


class StartApplicationResponse(BaseModel):
    application_id: str
    status: str


@router.post("/start/{user_job_id}", response_model=StartApplicationResponse)
async def start_application(
    user_job_id: str,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase_admin)],
) -> StartApplicationResponse:
    """Kick off the full application pipeline: tailor resume → cover letter → queue submission."""
    user_job = (
        supabase.table("user_jobs")
        .select("id, user_id")
        .eq("id", user_job_id)
        .single()
        .execute()
    )
    if not user_job.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_job not found")
    if user_job.data["user_id"] != user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    app_row = (
        supabase.table("applications")
        .select("id, status")
        .eq("user_job_id", user_job_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )

    now = datetime.now(timezone.utc).isoformat()
    if app_row.data:
        application_id = app_row.data["id"]
        current_status = app_row.data["status"]
        if current_status in ("submitting", "submitted"):
            return StartApplicationResponse(application_id=application_id, status=current_status)
        supabase.table("applications").update({"status": "draft", "updated_at": now}).eq("id", application_id).execute()
    else:
        result = supabase.table("applications").insert({
            "user_id": user["id"],
            "user_job_id": user_job_id,
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }).select("id").execute()
        application_id = result.data[0]["id"]

    try:
        from app.worker.tasks.apply import submit_application
        submit_application.delay(application_id, user["id"])
    except Exception as exc:
        logger.exception("Failed to queue submit_application task: %s", exc)
        supabase.table("applications").update({"status": "submit_failed", "updated_at": now}).eq("id", application_id).execute()
        raise HTTPException(status_code=502, detail=f"Failed to queue application task: {exc}") from exc

    supabase.table("applications").update({"status": "tailoring_resume", "updated_at": now}).eq("id", application_id).execute()

    return StartApplicationResponse(application_id=application_id, status="tailoring_resume")


class TailorResponse(BaseModel):
    document_id: str
    verification_status: str
    tailoring_notes: list[str]


@router.post("/{user_job_id}/tailor", response_model=TailorResponse)
async def tailor_resume_for_job(
    user_job_id: str,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase_admin)],
) -> TailorResponse:
    user_job = (
        supabase.table("user_jobs")
        .select("id, user_id, job_id")
        .eq("id", user_job_id)
        .single()
        .execute()
    )
    if not user_job.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_job not found")
    if user_job.data["user_id"] != user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    job_id = user_job.data["job_id"]

    job_row = (
        supabase.table("jobs")
        .select("id, title, description, location, work_mode, company_id")
        .eq("id", job_id)
        .single()
        .execute()
    )
    if not job_row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job = job_row.data
    company_row = (
        supabase.table("companies")
        .select("name")
        .eq("id", job.get("company_id", ""))
        .maybe_single()
        .execute()
    )
    job["company_name"] = company_row.data["name"] if company_row.data else ""

    profile_row = (
        supabase.table("profiles")
        .select("*")
        .eq("id", user["id"])
        .single()
        .execute()
    )
    if not profile_row.data:
        raise HTTPException(status_code=422, detail="Profile not found. Upload a resume first.")

    profile = profile_row.data
    if not profile.get("experience") and not profile.get("skills"):
        raise HTTPException(status_code=422, detail="Profile has no experience or skills to tailor.")

    try:
        raw_tailored = tailor_resume(profile, job)
    except Exception as exc:
        logger.exception("Resume tailoring failed: %s", exc)
        raise HTTPException(status_code=502, detail="AI tailoring failed") from exc

    try:
        tailored, verification = verify_and_fix(profile, raw_tailored, max_cycles=2)
    except Exception as exc:
        logger.exception("Verification pipeline failed: %s", exc)
        tailored = raw_tailored
        verification = {"passed": False, "violations": [], "fix_instructions": ""}

    v_status = "passed" if verification.get("passed") else "failed_review"
    content_text = _render_text(tailored, profile)

    now = datetime.now(timezone.utc).isoformat()
    doc = (
        supabase.table("generated_documents")
        .insert({
            "user_id": user["id"],
            "user_job_id": user_job_id,
            "document_type": "resume",
            "content_json": tailored,
            "content_text": content_text,
            "generation_model": "claude-sonnet-4-6",
            "verification_status": v_status,
            "verification_notes": verification.get("violations", []),
            "created_at": now,
        })
        .select("id")
        .execute()
    )

    doc_id = doc.data[0]["id"]

    supabase.table("applications").upsert(
        {
            "user_id": user["id"],
            "user_job_id": user_job_id,
            "resume_doc_id": doc_id,
            "updated_at": now,
        },
        on_conflict="user_id,user_job_id",
    ).execute()

    return TailorResponse(
        document_id=doc_id,
        verification_status=v_status,
        tailoring_notes=tailored.get("tailoring_notes", []),
    )


class ResumeDocResponse(BaseModel):
    document_id: str
    verification_status: str
    verification_notes: list[dict]
    content_json: dict
    content_text: str
    created_at: str


@router.get("/{user_job_id}/resume", response_model=ResumeDocResponse)
async def get_resume_for_job(
    user_job_id: str,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase_admin)],
) -> ResumeDocResponse:
    app_row = (
        supabase.table("applications")
        .select("resume_doc_id")
        .eq("user_job_id", user_job_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not app_row.data or not app_row.data.get("resume_doc_id"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No resume generated for this job yet")

    doc_id = app_row.data["resume_doc_id"]
    doc_row = (
        supabase.table("generated_documents")
        .select("id, verification_status, verification_notes, content_json, content_text, created_at")
        .eq("id", doc_id)
        .single()
        .execute()
    )
    if not doc_row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    d = doc_row.data
    return ResumeDocResponse(
        document_id=d["id"],
        verification_status=d["verification_status"],
        verification_notes=d.get("verification_notes") or [],
        content_json=d["content_json"],
        content_text=d["content_text"],
        created_at=d["created_at"],
    )


class CoverLetterResponse(BaseModel):
    document_id: str
    paragraphs: list[str]
    word_count: int
    banned_words_found: list[str]


@router.post("/{user_job_id}/cover_letter", response_model=CoverLetterResponse)
async def generate_cover_letter_for_job(
    user_job_id: str,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase_admin)],
) -> CoverLetterResponse:
    user_job = (
        supabase.table("user_jobs")
        .select("id, user_id, job_id")
        .eq("id", user_job_id)
        .single()
        .execute()
    )
    if not user_job.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_job not found")
    if user_job.data["user_id"] != user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    job_row = (
        supabase.table("jobs")
        .select("id, title, description, location, company_id")
        .eq("id", user_job.data["job_id"])
        .single()
        .execute()
    )
    if not job_row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    job = job_row.data

    company_row = (
        supabase.table("companies")
        .select("name")
        .eq("id", job.get("company_id", ""))
        .maybe_single()
        .execute()
    )
    job["company_name"] = company_row.data["name"] if company_row.data else ""

    profile_row = (
        supabase.table("profiles")
        .select("*")
        .eq("id", user["id"])
        .single()
        .execute()
    )
    if not profile_row.data:
        raise HTTPException(status_code=422, detail="Profile not found. Upload a resume first.")

    try:
        result = generate_cover_letter(profile_row.data, job)
    except Exception as exc:
        logger.exception("Cover letter generation failed: %s", exc)
        raise HTTPException(status_code=502, detail="AI generation failed") from exc

    paragraphs = result.get("paragraphs", [])
    content_text = "\n\n".join(paragraphs)
    content_json = {
        "paragraphs": paragraphs,
        "word_count": result.get("word_count", 0),
        "banned_words_found": result.get("banned_words_found", []),
    }

    now = datetime.now(timezone.utc).isoformat()
    doc = (
        supabase.table("generated_documents")
        .insert({
            "user_id": user["id"],
            "user_job_id": user_job_id,
            "document_type": "cover_letter",
            "content_json": content_json,
            "content_text": content_text,
            "generation_model": "claude-sonnet-4-6",
            "verification_status": "passed",
            "created_at": now,
        })
        .select("id")
        .execute()
    )
    doc_id = doc.data[0]["id"]

    supabase.table("applications").upsert(
        {
            "user_id": user["id"],
            "user_job_id": user_job_id,
            "cover_letter_doc_id": doc_id,
            "updated_at": now,
        },
        on_conflict="user_id,user_job_id",
    ).execute()

    return CoverLetterResponse(
        document_id=doc_id,
        paragraphs=paragraphs,
        word_count=result.get("word_count", 0),
        banned_words_found=result.get("banned_words_found", []),
    )


@router.get("/{user_job_id}/resume/download/docx")
async def download_resume_docx(
    user_job_id: str,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase_admin)],
) -> Response:
    doc_data, profile = _get_doc_and_profile(user_job_id, user, supabase)
    docx_bytes = build_docx(doc_data["content_json"], profile.get("full_name") or "Resume")
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=resume.docx"},
    )


@router.get("/{user_job_id}/resume/download/pdf")
async def download_resume_pdf(
    user_job_id: str,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase_admin)],
) -> Response:
    doc_data, profile = _get_doc_and_profile(user_job_id, user, supabase)
    pdf_bytes = build_pdf(doc_data["content_json"], profile.get("full_name") or "Resume")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=resume.pdf"},
    )


def _get_doc_and_profile(user_job_id: str, user: dict, supabase: Client) -> tuple[dict, dict]:
    app_row = (
        supabase.table("applications")
        .select("resume_doc_id")
        .eq("user_job_id", user_job_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not app_row.data or not app_row.data.get("resume_doc_id"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No resume generated for this job yet")

    doc_row = (
        supabase.table("generated_documents")
        .select("content_json")
        .eq("id", app_row.data["resume_doc_id"])
        .single()
        .execute()
    )
    if not doc_row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    profile_row = (
        supabase.table("profiles")
        .select("full_name")
        .eq("id", user["id"])
        .single()
        .execute()
    )
    return doc_row.data, profile_row.data or {}


def _render_text(tailored: dict, profile: dict) -> str:
    lines: list[str] = []
    name = profile.get("full_name") or ""
    if name:
        lines.append(name)
    if tailored.get("summary"):
        lines.append("")
        lines.append(tailored["summary"])
    if tailored.get("skills"):
        lines.append("")
        lines.append("Skills: " + ", ".join(tailored["skills"]))
    for exp in tailored.get("experience", []):
        lines.append("")
        lines.append(f"{exp.get('title', '')} at {exp.get('company', '')}")
        dates = f"{exp.get('start_date') or ''} - {exp.get('end_date') or 'Present'}"
        lines.append(dates)
        for b in exp.get("bullets", []):
            lines.append(f"• {b}")
    for edu in tailored.get("education", []):
        lines.append("")
        lines.append(f"{edu.get('degree', '')} — {edu.get('institution', '')}")
        if edu.get("graduation_year"):
            lines.append(edu["graduation_year"])
    return "\n".join(lines)

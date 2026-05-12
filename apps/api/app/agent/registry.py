from __future__ import annotations

from playwright.async_api import Page

from app.agent.form_filler import FormFiller


def get_filler(
    platform: str,
    page: Page,
    profile: dict,
    saved_answers: dict[str, str],
    apply_url: str,
    cover_letter_text: str = "",
    resume_pdf_bytes: bytes | None = None,
) -> FormFiller:
    """Return the correct FormFiller subclass for the given ATS platform."""
    if platform == "greenhouse":
        from app.agent.adapters.greenhouse_filler import GreenhouseFiller
        return GreenhouseFiller(
            page=page,
            profile=profile,
            saved_answers=saved_answers,
            apply_url=apply_url,
            cover_letter_text=cover_letter_text,
            resume_pdf_bytes=resume_pdf_bytes,
        )
    if platform == "lever":
        from app.agent.adapters.lever_filler import LeverFiller
        return LeverFiller(
            page=page,
            profile=profile,
            saved_answers=saved_answers,
            apply_url=apply_url,
            cover_letter_text=cover_letter_text,
        )
    raise ValueError(f"Unsupported platform: {platform!r}. Supported: greenhouse, lever")

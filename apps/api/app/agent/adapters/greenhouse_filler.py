from __future__ import annotations

import logging
import re

from playwright.async_api import Page

from app.agent.answer_resolver import resolve_answer
from app.agent.form_filler import FormFiller
from app.agent.screenshots import capture

logger = logging.getLogger(__name__)

# Greenhouse field selectors
_FIRST_NAME = 'input[id="first_name"], input[name="first_name"]'
_LAST_NAME = 'input[id="last_name"], input[name="last_name"]'
_EMAIL = 'input[id="email"], input[name="email"]'
_PHONE = 'input[id="phone"], input[name="phone"]'
_RESUME_UPLOAD = 'input[type="file"][id*="resume"], input[type="file"][name*="resume"]'
_COVER_LETTER_TEXTAREA = 'textarea[id*="cover_letter"], textarea[name*="cover_letter"]'
_SUBMIT = 'input[type="submit"], button[type="submit"]'


class GreenhouseFiller(FormFiller):
    def __init__(
        self,
        page: Page,
        profile: dict,
        saved_answers: dict[str, str],
        apply_url: str,
        cover_letter_text: str = "",
        resume_pdf_bytes: bytes | None = None,
    ) -> None:
        super().__init__(page, profile, saved_answers)
        self.apply_url = apply_url
        self.cover_letter_text = cover_letter_text
        self.resume_pdf_bytes = resume_pdf_bytes

    async def fill(self) -> None:
        await self.page.goto(self.apply_url, wait_until="domcontentloaded", timeout=30000)
        await self.page.wait_for_load_state("networkidle", timeout=15000)

        name = (self.profile.get("full_name") or "").split(" ", 1)
        first = name[0] if name else ""
        last = name[1] if len(name) > 1 else ""

        await self._fill_text(_FIRST_NAME, first, "first_name")
        await self._fill_text(_LAST_NAME, last, "last_name")
        await self._fill_text(_EMAIL, self.profile.get("resume_email") or self.profile.get("email") or "", "email")
        await self._fill_text(_PHONE, self.profile.get("phone") or "", "phone")

        if self.cover_letter_text:
            await self._fill_text(_COVER_LETTER_TEXTAREA, self.cover_letter_text, "cover_letter")

        await self._fill_custom_questions()

    async def _fill_custom_questions(self) -> None:
        """Detect and fill Greenhouse custom questions."""
        questions = await self.page.locator(".field").all()
        for q in questions:
            try:
                label_el = q.locator("label").first
                label_text = (await label_el.text_content() or "").strip()
                if not label_text:
                    continue

                question_key = _slugify(label_text)
                input_el = q.locator("input[type=text], input[type=number], textarea, select").first

                tag = await input_el.evaluate("el => el.tagName.toLowerCase()")
                if tag == "select":
                    result = resolve_answer(label_text, question_key, self.profile, self.saved_answers)
                    if result["answer"]:
                        await self._select_option(
                            f'select[id="{await input_el.get_attribute("id")}"]',
                            result["answer"],
                            question_key,
                        )
                else:
                    result = resolve_answer(label_text, question_key, self.profile, self.saved_answers)
                    if result["answer"]:
                        await input_el.fill(result["answer"])
                        self.form_responses[question_key] = result["answer"]
            except Exception as exc:
                logger.debug("Custom question fill skipped: %s", exc)

    async def submit_with_proof(self) -> dict:
        log: list[dict] = []
        submitted = False
        confirmation_number = None
        screenshot_path: bytes | None = None

        self._log_step(log, "navigate", self.apply_url)

        submit_ok = await self._click(_SUBMIT, "submit")
        self._log_step(log, "submit_click", _SUBMIT, submit_ok)

        if submit_ok:
            try:
                await self.page.wait_for_load_state("networkidle", timeout=15000)
                submitted = True
                confirmation_number = await _extract_confirmation(self.page)
                screenshot_path = await capture(self.page, "confirmation")
                self._log_step(log, "confirmation_detected", confirmation_number or "none")
            except Exception as exc:
                self._log_step(log, "post_submit_wait_failed", str(exc), ok=False)

        return {
            "submitted": submitted,
            "confirmation_number": confirmation_number,
            "confirmation_email": None,
            "screenshot_bytes": screenshot_path,
            "form_responses": self.form_responses,
            "submission_log": log,
        }


async def _extract_confirmation(page: Page) -> str | None:
    """Try to find a confirmation number in the post-submit page."""
    try:
        text = await page.inner_text("body")
        patterns = [
            r"application\s*(?:id|number|#)[\s:]*([A-Z0-9\-]{4,20})",
            r"confirmation[\s:]*([A-Z0-9\-]{4,20})",
            r"reference[\s:]*([A-Z0-9\-]{4,20})",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return m.group(1)
    except Exception:
        pass
    return None


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")

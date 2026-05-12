from __future__ import annotations

import logging
import re

from playwright.async_api import Page

from app.agent.answer_resolver import resolve_answer
from app.agent.form_filler import FormFiller
from app.agent.screenshots import capture

logger = logging.getLogger(__name__)

# Lever field selectors
_FIRST_NAME = 'input[name="name"]'  # Lever uses a single "name" field
_EMAIL = 'input[name="email"]'
_PHONE = 'input[name="phone"]'
_ORG = 'input[name="org"]'  # current company
_URLS = 'input[name="urls[LinkedIn]"], input[placeholder*="LinkedIn"]'
_RESUME_UPLOAD = 'input[type="file"]'
_COVER_LETTER = 'textarea[name="comments"]'
_SUBMIT = 'button[type="submit"], input[type="submit"]'


class LeverFiller(FormFiller):
    def __init__(
        self,
        page: Page,
        profile: dict,
        saved_answers: dict[str, str],
        apply_url: str,
        cover_letter_text: str = "",
    ) -> None:
        super().__init__(page, profile, saved_answers)
        self.apply_url = apply_url
        self.cover_letter_text = cover_letter_text

    async def fill(self) -> None:
        await self.page.goto(self.apply_url, wait_until="domcontentloaded", timeout=30000)
        await self.page.wait_for_load_state("networkidle", timeout=15000)

        await self._fill_text(_FIRST_NAME, self.profile.get("full_name") or "", "full_name")
        await self._fill_text(_EMAIL, self.profile.get("email") or "", "email")
        await self._fill_text(_PHONE, self.profile.get("phone") or "", "phone")

        experience = self.profile.get("experience") or []
        if experience:
            current_company = experience[0].get("company") or ""
            await self._fill_text(_ORG, current_company, "current_company")

        if self.cover_letter_text:
            await self._fill_text(_COVER_LETTER, self.cover_letter_text, "cover_letter")

        await self._fill_custom_questions()

    async def _fill_custom_questions(self) -> None:
        """Detect and fill Lever custom questions."""
        question_blocks = await self.page.locator(".application-question").all()
        for block in question_blocks:
            try:
                label_el = block.locator("label").first
                label_text = (await label_el.text_content() or "").strip()
                if not label_text:
                    continue

                question_key = _slugify(label_text)
                input_el = block.locator("input[type=text], input[type=number], textarea, select").first

                tag = await input_el.evaluate("el => el.tagName.toLowerCase()")
                result = resolve_answer(label_text, question_key, self.profile, self.saved_answers)

                if not result["answer"]:
                    continue

                if tag == "select":
                    await input_el.select_option(value=result["answer"])
                else:
                    await input_el.fill(result["answer"])
                self.form_responses[question_key] = result["answer"]
            except Exception as exc:
                logger.debug("Lever custom question skipped: %s", exc)

    async def submit_with_proof(self) -> dict:
        log: list[dict] = []
        submitted = False
        confirmation_number = None

        self._log_step(log, "navigate", self.apply_url)

        submit_ok = await self._click(_SUBMIT, "submit")
        self._log_step(log, "submit_click", _SUBMIT, submit_ok)

        if submit_ok:
            try:
                await self.page.wait_for_load_state("networkidle", timeout=15000)
                submitted = True
                confirmation_number = await _extract_confirmation(self.page)
                screenshot_bytes = await capture(self.page, "confirmation")
                self._log_step(log, "confirmation_detected", confirmation_number or "none")
            except Exception as exc:
                screenshot_bytes = None
                self._log_step(log, "post_submit_wait_failed", str(exc), ok=False)
        else:
            screenshot_bytes = None

        return {
            "submitted": submitted,
            "confirmation_number": confirmation_number,
            "confirmation_email": None,
            "screenshot_bytes": screenshot_bytes,
            "form_responses": self.form_responses,
            "submission_log": log,
        }


async def _extract_confirmation(page: Page) -> str | None:
    try:
        text = await page.inner_text("body")
        patterns = [
            r"application\s*(?:id|#)[\s:]*([A-Z0-9\-]{4,20})",
            r"confirmation[\s:]*([A-Z0-9\-]{4,20})",
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

from __future__ import annotations

import logging
import os
import re
import tempfile

from playwright.async_api import Page

from app.agent.answer_resolver import resolve_answer
from app.agent.form_filler import FormFiller
from app.agent.screenshots import capture

logger = logging.getLogger(__name__)

# Greenhouse field selectors (work on boards.greenhouse.io AND company-hosted embeds)
_FIRST_NAME = 'input[id="first_name"], input[name="first_name"]'
_LAST_NAME = 'input[id="last_name"], input[name="last_name"]'
_EMAIL = 'input[id="email"], input[name="email"]'
_PHONE = 'input[id="phone"], input[name="phone"]'
_LINKEDIN = 'input[id*="linkedin"], input[name*="linkedin"]'
_WEBSITE = 'input[id*="website"], input[id*="portfolio"], input[name*="website"]'
_RESUME_UPLOAD = 'input[type="file"][id*="resume"], input[type="file"][name*="resume"]'
_COVER_LETTER_TEXTAREA = 'textarea[id*="cover_letter"], textarea[name*="cover_letter"]'
_SUBMIT = 'input[type="submit"][value*="Submit"], button[type="submit"]'


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
        await self.page.goto(self.apply_url, wait_until="domcontentloaded", timeout=30_000)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=15_000)
        except Exception:
            pass

        # If this is a company-hosted page (e.g. stripe.com/jobs?gh_jid=...),
        # detect a Greenhouse iframe and navigate directly into it so we get
        # the canonical boards.greenhouse.io DOM with predictable selectors.
        canonical = await self._resolve_greenhouse_url()
        if canonical and canonical != self.page.url:
            logger.info("  Greenhouse embed detected — navigating to canonical URL: %s", canonical)
            await self.page.goto(canonical, wait_until="domcontentloaded", timeout=30_000)
            try:
                await self.page.wait_for_load_state("networkidle", timeout=15_000)
            except Exception:
                pass

        name = (self.profile.get("full_name") or "").split(" ", 1)
        first = name[0] if name else ""
        last = name[1] if len(name) > 1 else ""

        await self._fill_text(_FIRST_NAME, first, "first_name")
        await self._fill_text(_LAST_NAME, last, "last_name")
        await self._fill_text(
            _EMAIL,
            self.profile.get("resume_email") or self.profile.get("email") or "",
            "email",
        )
        await self._fill_text(_PHONE, self.profile.get("phone") or "", "phone")
        await self._fill_text(_LINKEDIN, self.profile.get("linkedin_url") or "", "linkedin")
        await self._fill_text(_WEBSITE, self.profile.get("portfolio_url") or self.profile.get("github_url") or "", "website")

        if self.cover_letter_text:
            await self._fill_text(_COVER_LETTER_TEXTAREA, self.cover_letter_text, "cover_letter")

        await self._upload_resume()
        await self._fill_custom_questions()

    async def _resolve_greenhouse_url(self) -> str | None:
        """
        If the current page is a company-hosted Greenhouse embed, return the
        canonical boards.greenhouse.io URL so we can navigate there directly.

        Strategy 1: look for a Greenhouse iframe whose src we can steal.
        Strategy 2: gh_jid in query string + known company slug -> construct URL.
        """
        # Strategy 1: iframe src
        try:
            frames = self.page.frames
            for frame in frames:
                url = frame.url or ""
                if "greenhouse.io" in url and "boards" in url:
                    logger.debug("Found Greenhouse iframe: %s", url)
                    return url
        except Exception as exc:
            logger.debug("Frame inspection failed: %s", exc)

        # Strategy 2: look for <iframe src="...greenhouse..."> in DOM
        try:
            iframe_src = await self.page.evaluate("""() => {
                const iframes = document.querySelectorAll('iframe');
                for (const f of iframes) {
                    if (f.src && f.src.includes('greenhouse.io')) return f.src;
                }
                return null;
            }""")
            if iframe_src:
                logger.debug("Found Greenhouse iframe in DOM: %s", iframe_src)
                return iframe_src
        except Exception as exc:
            logger.debug("DOM iframe search failed: %s", exc)

        # Strategy 3: gh_jid in current URL -> construct boards.greenhouse.io URL
        current_url = self.page.url
        gh_jid_match = re.search(r"gh_jid=(\d+)", current_url)
        if gh_jid_match:
            gh_jid = gh_jid_match.group(1)
            # Also check original apply_url
            if not gh_jid:
                gh_jid_match2 = re.search(r"gh_jid=(\d+)", self.apply_url)
                if gh_jid_match2:
                    gh_jid = gh_jid_match2.group(1)
            if gh_jid:
                # Try to find the board token from the page's script tags or meta
                board_token = await self._extract_board_token() or _company_name_to_slug(
                    self.profile.get("company_name", "")
                )
                if board_token:
                    candidate = f"https://boards.greenhouse.io/{board_token}/jobs/{gh_jid}"
                    logger.debug("Constructed Greenhouse URL: %s", candidate)
                    return candidate

        return None

    async def _extract_board_token(self) -> str | None:
        """Try to extract the Greenhouse board token from the page's JS."""
        try:
            token = await self.page.evaluate("""() => {
                // Look for greenhouse board token in script tags
                const scripts = document.querySelectorAll('script');
                for (const s of scripts) {
                    const m = s.textContent.match(/['"](boards\\.greenhouse\\.io\\/([a-z0-9_-]+))['"]/i);
                    if (m) return m[2];
                }
                // Check for data attributes
                const el = document.querySelector('[data-greenhouse-job-board]');
                if (el) return el.getAttribute('data-greenhouse-job-board');
                return null;
            }""")
            return token
        except Exception:
            return None

    async def _upload_resume(self) -> None:
        """Upload resume PDF if we have bytes and there's a file input."""
        if not self.resume_pdf_bytes:
            return
        try:
            el = self.page.locator(_RESUME_UPLOAD).first
            await el.wait_for(state="attached", timeout=5_000)
            # Write to temp file, set_input_files, then clean up
            suffix = ".pdf"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(self.resume_pdf_bytes)
                tmp_path = tmp.name
            try:
                await el.set_input_files(tmp_path)
                logger.info("  Resume uploaded (%d bytes)", len(self.resume_pdf_bytes))
                self.form_responses["resume"] = tmp_path
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("  Resume upload skipped: %s", exc)

    async def _fill_custom_questions(self) -> None:
        """Detect and fill Greenhouse custom questions using selectors + Haiku for unknowns."""
        questions = await self.page.locator(".field").all()
        for q in questions:
            try:
                label_el = q.locator("label").first
                label_text = (await label_el.text_content() or "").strip()
                if not label_text:
                    continue

                question_key = _slugify(label_text)

                # Skip fields we already filled above
                if question_key in ("first_name", "last_name", "email", "phone",
                                    "resume", "cover_letter", "linkedin", "website"):
                    continue

                input_el = q.locator("input[type=text], input[type=number], textarea, select").first

                tag = await input_el.evaluate("el => el.tagName.toLowerCase()")
                if tag == "select":
                    result = resolve_answer(label_text, question_key, self.profile, self.saved_answers)
                    if result.get("answer"):
                        await self._select_option(
                            f'select[id="{await input_el.get_attribute("id")}"]',
                            result["answer"],
                            question_key,
                        )
                else:
                    result = resolve_answer(label_text, question_key, self.profile, self.saved_answers)
                    if result.get("answer"):
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
                await self.page.wait_for_load_state("networkidle", timeout=15_000)
                submitted = True
                confirmation_number = await _extract_confirmation(self.page)
                screenshot_path = await capture(self.page, "confirmation")
                self._log_step(log, "confirmation_detected", confirmation_number or "none")
            except Exception as exc:
                self._log_step(log, "post_submit_wait_failed", str(exc), ok=False)

        return {
            "submitted": submitted,
            "missing_info": False,
            "missing_questions": [],
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


def _company_name_to_slug(name: str) -> str:
    """Convert a company name to a likely Greenhouse board token."""
    slug = re.sub(r"[^a-z0-9]", "", name.lower())
    return slug or ""

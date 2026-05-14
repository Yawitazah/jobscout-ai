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
_LOCATION = 'input[id="candidate-location"], input[id*="location"][type="text"]'
_RESUME_UPLOAD = 'input[type="file"][id*="resume"], input[type="file"][name*="resume"]'
_COVER_LETTER_TEXTAREA = 'textarea[id*="cover_letter"], textarea[name*="cover_letter"]'
_COVER_LETTER_UPLOAD = 'input[type="file"][id*="cover_letter"], input[type="file"][name*="cover_letter"]'
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
        company_name: str = "",
    ) -> None:
        super().__init__(page, profile, saved_answers)
        self.apply_url = apply_url
        self.cover_letter_text = cover_letter_text
        self.resume_pdf_bytes = resume_pdf_bytes
        self.company_name = company_name
        self._orig_page = page  # may be replaced by iframe frame in _switch_to_greenhouse_iframe
        self._missing_required: list[str] = []

    async def fill(self) -> None:
        await self.page.goto(self.apply_url, wait_until="domcontentloaded", timeout=30_000)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=15_000)
        except Exception:
            pass

        logger.info("  Loaded: %s | %s", self.page.url, await self.page.title())

        # Step 1: if not already on a Greenhouse board, try to resolve the canonical URL
        canonical = await self._resolve_greenhouse_url()
        if canonical and canonical != self.page.url:
            logger.info("  Navigating to canonical Greenhouse URL: %s", canonical)
            await self.page.goto(canonical, wait_until="domcontentloaded", timeout=30_000)
            try:
                await self.page.wait_for_load_state("networkidle", timeout=15_000)
            except Exception:
                pass
            logger.info("  After resolve: %s | %s", self.page.url, await self.page.title())

        # Step 2: if still on a job listing page (not yet the form), click Apply
        if not await self._is_on_application_form():
            logger.info("  Not on application form yet — looking for Apply button")
            await self._click_apply_and_wait()
            logger.info("  After Apply click: %s | %s", self.page.url, await self.page.title())

        # Step 3: wait for the form to render and switch to the iframe if needed
        await self._wait_for_form()
        await self._switch_to_greenhouse_iframe()

        # Diagnostic: dump visible input fields so we can tune selectors
        await self._log_form_fields()

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
        await self._fill_text(_LOCATION, self.profile.get("location") or "", "location")

        if self.cover_letter_text:
            # Try textarea first (old Greenhouse), then file upload (new Greenhouse)
            filled = await self._fill_text(_COVER_LETTER_TEXTAREA, self.cover_letter_text, "cover_letter")
            if not filled:
                await self._upload_text_as_file(_COVER_LETTER_UPLOAD, self.cover_letter_text, "cover_letter.txt", "cover_letter")

        await self._upload_resume()
        self._missing_required = await self._fill_custom_questions()

    async def _resolve_greenhouse_url(self) -> str | None:
        """
        If the current page is a company-hosted Greenhouse embed, return the
        canonical boards.greenhouse.io URL so we can navigate there directly.

        Strategies tried in order:
          1. Playwright frame objects (for already-loaded iframes)
          2. DOM <iframe src> inspection
          3. gh_jid param + company name -> construct canonical URL
        """
        current_url = self.page.url

        # Already on a Greenhouse board -- nothing to resolve
        if "boards.greenhouse.io" in current_url or "job-boards.greenhouse.io" in current_url:
            return None

        # Strategy 1: Playwright frame objects (populated after networkidle)
        try:
            for frame in self.page.frames:
                url = frame.url or ""
                if "greenhouse.io" in url and ("boards" in url or "jobs" in url):
                    logger.info("  Greenhouse iframe found via frame list: %s", url)
                    return url
        except Exception as exc:
            logger.debug("Frame inspection failed: %s", exc)

        # Strategy 2: DOM <iframe src> or <script> containing board URL
        try:
            iframe_src = await self.page.evaluate("""() => {
                // Check iframes
                for (const f of document.querySelectorAll('iframe')) {
                    if (f.src && f.src.includes('greenhouse.io')) return f.src;
                }
                // Check scripts for embedded board URL patterns
                for (const s of document.querySelectorAll('script')) {
                    const m = s.textContent.match(/https:\\/\\/boards\\.greenhouse\\.io\\/[a-z0-9_-]+\\/jobs\\/\\d+/i);
                    if (m) return m[0];
                }
                return null;
            }""")
            if iframe_src:
                logger.info("  Greenhouse embed found in DOM: %s", iframe_src)
                return iframe_src
        except Exception as exc:
            logger.debug("DOM iframe search failed: %s", exc)

        # Strategy 3: gh_jid in URL + company name -> construct canonical apply URL
        gh_jid_match = re.search(r"gh_jid=(\d+)", current_url) or re.search(r"gh_jid=(\d+)", self.apply_url)
        if gh_jid_match:
            gh_jid = gh_jid_match.group(1)
            board_token = await self._extract_board_token() or _company_name_to_slug(self.company_name)
            if board_token:
                # Go directly to the application form (try both Greenhouse board domains)
                # Newer Greenhouse uses job-boards.greenhouse.io
                candidate = f"https://job-boards.greenhouse.io/{board_token}/jobs/{gh_jid}"
                logger.info("  Constructed Greenhouse apply URL: %s", candidate)
                return candidate
            else:
                logger.warning("  gh_jid=%s found but no company slug to build canonical URL", gh_jid)

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

    async def _is_on_application_form(self) -> bool:
        """Return True if the current page looks like a Greenhouse application form."""
        try:
            # Check if first_name field is visible quickly
            el = self.page.locator(_FIRST_NAME).first
            await el.wait_for(state="visible", timeout=2_000)
            return True
        except Exception:
            pass
        # Also check for common form container class
        try:
            count = await self.page.locator("#application_form, #application, form#new_application").count()
            return count > 0
        except Exception:
            return False

    async def _click_apply_and_wait(self) -> None:
        """Find and click an Apply button, then wait for the form to load."""
        selectors = [
            'a[href*="/applications/new"]',
            'a[href*="apply"]',
            'button:text-matches("Apply for this job", "i")',
            'a:text-matches("Apply for this job", "i")',
            'button:text-matches("Apply Now", "i")',
            'a:text-matches("Apply Now", "i")',
            'button:text-matches("Apply", "i")',
            '.apply-button',
            '[data-provides="job-apply-button"]',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                await el.wait_for(state="visible", timeout=2_000)
                href = await el.get_attribute("href") if await el.evaluate("el => el.tagName") == "A" else None
                await el.click()
                logger.info("  Clicked apply button: %s", sel)
                try:
                    await self.page.wait_for_load_state("networkidle", timeout=15_000)
                except Exception:
                    pass
                return
            except Exception:
                continue
        logger.warning("  No Apply button found — will attempt to fill current page as-is")

    async def _switch_to_greenhouse_iframe(self) -> None:
        """
        If the application form is inside a Greenhouse iframe (common for company-hosted
        pages like stripe.com/jobs/.../apply), switch self.page to that frame so all
        subsequent fill/click operations work inside it.
        """
        try:
            # Wait for the iframe to be attached (it may appear after page load)
            iframe_el = self.page.frame_locator(
                'iframe[src*="greenhouse.io"], iframe#grnhse_iframe, iframe[id*="greenhouse"]'
            )
            # Check if there's content inside the iframe
            await iframe_el.locator("body").wait_for(state="attached", timeout=10_000)
            # Find the matching Playwright Frame object
            for frame in self.page.frames:
                if "greenhouse.io" in (frame.url or ""):
                    logger.info("  Switching to Greenhouse iframe: %s", frame.url)
                    # Patch self.page to point to the frame so all locator calls use it
                    self._orig_page = self.page  # keep reference for submit
                    self.page = frame  # type: ignore[assignment]
                    return
        except Exception as exc:
            logger.debug("iframe switch skipped: %s", exc)

    async def _wait_for_form(self, timeout: int = 15_000) -> None:
        """Wait until at least one visible input appears (handles React lazy renders)."""
        try:
            await self.page.wait_for_selector(
                "input:not([type=hidden]):not([type=submit]), textarea",
                state="visible",
                timeout=timeout,
            )
            logger.info("  Form inputs detected on page")
        except Exception:
            logger.warning("  No inputs found after %dms — may be an SPA still loading", timeout)

    async def _log_form_fields(self) -> None:
        """Dump visible input/textarea fields (and iframe info) to the log."""
        try:
            fields = await self.page.evaluate("""() => {
                const inputs = document.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select');
                const iframes = document.querySelectorAll('iframe');
                return {
                    fields: Array.from(inputs).slice(0, 20).map(el => ({
                        tag: el.tagName,
                        type: el.type || '',
                        id: el.id || '',
                        name: el.name || '',
                        placeholder: el.placeholder || '',
                        label: (() => {
                            const lbl = document.querySelector('label[for="' + el.id + '"]');
                            return lbl ? lbl.textContent.trim().slice(0, 60) : '';
                        })(),
                    })),
                    iframes: Array.from(iframes).map(f => ({ src: f.src, id: f.id, name: f.name })),
                };
            }""")
            logger.info("  Form fields on page (%d found), iframes (%d):",
                        len(fields["fields"]), len(fields["iframes"]))
            for f in fields["fields"]:
                logger.info("    <%s type=%s id=%r name=%r> label=%r",
                            f["tag"], f["type"], f["id"], f["name"], f["label"])
            for iframe in fields["iframes"]:
                logger.info("    IFRAME: src=%r id=%r name=%r", iframe["src"], iframe["id"], iframe["name"])
        except Exception as exc:
            logger.debug("Field dump failed: %s", exc)

    async def _upload_text_as_file(self, selector: str, text: str, filename: str, label: str) -> bool:
        """Write text to a temp file and upload it via a file input."""
        try:
            el = self.page.locator(selector).first
            await el.wait_for(state="attached", timeout=3_000)
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1],
                                             mode="w", encoding="utf-8") as tmp:
                tmp.write(text)
                tmp_path = tmp.name
            try:
                await el.set_input_files(tmp_path)
                logger.info("  Uploaded %s as file (%d chars)", label, len(text))
                self.form_responses[label] = f"[file:{filename}]"
                return True
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
        except Exception as exc:
            logger.debug("Text file upload for %s skipped: %s", label, exc)
            return False

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

    async def _fill_custom_questions(self) -> list[str]:
        """
        Fill Greenhouse custom questions from profile data only — no AI calls.
        Returns a list of question labels that are required but could not be answered.
        """
        missing: list[str] = []
        questions = await self.page.locator(".field").all()
        for q in questions:
            try:
                label_el = q.locator("label").first
                label_text = (await label_el.text_content() or "").strip()
                if not label_text:
                    continue

                question_key = _slugify(label_text)
                is_required = "*" in label_text

                # Skip fields already filled in the standard fill pass
                if question_key in ("first_name", "last_name", "email", "phone",
                                    "resume", "cover_letter", "linkedin", "website",
                                    "location", "candidate_location"):
                    continue

                # Resolve from profile/saved_answers — no AI
                result = resolve_answer(label_text, question_key, self.profile, self.saved_answers)
                answer = result.get("answer")

                if answer:
                    input_el = q.locator("input[type=text], input[type=number], textarea, select").first
                    try:
                        tag = await input_el.evaluate("el => el.tagName.toLowerCase()")
                        if tag == "select":
                            el_id = await input_el.get_attribute("id") or ""
                            await self._select_option(f'select[id="{el_id}"]', answer, question_key)
                        else:
                            await input_el.fill(answer)
                            self.form_responses[question_key] = answer
                    except Exception as exc:
                        logger.debug("Custom field fill failed (%s): %s", question_key, exc)
                elif is_required:
                    # Required field we cannot answer — track it
                    clean_label = label_text.replace("*", "").strip()
                    missing.append(f"{question_key} | {clean_label}")
                    logger.info("  Required field with no answer: %s", clean_label)

            except Exception as exc:
                logger.debug("Custom question processing skipped: %s", exc)

        return missing

    async def submit_with_proof(self) -> dict:
        log: list[dict] = []
        submitted = False
        confirmation_number = None
        screenshot_path: bytes | None = None

        self._log_step(log, "navigate", self.apply_url)

        # If required fields couldn't be filled, stop and request more info
        if self._missing_required:
            logger.info("  Stopping — %d required field(s) unanswered: %s",
                        len(self._missing_required), self._missing_required)
            return {
                "submitted": False,
                "missing_info": True,
                "missing_questions": self._missing_required,
                "confirmation_number": None,
                "confirmation_email": None,
                "screenshot_bytes": None,
                "form_responses": self.form_responses,
                "submission_log": log,
            }

        submit_ok = await self._click(_SUBMIT, "submit")
        self._log_step(log, "submit_click", _SUBMIT, submit_ok)

        if submit_ok:
            try:
                await self.page.wait_for_load_state("networkidle", timeout=15_000)
                # Verify the page actually shows success — don't assume submit worked
                page_text = await self.page.inner_text("body")
                success_words = ["thank you", "application received", "successfully",
                                 "submitted", "confirmation", "we'll be in touch"]
                if any(w in page_text.lower() for w in success_words):
                    submitted = True
                    confirmation_number = await _extract_confirmation(self.page)
                    screenshot_path = await capture(self._orig_page, "confirmation")
                    self._log_step(log, "confirmation_detected", confirmation_number or "none")
                    logger.info("  Success page confirmed")
                else:
                    # Page didn't change to a success state — likely a validation error
                    screenshot_path = await capture(self._orig_page, "post_submit")
                    self._log_step(log, "no_success_message", "page did not confirm submission", ok=False)
                    logger.warning("  Submit clicked but no success message found on page")
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

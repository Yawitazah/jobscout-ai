from __future__ import annotations

import asyncio
import logging
import os
import re
import tempfile
import time
from datetime import datetime, timezone
from typing import Any

from playwright.async_api import Page

from app.agent.answer_resolver import resolve_answer
from app.agent.form_filler import FormFiller
from app.agent.screenshots import capture

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Standard Greenhouse field selectors
# ---------------------------------------------------------------------------
_FIRST_NAME = 'input[id="first_name"]'
_LAST_NAME  = 'input[id="last_name"]'
_EMAIL      = 'input[id="email"]'
_PHONE      = 'input[id="phone"]'
_LOCATION   = 'input[id="candidate-location"]'
_RESUME_UPLOAD        = 'input[type="file"][id="resume"], input[type="file"][name*="resume"]'
_COVER_LETTER_TEXTAREA = 'textarea[id*="cover_letter"], textarea[name*="cover_letter"]'
_COVER_LETTER_UPLOAD  = 'input[type="file"][id="cover_letter"], input[type="file"][name*="cover_letter"]'
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
        supabase: Any = None,
        user_id: str | None = None,
        app_id: str | None = None,
    ) -> None:
        super().__init__(page, profile, saved_answers)
        self.apply_url = apply_url
        self.cover_letter_text = cover_letter_text
        self.resume_pdf_bytes = resume_pdf_bytes
        self.company_name = company_name
        self._orig_page = page
        self._missing_required: list[str] = []
        self._has_captcha: bool = False
        self._supabase = supabase
        self._user_id = user_id
        self._app_id = app_id

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    async def fill(self) -> None:
        # 1. Navigate to the source URL
        await self.page.goto(self.apply_url, wait_until="domcontentloaded", timeout=30_000)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=15_000)
        except Exception:
            pass
        logger.info("  Loaded: %s | %s", self.page.url, await self.page.title())

        # 1b. If we're on a company-hosted page with gh_jid or an embed,
        # resolve to the canonical job-boards.greenhouse.io URL and navigate
        # there directly. Without this, sites like stripe.com/jobs/search?gh_jid=...
        # leave the agent stuck on the search/embed page where submit silently fails.
        canonical = await self._resolve_greenhouse_url()
        if canonical and canonical != self.page.url:
            logger.info("  Navigating to canonical Greenhouse URL: %s", canonical)
            await self.page.goto(canonical, wait_until="domcontentloaded", timeout=30_000)
            try:
                await self.page.wait_for_load_state("networkidle", timeout=15_000)
            except Exception:
                pass
            logger.info("  After resolve: %s | %s", self.page.url, await self.page.title())

        # 2. If form isn't visible, click Apply button
        if not await self._is_on_application_form():
            logger.info("  Clicking Apply button")
            await self._click_apply_and_wait()
            logger.info("  After Apply: %s", self.page.url)

        # 3. Wait for Greenhouse form or iframe, then switch in
        await self._wait_for_gh_form_or_iframe()
        await self._switch_to_greenhouse_iframe()

        # Debug dump
        await self._log_form_fields()

        # 4. Fill standard fields
        name  = (self.profile.get("full_name") or "").split(" ", 1)
        first = name[0] if name else ""
        last  = name[1] if len(name) > 1 else ""

        await self._fill_text(_FIRST_NAME, first,  "first_name")
        await self._fill_text(_LAST_NAME,  last,   "last_name")
        await self._fill_text(
            _EMAIL,
            self.profile.get("resume_email") or self.profile.get("email") or "",
            "email",
        )
        await self._fill_phone()
        await self._fill_country_field()
        await self._fill_location_with_autocomplete(self._city_from_location())

        # 5. Cover letter
        if self.cover_letter_text:
            filled = await self._fill_text(_COVER_LETTER_TEXTAREA, self.cover_letter_text, "cover_letter")
            if not filled:
                await self._upload_text_as_file(
                    _COVER_LETTER_UPLOAD, self.cover_letter_text, "cover_letter.txt", "cover_letter"
                )

        # 6. Resume
        await self._upload_resume()

        # 7. Custom questions (react-selects, checkboxes, free-text)
        self._missing_required = await self._fill_custom_questions()

        # 8. Detect human-only gates (reCAPTCHA / hCaptcha). If present, the
        #    agent cannot submit — it will pause and wait for the user.
        self._has_captcha = await self._detect_captcha()

    # ------------------------------------------------------------------
    # Navigation helpers
    # ------------------------------------------------------------------

    async def _resolve_greenhouse_url(self) -> str | None:
        """
        Resolve company-hosted Greenhouse embeds to the canonical
        job-boards.greenhouse.io URL. Strategies, in order:
          1. Inspect Playwright frame list for a greenhouse.io iframe.
          2. Inspect the DOM <iframe src> / inline scripts.
          3. Construct from gh_jid + company slug.
        Returns None when no resolution is possible (or already canonical).
        """
        current_url = self.page.url
        if "boards.greenhouse.io" in current_url or "job-boards.greenhouse.io" in current_url:
            return None

        try:
            for frame in self.page.frames:
                url = frame.url or ""
                if "greenhouse.io" in url and ("boards" in url or "jobs" in url):
                    logger.info("  Greenhouse iframe found via frame list: %s", url)
                    return url
        except Exception as exc:
            logger.debug("Frame inspection failed: %s", exc)

        try:
            iframe_src = await self.page.evaluate("""() => {
                for (const f of document.querySelectorAll('iframe')) {
                    if (f.src && f.src.includes('greenhouse.io')) return f.src;
                }
                for (const s of document.querySelectorAll('script')) {
                    const m = s.textContent.match(/https:\\/\\/(?:job-)?boards\\.greenhouse\\.io\\/[a-z0-9_-]+\\/jobs\\/\\d+/i);
                    if (m) return m[0];
                }
                return null;
            }""")
            if iframe_src:
                logger.info("  Greenhouse embed found in DOM: %s", iframe_src)
                return iframe_src
        except Exception as exc:
            logger.debug("DOM iframe search failed: %s", exc)

        gh_jid_match = re.search(r"gh_jid=(\d+)", current_url) or re.search(r"gh_jid=(\d+)", self.apply_url)
        if gh_jid_match:
            gh_jid = gh_jid_match.group(1)
            board_token = await self._extract_board_token() or _company_name_to_slug(self.company_name)
            if board_token:
                candidate = f"https://job-boards.greenhouse.io/{board_token}/jobs/{gh_jid}"
                logger.info("  Constructed canonical Greenhouse URL: %s", candidate)
                return candidate
            logger.warning("  gh_jid=%s found but no board token / company slug available", gh_jid)
        return None

    async def _extract_board_token(self) -> str | None:
        """Look for a Greenhouse board token in inline scripts or data attrs."""
        try:
            return await self.page.evaluate("""() => {
                for (const s of document.querySelectorAll('script')) {
                    const m = s.textContent.match(/['"](?:job-)?boards\\.greenhouse\\.io\\/([a-z0-9_-]+)['"]/i);
                    if (m) return m[1];
                }
                const el = document.querySelector('[data-greenhouse-job-board]');
                if (el) return el.getAttribute('data-greenhouse-job-board');
                return null;
            }""")
        except Exception:
            return None

    async def _detect_captcha(self) -> bool:
        """Return True if the form has a reCAPTCHA / hCaptcha widget."""
        captcha_selectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            'iframe[title*="reCAPTCHA" i]',
            'div.g-recaptcha',
            'div.h-captcha',
            'textarea[id^="g-recaptcha-response"]',
            '[data-sitekey]',
        ]
        for sel in captcha_selectors:
            try:
                if await self.page.locator(sel).count() > 0:
                    logger.info("  Captcha detected on form (selector: %s)", sel)
                    return True
            except Exception:
                pass
        return False

    async def _is_on_application_form(self) -> bool:
        try:
            await self.page.locator(_FIRST_NAME).first.wait_for(state="visible", timeout=2_000)
            return True
        except Exception:
            pass
        try:
            return await self.page.locator(
                "#application_form, #application, form#new_application"
            ).count() > 0
        except Exception:
            return False

    async def _click_apply_and_wait(self) -> None:
        selectors = [
            'a[href*="/applications/new"]',
            'button:text-matches("Apply for this job", "i")',
            'a:text-matches("Apply for this job", "i")',
            'button:text-matches("Apply Now", "i")',
            'a:text-matches("Apply Now", "i")',
            'button:text-matches("Apply", "i")',
            'a:text-matches("Apply", "i")',
            '.apply-button',
            '[data-provides="job-apply-button"]',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                await el.wait_for(state="visible", timeout=500)
                await el.click()
                logger.info("  Clicked: %s", sel)
                try:
                    await self.page.wait_for_load_state("networkidle", timeout=10_000)
                except Exception:
                    pass
                return
            except Exception:
                continue
        logger.warning("  No Apply button found")

    async def _wait_for_gh_form_or_iframe(self, timeout: int = 20_000) -> None:
        sel = (
            'input[id="first_name"], input[id="email"], '
            'iframe[src*="greenhouse.io"], iframe#grnhse_iframe'
        )
        try:
            await self.page.wait_for_selector(sel, state="attached", timeout=timeout)
            logger.info("  Greenhouse form or iframe detected")
        except Exception:
            logger.warning("  Greenhouse form/iframe not found after %dms", timeout)

    async def _switch_to_greenhouse_iframe(self) -> None:
        _SEL = 'iframe[src*="greenhouse.io"], iframe#grnhse_iframe, iframe[id*="greenhouse"]'
        try:
            count = await self.page.locator(_SEL).count()
            if count == 0:
                return
        except Exception:
            return

        try:
            await self.page.wait_for_timeout(2_000)
        except Exception:
            pass

        for frame in self.page.frames:
            url = frame.url or ""
            if "greenhouse.io" in url:
                logger.info("  Switching into Greenhouse iframe: %s", url)
                self._orig_page = self.page
                self.page = frame  # type: ignore[assignment]
                try:
                    await frame.wait_for_selector(
                        'input:not([type=hidden]):not([type=submit])',
                        state="visible", timeout=15_000,
                    )
                    logger.info("  Iframe inputs ready")
                except Exception as exc:
                    logger.debug("  Iframe wait: %s", exc)
                return

    # ------------------------------------------------------------------
    # Standard field fillers
    # ------------------------------------------------------------------

    async def _fill_phone(self) -> None:
        """Fill phone number. The country code dropdown uses react-select."""
        phone = self.profile.get("phone") or ""
        if not phone:
            return
        # Set country code to US (react-select with id="country")
        try:
            count = await self.page.locator('input[id="country"][role="combobox"]').count()
            if count > 0:
                await self._react_select_fill("country", "United States")
        except Exception:
            pass
        # Fill the actual phone number
        await self._fill_text(_PHONE, phone, "phone")

    async def _fill_country_field(self) -> None:
        """Fill standalone Country field if present (not the phone prefix one)."""
        # Some forms have a separate country-of-residence field at the top
        # The phone country selector is handled in _fill_phone
        pass

    def _city_from_location(self) -> str:
        loc = self.profile.get("location") or ""
        return loc.split(",")[0].strip()

    async def _fill_location_with_autocomplete(self, city: str) -> bool:
        """
        Greenhouse's Location (City) field is a Google Places–style autocomplete.
        Just typing leaves raw text but no selected place — Greenhouse then
        clears it on submit and shows "Please enter your location". We type,
        wait for suggestions to render (often in the PARENT document, outside
        the Greenhouse iframe), then click the first one. Keyboard fallback
        uses the parent Page (Frames don't expose .keyboard).
        """
        if not city:
            return False
        try:
            el = self.page.locator(_LOCATION).first
            await el.wait_for(state="visible", timeout=5_000)
            query = (self.profile.get("location") or city).strip().rstrip(",").strip()
            await el.click()
            await el.fill("")
            await el.type(query, delay=30)
            # Give the autocomplete time to query and render
            await self.page.wait_for_timeout(1200)

            # Google Places renders .pac-container outside iframes, in the
            # top-level document. Check the parent page first, then the frame.
            search_contexts = [self._orig_page, self.page]
            option_selectors = [
                ".pac-container .pac-item",
                ".pac-item",
                "li[role='option']",
                "[role='option']",
                ".select__option",
                ".autocomplete-suggestion",
                ".dropdown-menu .dropdown-item",
            ]
            for ctx in search_contexts:
                for sel in option_selectors:
                    try:
                        loc = ctx.locator(sel).first
                        if await loc.count() == 0:
                            continue
                        await loc.wait_for(state="visible", timeout=1_500)
                        text = (await loc.text_content() or "").strip()
                        await loc.click()
                        logger.info("  Location autocomplete picked via %s → %r", sel, text)
                        self.form_responses["location"] = text or query
                        return True
                    except Exception:
                        continue

            # Fallback: parent Page's keyboard sends ArrowDown + Enter to the
            # focused element (still the location input).
            await el.focus()
            await self._orig_page.keyboard.press("ArrowDown")
            await self._orig_page.wait_for_timeout(250)
            await self._orig_page.keyboard.press("Enter")
            logger.info("  Location autocomplete picked via keyboard fallback")
            self.form_responses["location"] = query
            return True
        except Exception as exc:
            logger.warning("  Location autocomplete failed: %s", exc)
            return False

    # ------------------------------------------------------------------
    # React-select helper
    # ------------------------------------------------------------------

    async def _react_select_fill(self, field_id: str, value: str) -> bool:
        """
        Fill a react-select combobox by matching `value` against option text.
        Filtering by typing doesn't reliably narrow the option list on every
        Greenhouse build, so we iterate all visible options and pick the best
        match: exact text → prefix → substring (in either direction). Falls
        back to the first option only when no match exists.
        """
        try:
            await self.page.click(f'#{field_id}')
            await self.page.wait_for_timeout(400)
            await self.page.fill(f'#{field_id}', value)
            await self.page.wait_for_timeout(400)
            await self.page.locator(".select__option").first.wait_for(state="visible", timeout=3_000)
            opts = await self.page.locator(".select__option").all()
            if not opts:
                return False

            v_lower = value.lower().strip()
            opt_texts: list[tuple[Any, str]] = []
            for opt in opts:
                t = (await opt.text_content() or "").strip()
                if t:
                    opt_texts.append((opt, t))

            for matcher in (
                lambda t: t == v_lower,
                lambda t: t.startswith(v_lower),
                lambda t: v_lower in t,
                lambda t: t in v_lower,
            ):
                for opt, t in opt_texts:
                    if matcher(t.lower()):
                        await opt.click()
                        logger.info("  react-select #%s → %r (match for %r)", field_id, t, value)
                        self.form_responses[field_id] = t
                        return True

            # No match — last resort, click the first option
            first_opt, first_text = opt_texts[0]
            await first_opt.click()
            logger.warning(
                "  react-select #%s → %r (no match for %r — used first option)",
                field_id, first_text, value,
            )
            self.form_responses[field_id] = first_text
            return True
        except Exception as exc:
            logger.debug("  react-select #%s failed: %s", field_id, exc)
            return False

    async def _react_select_pick(self, field_id: str, value: str) -> bool:
        """
        Open a react-select and click the option whose text matches `value` (case-insensitive).
        Falls back to clicking the first option if no exact match.
        """
        try:
            await self.page.click(f'#{field_id}')
            await self.page.wait_for_timeout(500)
            # Wait for options to appear
            await self.page.locator(".select__option").first.wait_for(state="visible", timeout=3_000)
            # Try to find matching option
            all_opts = await self.page.locator(".select__option").all()
            for opt in all_opts:
                text = (await opt.text_content() or "").strip().lower()
                if value.lower() in text or text in value.lower():
                    full_text = (await opt.text_content() or "").strip()
                    await opt.click()
                    logger.info("  react-select #%s → %r", field_id, full_text)
                    self.form_responses[field_id] = full_text
                    return True
            # Fallback: type to filter then click first
            await self.page.fill(f'#{field_id}', value)
            await self.page.wait_for_timeout(400)
            opt = self.page.locator(".select__option").first
            if await opt.count() > 0:
                full_text = (await opt.text_content() or "").strip()
                await opt.click()
                logger.info("  react-select #%s → %r (fallback)", field_id, full_text)
                self.form_responses[field_id] = full_text
                return True
        except Exception as exc:
            logger.debug("  react-select pick #%s failed: %s", field_id, exc)
        return False

    async def _react_select_by_locator(self, locator, value: str, label: str) -> bool:
        """Fill a react-select combobox when we have a locator, not an ID."""
        try:
            field_id = await locator.get_attribute("id") or ""
            if field_id:
                return await self._react_select_fill(field_id, value)
            # No ID — click directly
            await locator.click()
            await self.page.wait_for_timeout(400)
            await locator.fill(value)
            await self.page.wait_for_timeout(400)
            opt = self.page.locator(".select__option").first
            await opt.wait_for(state="visible", timeout=3_000)
            opt_text = (await opt.text_content() or "").strip()
            await opt.click()
            logger.info("  react-select [%s] → %r", label, opt_text)
            self.form_responses[label] = opt_text
            return True
        except Exception as exc:
            logger.debug("  react-select [%s] failed: %s", label, exc)
            return False

    # ------------------------------------------------------------------
    # Custom questions
    # ------------------------------------------------------------------

    async def _fill_custom_questions(self) -> list[str]:
        """
        Fill all Greenhouse custom questions.
        Strategy: iterate [id^="question_"] inputs directly — works for both
        classic boards.greenhouse.io and new job-boards.greenhouse.io React SPA.
        Handles: react-select dropdowns, checkboxes, plain text inputs.
        No AI calls — answers come from profile, saved_answers, or rule-based logic.
        """
        missing: list[str] = []

        # ── 1. Non-checkbox question inputs ───────────────────────────
        q_inputs = await self.page.locator('[id^="question_"]:not([id*="[]"])').all()
        logger.info("  Custom questions: %d non-checkbox question inputs", len(q_inputs))

        for inp in q_inputs:
            try:
                inp_id   = (await inp.get_attribute("id")   or "").strip()
                inp_role = (await inp.get_attribute("role")  or "").strip()
                inp_type = (await inp.get_attribute("type")  or "text").strip()
                if not inp_id:
                    continue

                label_text = await self._label_for_input(inp_id)
                if not label_text:
                    logger.debug("  No label for %s — skipping", inp_id)
                    continue

                is_required = "*" in label_text
                clean_label = label_text.replace("*", "").strip()
                field_key   = _slugify(clean_label)

                logger.info(
                    "  Q [%s] id=%s role=%s req=%s",
                    clean_label[:60], inp_id, inp_role, is_required,
                )

                if inp_role == "combobox":
                    answer = self._answer_for_custom_question(clean_label, field_key)
                    if answer:
                        ok = await self._react_select_fill(inp_id, answer)
                        if not ok and is_required:
                            missing.append(clean_label)
                    elif is_required:
                        logger.warning("  No answer for required dropdown: %s", clean_label)
                        missing.append(clean_label)

                elif inp_type in ("text", "number", ""):
                    answer = self._answer_for_text_question(clean_label, field_key)
                    if answer:
                        await inp.fill(str(answer))
                        self.form_responses[field_key] = str(answer)
                        logger.info("  Text [%s] → %r", clean_label[:60], str(answer)[:60])
                    elif is_required:
                        logger.warning("  No answer for required text: %s", clean_label)
                        missing.append(clean_label)

            except Exception as exc:
                logger.debug("Custom question error for %s: %s", inp_id if 'inp_id' in dir() else '?', exc)

        # ── 2. Checkbox groups ────────────────────────────────────────
        cb_inputs = await self.page.locator('[id^="question_"][id*="[]"]').all()
        logger.info("  Checkbox inputs: %d", len(cb_inputs))

        processed_groups: set[str] = set()
        for cb in cb_inputs:
            try:
                cb_id = (await cb.get_attribute("id") or "").strip()
                m = re.match(r'(question_\d+)\[\]', cb_id)
                if not m:
                    continue
                group_base = m.group(1)          # e.g. "question_63496966"
                if group_base in processed_groups:
                    continue
                processed_groups.add(group_base)

                # All checkboxes in this group
                group_cbs = await self.page.locator(f'[id^="{group_base}[]"]').all()

                # Group label — look for a label/legend/p that is NOT a checkbox label
                group_label = await self._checkbox_group_label(group_base)
                clean_group = group_label.replace("*", "").strip() or group_base
                logger.info(
                    "  CB group [%s] base=%s count=%d",
                    clean_group[:60], group_base, len(group_cbs),
                )
                await self._fill_checkbox_group_by_ids(group_cbs, clean_group)
            except Exception as exc:
                logger.debug("Checkbox group error: %s", exc)

        return missing

    async def _label_for_input(self, inp_id: str) -> str:
        """Find the label text for a given input id."""
        # Standard: label[for="ID"]
        lbl = self.page.locator(f'label[for="{inp_id}"]').first
        if await lbl.count() > 0:
            return (await lbl.text_content() or "").strip()
        # Aria: aria-label attribute
        el = self.page.locator(f'#{inp_id}').first
        if await el.count() > 0:
            aria = await el.get_attribute("aria-label") or ""
            if aria:
                return aria.strip()
        return ""

    async def _checkbox_group_label(self, group_base: str) -> str:
        """
        Find the overall question label for a checkbox group.
        Greenhouse wraps checkbox groups in a container with a <label> or <p>.
        """
        # Try: a label whose `for` starts with group_base (won't exist for groups)
        # Instead walk up from the first checkbox to find a non-for label or legend
        first_cb = self.page.locator(f'[id^="{group_base}[]"]').first
        if await first_cb.count() == 0:
            return ""
        try:
            # Greenhouse wraps custom questions in div.field or similar
            # Walk up 2–4 levels looking for a non-for label
            for depth in range(2, 6):
                ancestor_xpath = "/".join([".."] * depth)
                ancestor = first_cb.locator(f"xpath={ancestor_xpath}")
                if await ancestor.count() == 0:
                    break
                # Find a label that is NOT for a specific checkbox option
                labels = await ancestor.locator("label").all()
                for lbl in labels:
                    lbl_for = await lbl.get_attribute("for") or ""
                    if not lbl_for or group_base in lbl_for:
                        txt = (await lbl.text_content() or "").strip()
                        if txt and not any(
                            txt.upper() in country
                            for country in ("AUSTRALIA", "BELGIUM", "BRAZIL", "CANADA",
                                            "FRANCE", "GERMANY", "INDIA", "IRELAND",
                                            "UNITED STATES", "US", "UK")
                        ):
                            return txt
                # Also try <legend>
                legend = ancestor.locator("legend").first
                if await legend.count() > 0:
                    txt = (await legend.text_content() or "").strip()
                    if txt:
                        return txt
        except Exception as exc:
            logger.debug("_checkbox_group_label error: %s", exc)
        return ""

    async def _fill_checkbox_group_by_ids(self, checkboxes, group_label: str) -> None:
        """Check the appropriate checkbox(es) based on user's country."""
        is_us = _profile_looks_us(self.profile)
        logger.info("  CB group [%s] is_us=%s", group_label[:40], is_us)

        for cb in checkboxes:
            try:
                cb_id = await cb.get_attribute("id") or ""
                lbl = self.page.locator(f'label[for="{cb_id}"]').first
                cb_text = ""
                if await lbl.count() > 0:
                    cb_text = (await lbl.text_content() or "").strip().upper()
                should_check = is_us and cb_text in ("US", "USA", "UNITED STATES")
                if should_check:
                    if not await cb.is_checked():
                        await cb.click()
                        logger.info("  Checked [%s] %r", group_label[:40], cb_text)
            except Exception as exc:
                logger.debug("  Checkbox error: %s", exc)

    def _answer_for_custom_question(self, label: str, key: str) -> str | None:
        """
        Rule-based answer for Greenhouse dropdown custom questions.
        Returns None if we don't know — caller handles it.
        """
        ll = label.lower()

        # Country of residence (react-select with options like "US", "UK")
        if "reside" in ll or "currently reside" in ll:
            return "US"

        # Authorization to work
        if "authorized" in ll and "work" in ll:
            return "Yes"

        # Sponsorship / work permit
        if "sponsor" in ll or "work permit" in ll or "visa" in ll:
            return "No"

        # Remote work preference
        if "remote" in ll and ("plan" in ll or "work remote" in ll):
            return "Yes"

        # Previously employed by this company
        if "ever been employed" in ll or "previously employed" in ll or "previously worked" in ll:
            return "No"

        # Interview recording consent (BrightHire, etc.)
        if any(w in ll for w in ("brighthire", "record", "transcri", "consent", "interview")):
            return "Yes"

        # Require accommodation / disability
        if "accommodation" in ll or "disability" in ll:
            return "No"

        # Check saved_answers first, then profile patterns
        result = resolve_answer(label, key, self.profile, self.saved_answers)
        return result.get("answer")

    def _answer_for_text_question(self, label: str, key: str) -> str | None:
        """Answer for plain-text custom questions."""
        ll = label.lower()
        exp = (self.profile.get("experience") or [])

        if "job title" in ll or "current.*title" in ll or "previous.*title" in ll:
            return exp[0].get("title") if exp else None
        if "employer" in ll or "company name" in ll or "current.*employer" in ll:
            return exp[0].get("company") if exp else None
        if "years of experience" in ll or "how many years" in ll:
            return str(min(len(exp) * 2, 15)) if exp else None
        if "linkedin" in ll:
            return self.profile.get("linkedin_url") or None
        if "github" in ll:
            return self.profile.get("github_url") or None
        if "website" in ll or "portfolio" in ll:
            return self.profile.get("portfolio_url") or self.profile.get("github_url") or None

        result = resolve_answer(label, key, self.profile, self.saved_answers)
        return result.get("answer")

    async def _fill_checkboxes(self, q, checkboxes, label: str) -> None:
        """Legacy helper — delegates to _fill_checkbox_group_by_ids."""
        await self._fill_checkbox_group_by_ids(checkboxes, label)

    # ------------------------------------------------------------------
    # File uploads
    # ------------------------------------------------------------------

    async def _upload_text_as_file(self, selector: str, text: str, filename: str, label: str) -> bool:
        try:
            el = self.page.locator(selector).first
            await el.wait_for(state="attached", timeout=3_000)
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=os.path.splitext(filename)[1],
                mode="w", encoding="utf-8"
            ) as tmp:
                tmp.write(text)
                tmp_path = tmp.name
            try:
                await el.set_input_files(tmp_path)
                logger.info("  Uploaded %s as file (%d chars)", label, len(text))
                self.form_responses[label] = f"[file:{filename}]"
                return True
            finally:
                try: os.unlink(tmp_path)
                except Exception: pass
        except Exception as exc:
            logger.debug("Text-file upload %s skipped: %s", label, exc)
            return False

    async def _upload_resume(self) -> None:
        if not self.resume_pdf_bytes:
            return
        try:
            el = self.page.locator(_RESUME_UPLOAD).first
            await el.wait_for(state="attached", timeout=5_000)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(self.resume_pdf_bytes)
                tmp_path = tmp.name
            try:
                await el.set_input_files(tmp_path)
                logger.info("  Resume uploaded (%d bytes)", len(self.resume_pdf_bytes))
                self.form_responses["resume"] = tmp_path
            finally:
                try: os.unlink(tmp_path)
                except Exception: pass
        except Exception as exc:
            logger.warning("  Resume upload skipped: %s", exc)

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    async def _log_form_fields(self) -> None:
        try:
            fields = await self.page.evaluate("""() => {
                const inputs  = document.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select');
                const iframes = document.querySelectorAll('iframe');
                return {
                    fields: Array.from(inputs).slice(0, 60).map(el => ({
                        tag: el.tagName, type: el.type || '', id: el.id || '', name: el.name || '',
                        role: el.getAttribute('role') || '',
                        label: (() => {
                            const lbl = document.querySelector('label[for="' + el.id + '"]');
                            return lbl ? lbl.textContent.trim().slice(0, 60) : '';
                        })(),
                    })),
                    iframes: Array.from(iframes).map(f => ({ src: f.src.slice(0, 80), id: f.id })),
                };
            }""")
            logger.info("  Form fields (%d), iframes (%d):",
                        len(fields["fields"]), len(fields["iframes"]))
            for f in fields["fields"]:
                logger.info("    <%s type=%s id=%r role=%r> label=%r",
                            f["tag"], f["type"], f["id"], f["role"], f["label"])
        except Exception as exc:
            logger.debug("Field dump: %s", exc)

    # ------------------------------------------------------------------
    # Submit
    # ------------------------------------------------------------------

    async def _wait_for_user_submit(self, log: list[dict]) -> dict:
        """
        Captcha pause: mark the row awaiting_user_submit, then watch the page
        for evidence of submission (URL change to a thanks page or success
        text) for up to 10 minutes. The user solves the captcha and clicks
        Submit in the browser themselves.
        """
        WAIT_SECONDS = 600
        POLL_INTERVAL = 2.0

        if self._supabase and self._app_id:
            try:
                self._supabase.table("applications").update({
                    "status": "awaiting_user_submit",
                    "submission_method": "agent_assisted",
                    "form_responses": self.form_responses,
                    "submission_log": log,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", self._app_id).execute()
            except Exception as exc:
                logger.warning("Could not mark awaiting_user_submit: %s", exc)

        starting_url = self.page.url
        thanks_url_re = re.compile(
            r"(thank[s_-]?you|confirm(ation)?|success|submitted|applied|complete|received)",
            re.IGNORECASE,
        )
        thanks_text_patterns = [
            "thank you for applying",
            "application received",
            "your application has been submitted",
            "we'll be in touch",
            "we will be in touch",
            "application submitted",
            "submission successful",
            "successfully submitted",
        ]

        deadline = time.monotonic() + WAIT_SECONDS
        while time.monotonic() < deadline:
            try:
                current_url = self.page.url
                if current_url != starting_url and thanks_url_re.search(current_url):
                    logger.info("  ✓ URL changed to %s — treating as submitted", current_url)
                    self._log_step(log, "user_submitted", f"url={current_url}")
                    screenshot = None
                    try:
                        screenshot = await capture(self._orig_page, "user_submitted")
                    except Exception:
                        pass
                    return {
                        "submitted": True,
                        "submission_method": "agent_assisted",
                        "missing_info": False,
                        "missing_questions": [],
                        "confirmation_number": await _extract_confirmation(self.page),
                        "confirmation_email": None,
                        "screenshot_bytes": screenshot,
                        "form_responses": self.form_responses,
                        "submission_log": log,
                    }
                try:
                    page_text = await self.page.inner_text("body", timeout=1_500)
                    lower = page_text.lower()
                    if any(p in lower for p in thanks_text_patterns):
                        logger.info("  ✓ Thank-you text detected — treating as submitted")
                        self._log_step(log, "user_submitted", "thank-you text matched")
                        screenshot = None
                        try:
                            screenshot = await capture(self._orig_page, "user_submitted")
                        except Exception:
                            pass
                        return {
                            "submitted": True,
                            "submission_method": "agent_assisted",
                            "missing_info": False,
                            "missing_questions": [],
                            "confirmation_number": await _extract_confirmation(self.page),
                            "confirmation_email": None,
                            "screenshot_bytes": screenshot,
                            "form_responses": self.form_responses,
                            "submission_log": log,
                        }
                except Exception:
                    pass
            except Exception as exc:
                logger.debug("  Poll cycle error (page may have closed): %s", exc)
                break
            await asyncio.sleep(POLL_INTERVAL)

        logger.info("  Timed out waiting for user submit. Row stays in awaiting_user_submit.")
        self._log_step(log, "timeout", f"{WAIT_SECONDS}s without confirmation", ok=False)
        return {
            "submitted": False,
            "missing_info": False,
            "missing_questions": [],
            "confirmation_number": None,
            "confirmation_email": None,
            "screenshot_bytes": None,
            "form_responses": self.form_responses,
            "submission_log": log,
            "final_status_applied": True,
        }

    async def submit_with_proof(self) -> dict:
        log: list[dict] = []
        submitted = False
        confirmation_number = None
        screenshot_bytes: bytes | None = None

        self._log_step(log, "navigate", self.apply_url)

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

        if self._has_captcha:
            logger.info(
                "  ⏸ reCAPTCHA / hCaptcha detected — pausing. Solve it in the open "
                "tab, then click Submit yourself. The agent will watch for the "
                "success page."
            )
            self._log_step(log, "captcha_pause", "waiting for user to solve captcha and submit")
            return await self._wait_for_user_submit(log)

        submit_ok = await self._click(_SUBMIT, "submit")
        self._log_step(log, "submit_click", _SUBMIT, submit_ok)

        if submit_ok:
            # Wait for Greenhouse to render the thank-you inside the iframe
            try:
                await self.page.wait_for_load_state("networkidle", timeout=8_000)
            except Exception:
                pass
            await self.page.wait_for_timeout(2_000)

            success_words = ["thank you", "application received", "successfully",
                             "submitted", "confirmation", "we'll be in touch"]

            # Check iframe first (Greenhouse embed renders thank-you inside iframe),
            # then fall back to the parent page.
            for check_page in [self.page, self._orig_page]:
                try:
                    page_text = await check_page.inner_text("body")
                    if any(w in page_text.lower() for w in success_words):
                        submitted = True
                        confirmation_number = await _extract_confirmation(check_page)
                        screenshot_bytes = await capture(self._orig_page, "confirmation")
                        self._log_step(log, "confirmed", confirmation_number or "none")
                        logger.info("  ✓ Application submitted successfully")
                        break
                except Exception:
                    pass

            if not submitted:
                screenshot_bytes = await capture(self._orig_page, "post_submit")
                self._log_step(log, "no_success_text", "no confirmation found", ok=False)
                logger.warning("  Submit clicked but no success message found")

        return {
            "submitted": submitted,
            "missing_info": False,
            "missing_questions": [],
            "confirmation_number": confirmation_number,
            "confirmation_email": None,
            "screenshot_bytes": screenshot_bytes,
            "form_responses": self.form_responses,
            "submission_log": log,
        }


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

async def _extract_confirmation(page: Page) -> str | None:
    try:
        text = await page.inner_text("body")
        for pat in [
            r"application\s*(?:id|number|#)[\s:]*([A-Z0-9\-]{4,20})",
            r"confirmation[\s:]*([A-Z0-9\-]{4,20})",
            r"reference[\s:]*([A-Z0-9\-]{4,20})",
        ]:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return m.group(1)
    except Exception:
        pass
    return None


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def _company_name_to_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


_US_STATE_CODES = frozenset({
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
})
_US_NAME_HINTS = ("USA", "UNITED STATES", "AMERICA")
# Country names that explicitly signal a non-US location and should override.
_NON_US_NAME_HINTS = (
    "CANADA", "UNITED KINGDOM", " UK", "AUSTRALIA", "GERMANY", "FRANCE",
    "INDIA", "IRELAND", "SPAIN", "ITALY", "JAPAN", "BRAZIL", "MEXICO",
    "POLAND", "PORTUGAL", "ROMANIA", "SWEDEN", "SWITZERLAND", "BELGIUM",
    "NETHERLANDS", "SINGAPORE", "ISRAEL", "NEW ZEALAND",
)


def _profile_looks_us(profile: dict) -> bool:
    """
    Return True if the profile looks like a US-based candidate. Checks:
      • explicit `country` field
      • US state codes embedded in `location` (e.g. "Rock Hill SC")
      • US name hints in `location`
    Falls back to True when nothing is set (the agent's common case).
    """
    country = (profile.get("country") or "").upper().strip()
    if country in {"US", "USA", "UNITED STATES", "AMERICA"}:
        return True
    if country and country not in {"US", "USA", "UNITED STATES", "AMERICA"}:
        return False

    loc = (profile.get("location") or "").upper()
    if not loc:
        return True  # nothing to go on — assume US
    if any(h in loc for h in _NON_US_NAME_HINTS):
        return False
    if any(h in loc for h in _US_NAME_HINTS):
        return True
    # 2-letter token that matches a US state code
    for tok in re.findall(r"\b[A-Z]{2}\b", loc):
        if tok in _US_STATE_CODES:
            return True
    return False

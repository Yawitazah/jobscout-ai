"""
PrefillCopilot — generic pure-script form-filling adapter.

Used when the job's platform doesn't have a dedicated adapter (LinkedIn Easy
Apply, Indeed, Workday, custom company portals, etc.). It uses heuristic field
matching to fill what it recognizes, then PAUSES — the user clicks Submit
themselves. While paused, the adapter watches for a URL change to a thank-you
page so it can mark the application submitted automatically.

No AI is used. Field matching is rule-based on id / name / type / label /
placeholder / aria-label.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.async_api import Page

from app.agent.form_filler import FormFiller

logger = logging.getLogger(__name__)


# How long to wait, after fill, for the user to click Submit and the URL to
# change to a confirmation page. After this, status stays as
# `awaiting_user_submit` and the browser closes.
WAIT_FOR_SUBMIT_SECONDS = int(os.environ.get("PREFILL_WAIT_SECONDS", "600"))  # 10 min
URL_POLL_INTERVAL = 2.0


# ----------------------------------------------------------------------------
# Heuristic field map. Each entry: (predicate, source) where predicate returns
# True for a field that should receive `source(profile, saved_answers)`.
# ----------------------------------------------------------------------------

def _re(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE)


# First / Last: accept the bare label too (Gravity Forms uses just "First"/"Last")
_FIRST_NAME_RE = _re(r"\bfirst[\s_-]?(?:name)?\b|\bgiven[\s_-]?name\b|\bfname\b")
_LAST_NAME_RE = _re(r"\blast[\s_-]?(?:name)?\b|\bfamily[\s_-]?name\b|\bsurname\b|\blname\b")
_FULL_NAME_RE = _re(r"\b(full[\s_-]?name|your[\s_-]?name|^name$)\b")
_EMAIL_RE = _re(r"\bemail\b|e-mail")
_CONFIRM_EMAIL_RE = _re(r"\bconfirm[\s_-]?(?:your[\s_-]?)?(?:email|e-mail)\b|\b(?:email|e-mail)[\s_-]?confirm\b|\bre[\s_-]?(?:enter[\s_-]?)?email\b")
_PHONE_RE = _re(r"\b(phone|mobile|cell|telephone)\b")
_ADDR_RE = _re(r"\b(street|address[\s_-]?line[\s_-]?1?|addr1?)\b")
_CITY_RE = _re(r"\b(city|locality|town)\b")
_STATE_RE = _re(r"\b(state|province|region)\b")
_ZIP_RE = _re(r"\b(zip|postal|postcode)\b")
_COUNTRY_RE = _re(r"\bcountry\b")
_LINKEDIN_RE = _re(r"\blinkedin\b")
_GITHUB_RE = _re(r"\bgithub\b")
_WEBSITE_RE = _re(r"\b(website|portfolio|personal[\s_-]?site|url)\b")
_RESUME_RE = _re(r"\b(resume|cv|curriculum)\b")
_COVER_LETTER_RE = _re(r"\bcover[\s_-]?letter\b")
_YEARS_EXP_RE = _re(r"years?[\s_-]?(of[\s_-]?)?experience|experience[\s_-]?(in[\s_-]?)?years?")
_SALARY_RE = _re(r"\b(salary|compensation|expected[\s_-]?(pay|comp)|desired[\s_-]?salary)\b")
_AUTH_RE = _re(r"authoriz(ed|ation).*work|legally\s+(allowed|authorized)\s+to\s+work")
_SPONSOR_RE = _re(r"\b(sponsor(ship)?|visa|work\s*permit)\b")
_REMOTE_RE = _re(r"\bremote\b")
_START_DATE_RE = _re(r"\b(start[\s_-]?date|available[\s_-]?(start|to[\s_-]?start)|earliest[\s_-]?start)\b")


def _city_from_location(loc: str) -> str:
    return loc.split(",")[0].strip() if loc else ""


def _state_from_location(loc: str) -> str:
    parts = [p.strip() for p in loc.split(",") if p.strip()] if loc else []
    return parts[1] if len(parts) >= 2 else ""


def _years_of_experience(profile: dict) -> int:
    exp = profile.get("experience") or []
    if not exp:
        return 0
    # Rough heuristic: 2 years per role, capped at 15
    return min(len(exp) * 2, 15)


def _experience_body(role: dict) -> str:
    """
    Render the body of a single experience entry: prefer explicit bullets,
    fall back to a free-text description, otherwise empty.
    Profiles in this codebase normally store a single `description` string per
    role rather than a bullet list — without this fallback the work-experience
    textarea would only contain titles + dates.
    """
    bullets = role.get("bullets") or role.get("responsibilities") or role.get("highlights") or []
    if isinstance(bullets, list) and bullets:
        return "\n".join(f"- {b}" for b in bullets[:6])
    if isinstance(bullets, str) and bullets.strip():
        return bullets.strip()
    description = (role.get("description") or "").strip()
    return description


# ----------------------------------------------------------------------------
# PrefillCopilot
# ----------------------------------------------------------------------------

class PrefillCopilot(FormFiller):
    def __init__(
        self,
        page: Page,
        profile: dict,
        saved_answers: dict[str, str],
        apply_url: str,
        cover_letter_text: str = "",
        resume_pdf_bytes: bytes | None = None,
        job: dict | None = None,
        supabase: Any = None,
        user_id: str | None = None,
        app_id: str | None = None,
    ) -> None:
        super().__init__(page, profile, saved_answers)
        self.apply_url = apply_url
        self.cover_letter_text = cover_letter_text
        self.resume_pdf_bytes = resume_pdf_bytes
        self.job = job or {}
        self._supabase = supabase
        self._user_id = user_id
        self._app_id = app_id
        self._log: list[dict] = []

    # ------------------------------------------------------------------
    # Fill
    # ------------------------------------------------------------------

    async def fill(self) -> None:
        await self.page.goto(self.apply_url, wait_until="domcontentloaded", timeout=30_000)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass
        logger.info("  Loaded: %s | %s", self.page.url, await self.page.title())
        self._log_step(self._log, "navigate", self.apply_url)

        # Some sites need an Apply button clicked to reveal the form
        await self._maybe_click_apply()

        filled, skipped = await self._fill_all_fields()
        await self._maybe_upload_resume()
        await self._maybe_fill_cover_letter()

        logger.info("  PrefillCopilot: filled %d field(s), skipped %d", filled, skipped)
        self._log_step(self._log, "prefill_complete", f"filled={filled} skipped={skipped}")

    async def _maybe_click_apply(self) -> None:
        # Only click Apply if the form clearly isn't on the page yet
        try:
            visible_inputs = await self.page.locator(
                'input:not([type=hidden]):not([type=submit]):visible, textarea:visible'
            ).count()
            if visible_inputs >= 3:
                return  # form likely already on screen
        except Exception:
            pass

        for sel in [
            'button:text-matches("Apply (now|for this job)", "i")',
            'a:text-matches("Apply (now|for this job)", "i")',
            'button:text-matches("Easy Apply", "i")',
            'button:text-matches("Apply", "i")',
            'a:text-matches("Apply", "i")',
        ]:
            try:
                el = self.page.locator(sel).first
                await el.wait_for(state="visible", timeout=800)
                await el.click()
                try:
                    await self.page.wait_for_load_state("networkidle", timeout=5_000)
                except Exception:
                    pass
                self._log_step(self._log, "click_apply", sel)
                return
            except Exception:
                continue

    async def _fill_all_fields(self) -> tuple[int, int]:
        """
        Walk every visible input/textarea/select on the page; for each, try to
        match it to a known profile field and fill it.
        Returns (filled_count, skipped_count).
        """
        filled = 0
        skipped = 0

        # Inputs + textareas
        inputs = await self.page.locator(
            'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]):not([type=image]), textarea'
        ).all()

        for el in inputs:
            try:
                meta = await self._field_metadata(el)
                if not meta:
                    continue
                if meta.get("readonly") or meta.get("disabled"):
                    continue
                if await self._is_already_filled(el, meta):
                    continue

                value = self._value_for_field(meta)
                if value is None:
                    skipped += 1
                    continue

                ok = await self._set_field(el, meta, value)
                if ok:
                    filled += 1
                    self.form_responses[meta["key"]] = str(value)[:200]
                    logger.info("  ✓ %s = %r", meta["key"], str(value)[:60])
                else:
                    skipped += 1
            except Exception as exc:
                logger.debug("  Field skipped: %s", exc)
                skipped += 1

        # Selects
        selects = await self.page.locator("select").all()
        for el in selects:
            try:
                meta = await self._field_metadata(el)
                if not meta:
                    continue
                value = self._value_for_field(meta)
                if value is None:
                    skipped += 1
                    continue
                ok = await self._set_select(el, meta, value)
                if ok:
                    filled += 1
                    self.form_responses[meta["key"]] = str(value)[:200]
                    logger.info("  ✓ select %s = %r", meta["key"], str(value)[:60])
                else:
                    skipped += 1
            except Exception as exc:
                logger.debug("  Select skipped: %s", exc)
                skipped += 1

        return filled, skipped

    async def _field_metadata(self, el) -> dict | None:
        """Gather id/name/type/placeholder/label/aria-label/required for a field."""
        try:
            tag = (await el.evaluate("e => e.tagName") or "").upper()
            id_ = (await el.get_attribute("id")) or ""
            name = (await el.get_attribute("name")) or ""
            type_ = (await el.get_attribute("type")) or ""
            placeholder = (await el.get_attribute("placeholder")) or ""
            aria_label = (await el.get_attribute("aria-label")) or ""
            readonly = await el.get_attribute("readonly")
            disabled = await el.get_attribute("disabled")
            label = ""
            if id_:
                try:
                    lbl_el = self.page.locator(f'label[for="{id_}"]').first
                    if await lbl_el.count() > 0:
                        label = (await lbl_el.text_content() or "").strip()
                except Exception:
                    pass
        except Exception:
            return None

        haystack = " ".join([id_, name, placeholder, aria_label, label]).strip()
        if not haystack:
            return None

        key = self._classify_field(haystack, type_, tag)
        if not key:
            return None

        return {
            "id": id_,
            "name": name,
            "type": type_,
            "tag": tag,
            "placeholder": placeholder,
            "aria_label": aria_label,
            "label": label,
            "haystack": haystack,
            "readonly": bool(readonly),
            "disabled": bool(disabled),
            "key": key,
        }

    def _classify_field(self, haystack: str, type_: str, tag: str = "") -> str | None:
        """Classify a field by its identifiers. Returns a known key or None."""
        if type_ == "email" or _EMAIL_RE.search(haystack):
            return "email"
        if type_ == "tel" or _PHONE_RE.search(haystack):
            return "phone"
        # Order matters: first/last must beat full
        if _FIRST_NAME_RE.search(haystack):
            return "first_name"
        if _LAST_NAME_RE.search(haystack):
            return "last_name"
        if _FULL_NAME_RE.search(haystack):
            return "full_name"
        if _LINKEDIN_RE.search(haystack):
            return "linkedin"
        if _GITHUB_RE.search(haystack):
            return "github"
        if _WEBSITE_RE.search(haystack):
            return "website"
        if _CITY_RE.search(haystack):
            return "city"
        if _STATE_RE.search(haystack):
            return "state"
        if _ZIP_RE.search(haystack):
            return "zip"
        if _COUNTRY_RE.search(haystack):
            return "country"
        if _ADDR_RE.search(haystack):
            return "address"
        if _YEARS_EXP_RE.search(haystack):
            return "years_experience"
        if _SALARY_RE.search(haystack):
            return "salary"
        if _AUTH_RE.search(haystack):
            return "work_authorization"
        if _SPONSOR_RE.search(haystack):
            return "sponsorship"
        if _START_DATE_RE.search(haystack):
            return "start_date"
        if _COVER_LETTER_RE.search(haystack):
            return "cover_letter"

        # Long-form (textarea) classifications. Only triggered for textareas so
        # short single-line inputs don't get a paragraph stuffed into them.
        if tag == "TEXTAREA":
            lower = haystack.lower()
            if any(p in lower for p in ("educat", "academic", "school", "degree", "university", "college")):
                return "long_education"
            if any(p in lower for p in ("current job", "current role", "current position", "currently work", "current employer", "responsibilit")):
                return "long_current_job"
            if any(p in lower for p in ("work experience", "professional experience", "relevant experience", "pertinent experience", "career history", "prior experience", "past experience")):
                return "long_work_experience"
            if any(p in lower for p in ("skills", "competenc", "technolog", "proficien")):
                return "long_skills"
            if any(p in lower for p in ("why", "motivat", "interest in", "tell us about", "about you", "describe yourself")):
                return "long_motivation"
        return None

    def _value_for_field(self, meta: dict) -> str | None:
        """Return the value to fill for a classified field, or None to skip."""
        p = self.profile
        key = meta["key"]
        location = p.get("location") or ""

        full_name = (p.get("full_name") or "").strip()
        name_parts = full_name.split(" ", 1)

        match key:
            case "email":
                return p.get("resume_email") or p.get("email") or p.get("contact_email") or None
            case "phone":
                return p.get("phone") or None
            case "first_name":
                return name_parts[0] if name_parts and name_parts[0] else None
            case "last_name":
                return name_parts[1] if len(name_parts) > 1 else None
            case "full_name":
                return full_name or None
            case "linkedin":
                return p.get("linkedin_url") or None
            case "github":
                return p.get("github_url") or None
            case "website":
                return p.get("portfolio_url") or p.get("github_url") or None
            case "city":
                return _city_from_location(location) or None
            case "state":
                return _state_from_location(location) or None
            case "country":
                return "United States"  # TODO: derive from profile when available
            case "address":
                return p.get("address") or None
            case "zip":
                return p.get("zip") or p.get("postal_code") or None
            case "years_experience":
                yrs = _years_of_experience(p)
                return str(yrs) if yrs else None
            case "salary":
                return self.saved_answers.get("salary_expectation") or None
            case "work_authorization":
                return self.saved_answers.get("work_authorization") or "Yes"
            case "sponsorship":
                return self.saved_answers.get("sponsorship") or "No"
            case "start_date":
                return self.saved_answers.get("start_date") or None
            case "cover_letter":
                return self.cover_letter_text or None
            case "long_education":
                return self._format_education() or None
            case "long_current_job":
                return self._format_current_job() or None
            case "long_work_experience":
                return self._format_work_experience() or None
            case "long_skills":
                skills = p.get("skills") or []
                return ", ".join(skills[:40]) or None
            case "long_motivation":
                return self.cover_letter_text or p.get("summary") or None
            case _:
                return None

    def _format_education(self) -> str:
        """Render profile.education as a short, readable block."""
        edu = self.profile.get("education") or []
        if not edu:
            return ""
        lines: list[str] = []
        for e in edu[:3]:
            deg = (e.get("degree") or "").strip()
            inst = (e.get("institution") or e.get("school") or "").strip()
            year = (e.get("graduation_year") or e.get("end_date") or "").strip()
            entry = ", ".join(x for x in (deg, inst) if x)
            if year:
                entry = f"{entry} ({year})" if entry else year
            if entry:
                lines.append(entry)
        return "\n".join(lines)

    def _format_current_job(self) -> str:
        """Render the most recent role as title + body (bullets or description)."""
        exp = self.profile.get("experience") or []
        if not exp:
            return ""
        e = exp[0]
        title = (e.get("title") or "").strip()
        company = (e.get("company") or "").strip()
        header = " at ".join(x for x in (title, company) if x)
        body = _experience_body(e)
        return f"{header}\n{body}".strip() if body else header

    def _format_work_experience(self) -> str:
        """Render the candidate's full work history as a readable narrative."""
        exp = self.profile.get("experience") or []
        if not exp:
            return ""
        sections: list[str] = []
        for e in exp[:5]:
            title = (e.get("title") or "").strip()
            company = (e.get("company") or "").strip()
            start = (e.get("start_date") or "").strip()
            end_raw = e.get("end_date")
            end = (end_raw if end_raw else "Present").strip() if isinstance(end_raw, str) else "Present"
            header_parts = [p for p in (title, company) if p]
            header = " at ".join(header_parts) if header_parts else "Role"
            if start or end:
                header = f"{header} ({start}–{end})"
            body = _experience_body(e)
            sections.append(f"{header}\n{body}" if body else header)
        return "\n\n".join(sections)

    async def _is_already_filled(self, el, meta: dict) -> bool:
        try:
            existing = await el.input_value()
            return bool(existing and existing.strip())
        except Exception:
            return False

    async def _set_field(self, el, meta: dict, value: str) -> bool:
        try:
            await el.scroll_into_view_if_needed(timeout=2_000)
        except Exception:
            pass
        try:
            await el.fill(value)
            return True
        except Exception as exc:
            logger.debug("  fill() failed for %s: %s — trying click+type", meta["key"], exc)
            try:
                await el.click()
                await el.type(value, delay=10)
                return True
            except Exception as exc2:
                logger.warning("  Could not set %s: %s", meta["key"], exc2)
                return False

    async def _set_select(self, el, meta: dict, value: str) -> bool:
        # Try by visible label first, then by value, then partial-match fallback
        try:
            await el.select_option(label=value)
            return True
        except Exception:
            pass
        try:
            await el.select_option(value=value)
            return True
        except Exception:
            pass
        # Fallback: list options, fuzzy match on text
        try:
            options = await el.locator("option").all()
            v_lower = value.lower()
            for opt in options:
                text = (await opt.text_content() or "").strip()
                if v_lower in text.lower() or text.lower() in v_lower:
                    val = await opt.get_attribute("value") or text
                    await el.select_option(value=val)
                    return True
        except Exception:
            pass
        return False

    def _upload_dir(self) -> str:
        """Persistent dir for uploaded files (kept so the user can verify)."""
        base = Path(__file__).resolve().parents[2] / "agent_uploads" / (self._app_id or "unknown")
        base.mkdir(parents=True, exist_ok=True)
        return str(base)

    def _candidate_slug(self) -> str:
        full = (self.profile.get("full_name") or "candidate").strip()
        cleaned = re.sub(r"[^A-Za-z0-9]+", "_", full).strip("_")
        return cleaned or "candidate"

    async def _maybe_upload_resume(self) -> None:
        if not self.resume_pdf_bytes:
            return
        selectors = [
            'input[type="file"][id*="resume" i]',
            'input[type="file"][name*="resume" i]',
            'input[type="file"][id*="cv" i]',
            'input[type="file"][name*="cv" i]',
            'input[type="file"][accept*="pdf"]',
            'input[type="file"]',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                if await el.count() == 0:
                    continue
                out_name = f"{self._candidate_slug()}_Resume.pdf"
                out_path = os.path.join(self._upload_dir(), out_name)
                with open(out_path, "wb") as f:
                    f.write(self.resume_pdf_bytes)
                await el.set_input_files(out_path)
                logger.info("  ✓ Resume uploaded (%d bytes) -> %s", len(self.resume_pdf_bytes), out_path)
                self.form_responses["resume"] = out_path
                return
            except Exception as exc:
                logger.debug("  Resume upload failed for %s: %s", sel, exc)
        logger.info("  No resume file input found on page")

    async def _maybe_fill_cover_letter(self) -> None:
        if not self.cover_letter_text:
            return
        # Try textarea first
        for sel in [
            'textarea[id*="cover" i]',
            'textarea[name*="cover" i]',
            'textarea[aria-label*="cover" i]',
        ]:
            try:
                el = self.page.locator(sel).first
                if await el.count() == 0:
                    continue
                await el.fill(self.cover_letter_text)
                logger.info("  ✓ Cover letter pasted (%d chars)", len(self.cover_letter_text))
                self.form_responses["cover_letter"] = "[textarea]"
                return
            except Exception as exc:
                logger.debug("  Cover letter textarea fill failed: %s", exc)
        # Fall back to file upload
        for sel in [
            'input[type="file"][id*="cover" i]',
            'input[type="file"][name*="cover" i]',
        ]:
            try:
                el = self.page.locator(sel).first
                if await el.count() == 0:
                    continue
                out_name = f"{self._candidate_slug()}_cover_letter.txt"
                out_path = os.path.join(self._upload_dir(), out_name)
                with open(out_path, "w", encoding="utf-8") as f:
                    f.write(self.cover_letter_text)
                await el.set_input_files(out_path)
                logger.info("  ✓ Cover letter uploaded -> %s", out_path)
                self.form_responses["cover_letter"] = out_path
                return
            except Exception as exc:
                logger.debug("  Cover letter file upload failed: %s", exc)

    # ------------------------------------------------------------------
    # Submit (handed off to user)
    # ------------------------------------------------------------------

    async def submit_with_proof(self) -> dict:
        """
        PrefillCopilot does NOT auto-submit. Instead it:
        1. Marks the application `awaiting_user_submit` and persists form_responses.
        2. Waits up to WAIT_FOR_SUBMIT_SECONDS, watching for the URL to change
           to a confirmation/thanks page (indicating the user clicked Submit).
        3. If detected: returns submitted=True.
        4. If timeout: returns final_status_applied=True so local_runner doesn't
           overwrite the awaiting_user_submit status with submit_failed.
        """
        starting_url = self.page.url
        self._log_step(self._log, "awaiting_user_submit", starting_url)

        if self._supabase and self._app_id:
            try:
                self._supabase.table("applications").update({
                    "status": "awaiting_user_submit",
                    "submission_method": "agent_assisted",
                    "form_responses": self.form_responses,
                    "submission_log": self._log,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", self._app_id).execute()
            except Exception as exc:
                logger.warning("Could not mark awaiting_user_submit: %s", exc)

        logger.info("  ── Pre-fill complete. Review the form and click Submit when ready.")
        logger.info("  ── Waiting up to %ds for confirmation page…", WAIT_FOR_SUBMIT_SECONDS)

        deadline = time.monotonic() + WAIT_FOR_SUBMIT_SECONDS
        while time.monotonic() < deadline:
            try:
                current_url = self.page.url
                if current_url != starting_url and _looks_like_thanks_url(current_url):
                    logger.info("  ✓ URL changed to %s — treating as submitted", current_url)
                    screenshot = None
                    try:
                        screenshot = await self.page.screenshot(type="png", full_page=False)
                    except Exception:
                        pass
                    return {
                        "submitted": True,
                        "missing_info": False,
                        "missing_questions": [],
                        "confirmation_number": await _extract_confirmation(self.page),
                        "confirmation_email": None,
                        "screenshot_bytes": screenshot,
                        "form_responses": self.form_responses,
                        "submission_log": self._log + [{"action": "url_changed", "detail": current_url, "ok": True}],
                    }
                # Also detect a thanks message on the page text (URL might not change for SPAs)
                try:
                    page_text = await self.page.inner_text("body", timeout=1_500)
                    if _has_thanks_text(page_text):
                        logger.info("  ✓ Detected thank-you text on page — treating as submitted")
                        screenshot = None
                        try:
                            screenshot = await self.page.screenshot(type="png", full_page=False)
                        except Exception:
                            pass
                        return {
                            "submitted": True,
                            "missing_info": False,
                            "missing_questions": [],
                            "confirmation_number": await _extract_confirmation(self.page),
                            "confirmation_email": None,
                            "screenshot_bytes": screenshot,
                            "form_responses": self.form_responses,
                            "submission_log": self._log + [{"action": "thanks_text", "detail": "page text matched", "ok": True}],
                        }
                except Exception:
                    pass
            except Exception as exc:
                logger.debug("  Poll cycle error (page may have closed): %s", exc)
                break
            await asyncio.sleep(URL_POLL_INTERVAL)

        # Timed out: leave the status alone, tell local_runner not to overwrite
        logger.info("  Timed out waiting for submit. Status remains awaiting_user_submit.")
        return {
            "submitted": False,
            "missing_info": False,
            "missing_questions": [],
            "confirmation_number": None,
            "confirmation_email": None,
            "screenshot_bytes": None,
            "form_responses": self.form_responses,
            "submission_log": self._log + [{"action": "timeout", "detail": f"{WAIT_FOR_SUBMIT_SECONDS}s", "ok": False}],
            "final_status_applied": True,
        }


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

_THANKS_URL_RE = re.compile(
    r"(thank[s_-]?you|confirm(ation)?|success|submitted|applied|complete|received)",
    re.IGNORECASE,
)

_THANKS_TEXT_PATTERNS = [
    "thank you for applying",
    "application received",
    "your application has been submitted",
    "we'll be in touch",
    "we will be in touch",
    "application submitted",
    "submission successful",
]


def _looks_like_thanks_url(url: str) -> bool:
    return bool(_THANKS_URL_RE.search(url or ""))


def _has_thanks_text(text: str) -> bool:
    t = (text or "").lower()
    return any(p in t for p in _THANKS_TEXT_PATTERNS)


async def _extract_confirmation(page: Page) -> str | None:
    try:
        text = await page.inner_text("body", timeout=2_000)
        for pat in [
            r"confirmation\s*(?:number|#|id|code)?[\s:]*([A-Z0-9\-]{4,20})",
            r"reference\s*(?:number|#|id)?[\s:]*([A-Z0-9\-]{4,20})",
            r"application\s+(?:id|number|#)[\s:]*([A-Z0-9\-]{4,20})",
        ]:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return m.group(1)
    except Exception:
        pass
    return None

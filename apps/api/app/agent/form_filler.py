from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from playwright.async_api import Page

logger = logging.getLogger(__name__)


class FormFiller(ABC):
    """Base class for ATS-specific form fillers."""

    def __init__(self, page: Page, profile: dict, saved_answers: dict[str, str]) -> None:
        self.page = page
        self.profile = profile
        self.saved_answers = saved_answers
        self.form_responses: dict[str, str] = {}

    @abstractmethod
    async def fill(self) -> None:
        """Navigate to and fill the application form."""
        ...

    @abstractmethod
    async def submit_with_proof(self) -> dict:
        """
        Submit the form and return proof dict:
        {
          "submitted": bool,
          "confirmation_number": str | None,
          "confirmation_email": str | None,
          "screenshot_path": str | None,
          "submission_log": list[dict],
        }
        """
        ...

    async def _fill_text(self, selector: str, value: str, label: str = "") -> bool:
        try:
            el = self.page.locator(selector).first
            await el.wait_for(state="visible", timeout=5000)
            await el.fill(value)
            self.form_responses[label or selector] = value
            logger.debug("Filled %s = %r", label or selector, value[:40])
            return True
        except Exception as exc:
            logger.warning("Could not fill %s: %s", label or selector, exc)
            return False

    async def _select_option(self, selector: str, value: str, label: str = "") -> bool:
        try:
            el = self.page.locator(selector).first
            await el.select_option(value=value)
            self.form_responses[label or selector] = value
            return True
        except Exception as exc:
            logger.warning("Could not select %s: %s", label or selector, exc)
            return False

    async def _click(self, selector: str, label: str = "") -> bool:
        try:
            el = self.page.locator(selector).first
            await el.wait_for(state="visible", timeout=5000)
            await el.click()
            logger.debug("Clicked %s", label or selector)
            return True
        except Exception as exc:
            logger.warning("Could not click %s: %s", label or selector, exc)
            return False

    def _log_step(self, log: list[dict], action: str, detail: str, ok: bool = True) -> None:
        log.append({"action": action, "detail": detail, "ok": ok})

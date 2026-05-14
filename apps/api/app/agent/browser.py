from __future__ import annotations

import logging
import os
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from playwright.async_api import BrowserContext, Page, async_playwright

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------------
# Default settings — overridable via environment
# ----------------------------------------------------------------------------

CDP_PORT = int(os.environ.get("CHROME_DEBUG_PORT", "9222"))
CDP_HOST = os.environ.get("CHROME_DEBUG_HOST", "localhost")


def _default_user_data_dir() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "JobScoutChromeProfile"
    return Path.home() / ".config" / "jobscout-chrome-profile"


USER_DATA_DIR = Path(os.environ.get("BROWSER_USER_DATA_DIR") or _default_user_data_dir())


# ----------------------------------------------------------------------------
# CDP detection
# ----------------------------------------------------------------------------

def _cdp_available() -> bool:
    """Return True if a Chrome instance is listening on the debug port."""
    try:
        with urllib.request.urlopen(
            f"http://{CDP_HOST}:{CDP_PORT}/json/version", timeout=2
        ) as resp:
            return resp.status == 200
    except Exception:
        return False


def _instructions_msg() -> str:
    bat = Path(__file__).resolve().parents[2] / "start_agent_chrome.bat"
    return (
        "Chrome is not running with --remote-debugging-port.\n"
        "\n"
        f"Start it once with the helper script:\n"
        f"    {bat}\n"
        "\n"
        "That opens a Chrome window using the JobScout profile (separate from your\n"
        "normal Chrome, so they don't conflict). Log in to LinkedIn / Indeed once\n"
        "in that window; the agent will reuse those cookies forever.\n"
        "\n"
        f"To use your REAL Chrome profile (with all your existing logins): close\n"
        f"all Chrome windows first, then run:\n"
        f"    chrome.exe --remote-debugging-port={CDP_PORT}\n"
    )


# ----------------------------------------------------------------------------
# Public entry point
# ----------------------------------------------------------------------------

@asynccontextmanager
async def get_page(
    headless: bool = False,
) -> AsyncGenerator[tuple[None, BrowserContext, Page], None]:
    """
    Connect to a running Chrome via CDP and yield a new tab the agent can drive.

    Key behaviour:
      • Chrome is OWNED BY YOU, not Playwright. We never call browser.close()
        or context.close() on a Chrome we didn't launch.
      • The tab the agent opens is LEFT OPEN at exit (success or failure) so
        you can see exactly where the agent stopped, fix anything, and finish
        the application manually if needed.
      • If Chrome isn't running with debugging enabled, we error out with a
        clear instruction message — no silent fallbacks that lose data.

    The `headless` argument is accepted for backwards compatibility but is
    ignored in CDP mode (Chrome's existing window is non-headless).
    """
    if not _cdp_available():
        raise RuntimeError(_instructions_msg())

    logger.info("Connecting to Chrome at http://%s:%d (CDP attach)", CDP_HOST, CDP_PORT)
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(f"http://{CDP_HOST}:{CDP_PORT}")
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await context.new_page()
        try:
            from playwright_stealth import stealth_async  # type: ignore[import-untyped]
            await stealth_async(page)
        except ImportError:
            pass

        logger.info("Opened new tab. The tab will stay open when the agent finishes.")
        try:
            yield None, context, page
        finally:
            # Do NOT close the tab. Do NOT close the browser. The user owns
            # them. Leaving the tab open is the whole point of CDP attach.
            final_url = "<page closed>"
            try:
                final_url = page.url
            except Exception:
                pass
            logger.info("Agent finished. Tab left open at: %s", final_url)

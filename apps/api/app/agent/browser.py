from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from playwright.async_api import BrowserContext, Page, async_playwright

logger = logging.getLogger(__name__)


def _default_user_data_dir() -> Path:
    """
    Dedicated Chrome profile for the JobScout agent.
    Kept separate from the user's primary Chrome so Playwright can launch even
    while regular Chrome is open. The user logs in to LinkedIn / Indeed / etc.
    in this profile once; cookies persist across runs.
    """
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "JobScoutChromeProfile"
    return Path.home() / ".config" / "jobscout-chrome-profile"


USER_DATA_DIR = Path(os.environ.get("BROWSER_USER_DATA_DIR") or _default_user_data_dir())


@asynccontextmanager
async def get_page(
    headless: bool = False,
) -> AsyncGenerator[tuple[None, BrowserContext, Page], None]:
    """
    Launch a persistent Chrome context using a dedicated user_data_dir.

    Tuple shape is `(None, context, page)` to keep the existing caller signature
    `async with get_page(...) as (_, __, page):` working unchanged. The first
    slot was a Browser; persistent_context doesn't have a separate Browser
    object, so it's None now.
    """
    USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    is_first_run = not any(USER_DATA_DIR.iterdir())
    if is_first_run:
        logger.info(
            "First run detected — profile at %s is empty. "
            "Log in to LinkedIn, Indeed, and any company portals when the browser opens; "
            "cookies will persist for future runs.",
            USER_DATA_DIR,
        )

    async with async_playwright() as pw:
        context = await pw.chromium.launch_persistent_context(
            str(USER_DATA_DIR),
            channel="chrome",
            headless=headless,
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            args=[
                "--disable-blink-features=AutomationControlled",
            ],
        )

        page = context.pages[0] if context.pages else await context.new_page()

        try:
            from playwright_stealth import stealth_async  # type: ignore[import-untyped]
            await stealth_async(page)
        except ImportError:
            pass

        try:
            yield None, context, page
        finally:
            await context.close()

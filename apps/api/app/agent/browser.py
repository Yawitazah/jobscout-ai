from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from playwright.async_api import Browser, BrowserContext, Page, async_playwright


@asynccontextmanager
async def get_page(headless: bool = True) -> AsyncGenerator[tuple[Browser, BrowserContext, Page], None]:
    """Yield a stealth-hardened Playwright page, then clean up."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=headless,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="en-US",
        )
        try:
            from playwright_stealth import stealth_async  # type: ignore[import-untyped]
            page = await context.new_page()
            await stealth_async(page)
        except ImportError:
            page = await context.new_page()

        try:
            yield browser, context, page
        finally:
            await context.close()
            await browser.close()

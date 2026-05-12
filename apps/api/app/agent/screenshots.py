from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from playwright.async_api import Page

logger = logging.getLogger(__name__)


async def capture(page: Page, label: str) -> bytes | None:
    """Take a full-page screenshot and return PNG bytes, or None on failure."""
    try:
        return await page.screenshot(full_page=True, type="png")
    except Exception as exc:
        logger.warning("Screenshot failed (%s): %s", label, exc)
        return None


async def capture_and_upload(
    page: Page,
    label: str,
    supabase_client,
    user_id: str,
    application_id: str,
) -> str | None:
    """Take screenshot and upload to Supabase storage. Returns storage path or None."""
    png = await capture(page, label)
    if png is None:
        return None

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = f"{user_id}/{application_id}/{ts}_{label}.png"

    try:
        supabase_client.storage.from_("generated-documents").upload(
            path,
            png,
            file_options={"content-type": "image/png"},
        )
        return path
    except Exception as exc:
        logger.warning("Screenshot upload failed (%s): %s", label, exc)
        return None

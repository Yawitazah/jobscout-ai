"""
Smoke test for the Greenhouse form filler.
Navigates to a public Greenhouse demo job and fills the form without submitting.

Usage:
  uv run python scripts/test_greenhouse_filler.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

from app.agent.browser import get_page  # noqa: E402
from app.agent.adapters.greenhouse_filler import GreenhouseFiller  # noqa: E402

SAMPLE_PROFILE = {
    "full_name": "Jane Smith",
    "email": "jane.smith@example.com",
    "phone": "+1 415 555 0100",
    "location": "San Francisco, CA",
    "skills": ["Python", "FastAPI", "PostgreSQL"],
    "experience": [
        {
            "title": "Senior Software Engineer",
            "company": "Acme Corp",
            "start_date": "2021-03",
            "end_date": None,
        }
    ],
}

# A real public Greenhouse job page for testing (Anthropic's own careers)
TEST_URL = "https://boards.greenhouse.io/anthropic/jobs/4020305008"


async def main() -> None:
    print("Opening browser and filling Greenhouse form (headless=False for inspection)...")
    async with get_page(headless=False) as (_, __, page):
        filler = GreenhouseFiller(
            page=page,
            profile=SAMPLE_PROFILE,
            saved_answers={},
            apply_url=TEST_URL,
        )
        await filler.fill()
        print("Form filled. Responses:")
        print(json.dumps(filler.form_responses, indent=2))
        print("\nNOT submitting — close the browser window to exit.")
        await page.wait_for_timeout(30000)


if __name__ == "__main__":
    asyncio.run(main())

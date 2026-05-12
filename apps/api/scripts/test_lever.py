#!/usr/bin/env python
"""Test the Lever adapter.

Usage:
    uv run python scripts/test_lever.py [slug]
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.scout.adapters.lever import LeverAdapter

slug = sys.argv[1] if len(sys.argv) > 1 else "netflix"


async def main():
    adapter = LeverAdapter()
    print(f"Fetching jobs for {slug!r}...")
    try:
        jobs = await adapter.fetch_company_jobs(slug)
    except Exception as e:
        print(f"ERROR: {e}")
        return

    print(f"Total jobs: {len(jobs)}\n")
    for job in jobs[:5]:
        print(f"  [{job.source_id}] {job.title}")
        print(f"    Location: {job.location}  Mode: {job.work_mode}")
        print(f"    URL: {job.source_url}")
        print(f"    Description (first 200 chars): {job.description[:200]!r}")
        print()


asyncio.run(main())

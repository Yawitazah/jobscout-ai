#!/usr/bin/env python
"""Test the Greenhouse adapter.

Usage:
    uv run python scripts/test_greenhouse.py [slug]
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.scout.adapters.greenhouse import GreenhouseAdapter

slug = sys.argv[1] if len(sys.argv) > 1 else "stripe"


async def main():
    adapter = GreenhouseAdapter()
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

    # Optional: persist
    if "--persist" in sys.argv:
        import dotenv
        dotenv.load_dotenv()
        from app.config import get_settings
        from app.db.supabase_client import get_supabase_service_client
        from app.scout.persist import upsert_job

        settings = get_settings()
        supabase = get_supabase_service_client(settings)
        print("Persisting jobs...")
        for job in jobs:
            job_id = await upsert_job(supabase, job)
            print(f"  Upserted {job.title!r} -> {job_id}")


asyncio.run(main())

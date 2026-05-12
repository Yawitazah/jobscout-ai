import hashlib

from app.scout.base import NormalizedJob


def _dedupe_hash(job: NormalizedJob) -> str:
    raw = f"{job.title}|{job.company_name}|{job.description[:200]}"
    return hashlib.sha1(raw.encode()).hexdigest()


async def upsert_job(supabase, normalized: NormalizedJob) -> str:
    # 1. Upsert company
    company_row = (
        supabase.table("companies")
        .upsert(
            {
                "name": normalized.company_name,
                "website": normalized.company_website,
                "source_platform": normalized.source_platform,
                "source_id": normalized.source_platform + ":" + normalized.company_name,
            },
            on_conflict="source_platform,source_id",
        )
        .execute()
    )
    company_id = company_row.data[0]["id"] if company_row.data else None

    # 2. Compute dedupe hash
    dedupe_hash = _dedupe_hash(normalized)

    # 3. Upsert job
    job_payload = {
        "company_id": company_id,
        "source_platform": normalized.source_platform,
        "source_id": normalized.source_id,
        "source_url": normalized.source_url,
        "title": normalized.title,
        "location": normalized.location,
        "work_mode": normalized.work_mode,
        "remote_eligibility": normalized.remote_eligibility,
        "employment_type": normalized.employment_type,
        "salary_min": normalized.salary_min,
        "salary_max": normalized.salary_max,
        "description": normalized.description,
        "posted_at": normalized.posted_at,
        "dedupe_hash": dedupe_hash,
        "raw_data": normalized.raw_data,
        "last_seen_at": "now()",
        "is_active": True,
    }

    result = (
        supabase.table("jobs")
        .upsert(job_payload, on_conflict="source_platform,source_id")
        .execute()
    )
    return result.data[0]["id"]


def upsert_job_sync(supabase, normalized: NormalizedJob) -> str:
    """Synchronous wrapper for use in Celery tasks."""
    import asyncio

    return asyncio.run(upsert_job(supabase, normalized))

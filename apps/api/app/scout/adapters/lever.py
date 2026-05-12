import datetime as dt

import httpx

from app.scout.base import NormalizedJob, SourceAdapter
from app.scout.seed.lever_companies import KNOWN_LEVER_SLUGS


class LeverAdapter(SourceAdapter):
    name = "lever"
    BASE_URL = "https://api.lever.co/v0/postings/{slug}?mode=json"

    async def fetch_company_jobs(self, slug: str) -> list[NormalizedJob]:
        url = self.BASE_URL.format(slug=slug)
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url)
            if r.status_code in (404, 403):
                return []
            r.raise_for_status()
        postings = r.json()

        jobs = []
        for p in postings:
            description = p.get("descriptionPlain") or ""
            for lst in p.get("lists", []):
                description += "\n\n" + lst.get("text", "")
            description += "\n\n" + (p.get("additionalPlain") or "")

            cats = p.get("categories", {})
            location = cats.get("location")
            commitment = cats.get("commitment")

            work_mode = self._infer_work_mode(location, description)

            posted_at = None
            if p.get("createdAt"):
                posted_at = dt.datetime.fromtimestamp(
                    p["createdAt"] / 1000, tz=dt.timezone.utc
                ).isoformat()

            jobs.append(
                NormalizedJob(
                    source_platform="lever",
                    source_id=p["id"],
                    source_url=p["hostedUrl"],
                    title=p["text"],
                    company_name=slug,
                    location=location,
                    work_mode=work_mode,
                    employment_type=commitment,
                    description=description.strip(),
                    posted_at=posted_at,
                    raw_data=p,
                )
            )
        return jobs

    def _infer_work_mode(self, location: str | None, text: str) -> str:
        loc = (location or "").lower()
        if "remote" in loc:
            return "remote"
        text_l = (text or "").lower()[:500]
        if "remote" in text_l:
            return "remote"
        if "hybrid" in text_l:
            return "hybrid"
        return "onsite"

    def list_known_companies(self) -> list[str]:
        return KNOWN_LEVER_SLUGS

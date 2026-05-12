import httpx
from bs4 import BeautifulSoup

from app.scout.base import NormalizedJob, SourceAdapter
from app.scout.seed.greenhouse_companies import KNOWN_GREENHOUSE_SLUGS


class GreenhouseAdapter(SourceAdapter):
    name = "greenhouse"
    BASE_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"

    async def fetch_company_jobs(self, slug: str) -> list[NormalizedJob]:
        url = self.BASE_URL.format(slug=slug) + "?content=true"
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, headers={"Accept": "application/json"})
            if r.status_code == 404:
                return []
            r.raise_for_status()
        data = r.json()

        jobs = []
        for job in data.get("jobs", []):
            description_html = job.get("content", "")
            description_text = BeautifulSoup(
                description_html, "html.parser"
            ).get_text("\n", strip=True)

            location = (job.get("location") or {}).get("name")
            work_mode = self._infer_work_mode(location, description_text)

            jobs.append(
                NormalizedJob(
                    source_platform="greenhouse",
                    source_id=str(job["id"]),
                    source_url=job["absolute_url"],
                    title=job["title"],
                    company_name=slug,
                    location=location,
                    work_mode=work_mode,
                    description=description_text,
                    posted_at=job.get("updated_at"),
                    raw_data=job,
                )
            )
        return jobs

    def _infer_work_mode(self, location: str | None, text: str) -> str:
        text = (text or "").lower()
        loc = (location or "").lower()
        if "remote" in loc or "remote" in text[:500]:
            return "remote"
        if "hybrid" in text[:500]:
            return "hybrid"
        return "onsite"

    def list_known_companies(self) -> list[str]:
        return KNOWN_GREENHOUSE_SLUGS

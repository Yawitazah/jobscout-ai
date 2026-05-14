"""
Import a job into JobScout by URL.

Creates the company / job / user_job / application rows for a job URL you
paste in, marking the application `ready_to_submit` immediately so the local
agent picks it up on its next poll.

For speed, the resume + cover-letter documents are cloned from the user's
most recent existing application (same content, not freshly tailored). To get
fresh per-job tailoring, run the JobScout "Regenerate Docs" flow afterwards.

Usage:
    python -m scripts.import_job_by_url <URL>
    python -m scripts.import_job_by_url <URL> --title "Software Engineer" --company "Acme"
    python -m scripts.import_job_by_url <URL> --no-docs  # leaves status=queued
"""
from __future__ import annotations

import argparse
import hashlib
import logging
import os
import pathlib
import re
import sys
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    here = pathlib.Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        for name in ("jobscout-agent.env", ".env"):
            candidate = parent / name
            if candidate.exists():
                load_dotenv(candidate, override=False)
                return


_load_env()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("import_job")


def detect_platform(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if "greenhouse.io" in host or "gh_jid=" in url:
        return "greenhouse"
    if "lever.co" in host:
        return "lever"
    if "linkedin.com" in host:
        return "linkedin"
    if "indeed.com" in host:
        return "indeed"
    if "workday" in host or "myworkdayjobs.com" in host:
        return "workday"
    if "ashbyhq.com" in host:
        return "ashby"
    if "smartrecruiters.com" in host:
        return "smartrecruiters"
    if "icims.com" in host:
        return "icims"
    return "custom"


def scrape(url: str) -> dict:
    """Pull title + company + description hints from the URL's HTML."""
    try:
        r = httpx.get(
            url,
            follow_redirects=True,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (compatible; JobScout-Importer/1.0)"},
        )
        r.raise_for_status()
    except Exception as exc:
        logger.warning("Scrape failed (%s); using URL-only fallbacks.", exc)
        return {"title": "", "company": "", "description": ""}

    soup = BeautifulSoup(r.text, "html.parser")

    def meta(prop_name: str, attr: str = "property") -> str:
        el = soup.find("meta", attrs={attr: prop_name})
        return (el.get("content") if el else "") or ""

    title = meta("og:title") or meta("twitter:title") or (soup.title.text.strip() if soup.title else "")
    company = meta("og:site_name") or ""
    desc = meta("og:description") or meta("description", attr="name")

    # Greenhouse pages typically have <span class="company-name">.
    if not company:
        co_el = soup.find(class_=re.compile(r"company|employer", re.IGNORECASE))
        if co_el:
            company = (co_el.get_text() or "").strip()

    # Clean up "Job Title - Company" patterns
    if " - " in title and not company:
        parts = title.rsplit(" - ", 1)
        title, company = parts[0].strip(), parts[1].strip()
    elif " at " in title and not company:
        parts = title.rsplit(" at ", 1)
        title, company = parts[0].strip(), parts[1].strip()

    return {
        "title": title.strip(),
        "company": company.strip(),
        "description": desc.strip(),
    }


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or "unknown"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Job posting URL")
    parser.add_argument("--title", help="Job title (skips scrape for title)")
    parser.add_argument("--company", help="Company name (skips scrape for company)")
    parser.add_argument(
        "--user-id",
        default=os.environ.get("AGENT_USER_ID"),
        help="Supabase auth user UUID (defaults to AGENT_USER_ID env)",
    )
    parser.add_argument(
        "--no-docs",
        action="store_true",
        help="Don't clone resume/cover-letter docs — leave application in 'queued' state",
    )
    args = parser.parse_args()

    missing = [v for v in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not os.environ.get(v)]
    if missing:
        print(f"ERROR: missing env vars: {', '.join(missing)}", file=sys.stderr)
        return 2
    if not args.user_id:
        print("ERROR: --user-id or AGENT_USER_ID env required", file=sys.stderr)
        return 2

    platform = detect_platform(args.url)
    scraped = scrape(args.url)
    title = (args.title or scraped["title"] or f"Imported job ({platform})").strip()
    company_name = (args.company or scraped["company"] or "Unknown company").strip()
    description = scraped["description"]

    logger.info("URL       : %s", args.url)
    logger.info("Platform  : %s", platform)
    logger.info("Title     : %s", title)
    logger.info("Company   : %s", company_name)

    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # --- Company ----------------------------------------------------------
    co_lookup = sb.table("companies").select("id").eq("name", company_name).limit(1).execute()
    if co_lookup.data:
        company_id = co_lookup.data[0]["id"]
        logger.info("Company   : reusing existing id=%s", company_id)
    else:
        co_ins = sb.table("companies").insert({"name": company_name}).execute()
        company_id = co_ins.data[0]["id"]
        logger.info("Company   : created id=%s", company_id)

    # --- Job (use dedupe_hash to avoid duplicates if re-importing same URL) -
    dedupe_hash = hashlib.sha256(args.url.encode("utf-8")).hexdigest()
    source_id = _slug(f"{platform}-{dedupe_hash[:12]}")

    job_lookup = sb.table("jobs").select("id").eq("dedupe_hash", dedupe_hash).limit(1).execute()
    if job_lookup.data:
        job_id = job_lookup.data[0]["id"]
        logger.info("Job       : reusing existing id=%s", job_id)
    else:
        job_ins = sb.table("jobs").insert({
            "source_platform": platform,
            "source_id": source_id,
            "source_url": args.url,
            "title": title,
            "description": description or "",
            "company_id": company_id,
            "dedupe_hash": dedupe_hash,
            "location": "",
            "work_mode": None,
        }).execute()
        job_id = job_ins.data[0]["id"]
        logger.info("Job       : created id=%s", job_id)

    # --- user_jobs (approved so the application can run) -------------------
    uj_lookup = (
        sb.table("user_jobs")
        .select("id, status")
        .eq("user_id", args.user_id)
        .eq("job_id", job_id)
        .limit(1)
        .execute()
    )
    if uj_lookup.data:
        user_job_id = uj_lookup.data[0]["id"]
        if uj_lookup.data[0]["status"] != "approved":
            sb.table("user_jobs").update({
                "status": "approved",
                "reviewed_at": "now()",
            }).eq("id", user_job_id).execute()
        logger.info("user_job  : reusing id=%s", user_job_id)
    else:
        uj_ins = sb.table("user_jobs").insert({
            "user_id": args.user_id,
            "job_id": job_id,
            "score": 100,
            "status": "approved",
            "decision_source": "manual",
        }).execute()
        user_job_id = uj_ins.data[0]["id"]
        logger.info("user_job  : created id=%s", user_job_id)

    # --- Find docs to clone (most recent successful application of this user)
    resume_doc_id = None
    cover_doc_id = None
    if not args.no_docs:
        last = (
            sb.table("applications")
            .select("resume_doc_id, cover_letter_doc_id")
            .eq("user_id", args.user_id)
            .not_.is_("resume_doc_id", "null")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if last.data:
            resume_doc_id = last.data[0]["resume_doc_id"]
            cover_doc_id = last.data[0]["cover_letter_doc_id"]
            logger.info("Docs      : cloned resume=%s cover=%s from most-recent application",
                        resume_doc_id, cover_doc_id)
        else:
            logger.warning("Docs      : no prior application to clone from — application will be queued")

    # --- Application ------------------------------------------------------
    app_status = "ready_to_submit" if resume_doc_id else "queued"
    app_ins = sb.table("applications").insert({
        "user_id": args.user_id,
        "user_job_id": user_job_id,
        "status": app_status,
        "resume_doc_id": resume_doc_id,
        "cover_letter_doc_id": cover_doc_id,
    }).execute()
    application_id = app_ins.data[0]["id"]

    print()
    print("Created application:")
    print(f"  id           : {application_id}")
    print(f"  status       : {app_status}")
    print(f"  job          : {title}")
    print(f"  company      : {company_name}")
    print(f"  platform     : {platform}")
    print(f"  source_url   : {args.url}")
    print()
    if app_status == "ready_to_submit":
        print("Agent will pick this up on its next 30-second poll.")
    else:
        print("Application is queued. Trigger doc tailoring in the JobScout UI to advance it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

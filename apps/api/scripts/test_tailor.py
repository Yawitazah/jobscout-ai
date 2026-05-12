"""
Smoke test for resume tailoring.

Usage:
  uv run python scripts/test_tailor.py
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

from app.services.ai.resume_tailor import tailor_resume  # noqa: E402

SAMPLE_PROFILE = {
    "full_name": "Jane Smith",
    "location": "San Francisco, CA",
    "summary": "Backend engineer with 6 years of Python experience building scalable APIs.",
    "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "AWS"],
    "experience": [
        {
            "title": "Senior Software Engineer",
            "company": "Acme Corp",
            "start_date": "2021-03",
            "end_date": None,
            "description": "Led backend team of 4. Migrated monolith to microservices, reducing p99 latency by 40%.",
        },
        {
            "title": "Software Engineer",
            "company": "Beta Inc",
            "start_date": "2018-06",
            "end_date": "2021-02",
            "description": "Built REST APIs in Python/FastAPI, integrated Stripe payments, managed PostgreSQL schemas.",
        },
    ],
    "education": [
        {
            "degree": "B.S. Computer Science",
            "institution": "UC Berkeley",
            "graduation_year": "2018",
        }
    ],
}

SAMPLE_JOB = {
    "title": "Staff Backend Engineer",
    "company_name": "ScaleUp AI",
    "location": "Remote",
    "description": (
        "We're looking for a Staff Backend Engineer to architect our data pipeline platform. "
        "You'll lead a cross-functional team of 6, design high-throughput APIs in Python, "
        "and own our PostgreSQL + Redis infrastructure. "
        "Requirements: 5+ years Python, experience with microservices, strong SQL skills. "
        "Nice to have: FastAPI, Docker, AWS, distributed systems experience."
    ),
}

if __name__ == "__main__":
    print("Tailoring resume... (this calls Claude, may take ~10s)\n")
    result = tailor_resume(SAMPLE_PROFILE, SAMPLE_JOB)
    print(json.dumps(result, indent=2))
    print("\n--- Tailoring notes ---")
    for note in result.get("tailoring_notes", []):
        print(f"  • {note}")
    print("\nDone.")

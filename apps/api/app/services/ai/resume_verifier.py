from __future__ import annotations

import json
import logging
import os

import anthropic

logger = logging.getLogger(__name__)

VERIFIER_SYSTEM = """\
You are a strict resume integrity verifier. Your job is to audit a tailored resume against the
candidate's source profile and flag any fabrications.

Check every claim in the tailored resume:
- Skills not present in the source profile
- Job titles or company names that differ from the source
- Dates that don't match the source
- Bullets that describe responsibilities or achievements with no basis in the source
- Metrics (numbers, percentages, team sizes) not present in the source
- Technologies or tools not mentioned in the source
- Any credential, certification, or publication not in the source

Output JSON exactly:
{
  "passed": true | false,
  "violations": [
    {
      "field": "experience[0].bullets[2]",
      "issue": "brief description of the fabrication",
      "severity": "critical" | "minor"
    }
  ],
  "fix_instructions": "If there are violations, describe concisely how to fix them. Empty string if passed."
}

Return only valid JSON, no markdown, no commentary.
"""

FIXER_SYSTEM = """\
You are a resume tailoring specialist. You previously wrote a tailored resume that contains
fabrications. Fix ONLY the flagged issues by removing or replacing fabricated content with
accurate content from the source profile. Do not change anything that was not flagged.

Output the corrected resume JSON using the same schema as the original tailored resume.
Return only valid JSON, no markdown, no commentary.
"""


def verify_resume(source_profile: dict, tailored: dict) -> dict:
    """Return verifier result dict with keys: passed, violations, fix_instructions."""
    msg = (
        f"SOURCE PROFILE:\n{json.dumps(_slim(source_profile), indent=2)}\n\n"
        f"TAILORED RESUME:\n{json.dumps(tailored, indent=2)}"
    )
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=VERIFIER_SYSTEM,
        messages=[{"role": "user", "content": msg}],
    )
    text = resp.content[0].text.strip()
    return _parse_json(text)


def fix_resume(source_profile: dict, tailored: dict, violations: list[dict], fix_instructions: str) -> dict:
    """Return corrected tailored resume JSON."""
    msg = (
        f"SOURCE PROFILE:\n{json.dumps(_slim(source_profile), indent=2)}\n\n"
        f"TAILORED RESUME TO FIX:\n{json.dumps(tailored, indent=2)}\n\n"
        f"VIOLATIONS TO FIX:\n{json.dumps(violations, indent=2)}\n\n"
        f"FIX INSTRUCTIONS:\n{fix_instructions}"
    )
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=FIXER_SYSTEM,
        messages=[{"role": "user", "content": msg}],
    )
    text = resp.content[0].text.strip()
    return _parse_json(text)


def verify_and_fix(source_profile: dict, tailored: dict, max_cycles: int = 2) -> tuple[dict, dict]:
    """
    Run verify → fix cycles until the resume passes or max_cycles is reached.
    Returns (final_tailored, final_verification_result).
    """
    current = tailored
    result: dict = {}
    for cycle in range(max_cycles + 1):
        result = verify_resume(source_profile, current)
        if result.get("passed"):
            logger.info("Resume passed verification on cycle %d", cycle)
            break
        if cycle >= max_cycles:
            logger.warning(
                "Resume still has violations after %d fix cycles; accepting with failed_review status",
                max_cycles,
            )
            break
        logger.info("Cycle %d: %d violations, running fixer", cycle, len(result.get("violations", [])))
        try:
            current = fix_resume(
                source_profile,
                current,
                result.get("violations", []),
                result.get("fix_instructions", ""),
            )
        except Exception as exc:
            logger.exception("Fixer failed on cycle %d: %s", cycle, exc)
            break

    return current, result


def _slim(profile: dict) -> dict:
    return {
        "full_name": profile.get("full_name"),
        "skills": profile.get("skills", []),
        "experience": profile.get("experience", []),
        "education": profile.get("education", []),
    }


def _parse_json(text: str) -> dict:
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())

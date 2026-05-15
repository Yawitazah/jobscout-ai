from __future__ import annotations

import json
import os
import re

import anthropic

SYSTEM_PROMPT = """\
You are an elite resume strategist and ATS specialist. Your job is to transform a candidate's \
raw profile into a laser-targeted resume that maximises the probability of getting an interview \
at a specific company for a specific role.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — ANALYSE THE JOB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before writing, extract from the job description:
• Top 15-20 ATS keywords (tools, skills, methodologies, metrics the JD repeats or emphasises)
• The 3 most critical requirements (what would make or break the hire)
• The company's evident priorities and culture signals
• Any "nice to have" items the candidate might demonstrate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — MAP CANDIDATE → JOB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each critical requirement, find the strongest evidence in the candidate's profile.
If the profile has an `additional_context` or `notes` field, treat it as highly credible \
first-person testimony — mine it for achievements, stories, and facts.
Draw from: structured experience fields, skills, certifications, projects, education, \
AND any free-form context the candidate provided.

ANCHOR EVERYTHING TO THE JD. The candidate's profile is broad on purpose — they list \
many tools and skills they've touched across years of work. Your job is to surface only \
what THIS job calls for. If a topic (e.g. "CRM", "Photoshop", "data analysis") shows up \
in the profile but is not mentioned, implied, or adjacent to anything in the JD, do not \
lead with it. Don't pad. A skill or bullet earns its spot in the tailored resume only \
by mapping to something the JD asks for. When in doubt, leave it out.

WEIGHT BY JD PROMINENCE — this is the difference between a junior and a senior tailor:
  • Required / "must have" / called out in a section header / repeated multiple times → \
    feature prominently (summary mention + skills entry + bullet evidence).
  • Preferred / "nice to have" / mentioned once / appears in a sub-bullet → minor mention \
    only (one skills entry at most, no summary line, no dedicated bullet).
  • Not in the JD at all → omit, even if it's all over the profile.
Example: a JD with one passing mention of "Capturing opportunities in Salesforce CRM" \
should produce AT MOST one skills entry for CRM and zero summary mentions. It should \
NOT produce a CRM-heavy summary, a CRM skills category, AND CRM bullets in the lead role.

REQUIRED TOOLS COVERAGE — if the JD marks something as "required", "must have", or \
lists it as a non-negotiable tool/technology, and the candidate's profile mentions it \
anywhere (skills, experience, raw_resume_text, projects), it MUST appear in the tailored \
skills list. Missing a JD-required tool the candidate actually has is a top failure mode.

Before finalising the skills list, walk back through the JD and check: for every tool \
or technology the JD lists in a "required" / "must have" / "preferred" callout, is it \
either (a) named in your skills list, or (b) clearly absent from the candidate's entire \
profile (in which case omit it — don't fabricate)? If the candidate has it and you \
didn't include it, add it before you return.

Example: JD lists "WordPress (required)". Candidate's profile mentions WordPress in \
skills. Tailored resume MUST contain WordPress as a named skill — no exceptions.

NAMING SPECIFIC TOOLS — match the JD's level of specificity. If the JD says "Salesforce \
CRM", you may name Salesforce. If the JD says only "CRM" with no product, write "CRM" — \
do NOT volunteer the specific products from the candidate's profile (Privyr, Wix CRM, \
Shopify, GoHighLevel, etc.). Naming products the JD didn't ask for makes the candidate \
look like they're flexing irrelevant tools.

ADDITIONAL SOURCES (treat as first-person testimony from the candidate, same trust level \
as the structured profile — these are NOT separate people, they're the candidate writing \
about themselves through different channels):
  • `memories` — short facts/achievements the candidate has told us over time \
    ("Grew newsletter 0→50k subscribers at X", etc.). Often contain numbers and stories \
    you won't find in the structured experience entries. Mine these for resume bullets.
  • `raw_resume_text` — the candidate's own original resume text. If the structured \
    experience is sparse on a role the JD cares about, look here for additional detail.
  • `past_application_answers` — Q&A the candidate has answered on previous applications \
    (visa status, years of experience, salary expectations, etc.). Useful when the JD \
    implicitly asks about similar topics.
All three follow the same JD-anchoring rule: surface only what maps to THIS job. The \
integrity rules still apply — don't fabricate, don't inflate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — WRITE THE RESUME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUMMARY (3 sentences max):
• Sentence 1: Who the candidate is + their years of relevant experience + their biggest domain strength.
  CRITICAL — the opening identifier must reflect the JD's role type, not the profile's
  greatest hits. If you're tailoring for "Enrollment Marketing Manager", the opener is
  a marketing/enrollment identity ("Marketing leader…", "Enrollment marketing specialist…").
  It is NEVER something the JD doesn't ask for. Example failure: opening with
  "CRM Systems Builder" for a marketing role where the JD mentions CRM once in passing.
  Test: if you replaced the opening identifier with a different one matching the JD,
  would the resume still make sense? If yes, the JD-aligned one is correct.
• Sentence 2: 1-2 specific, quantified proof points most relevant to this role.
• Sentence 3: Why this company/role is the natural next step (use company name + role title).
This must NOT be generic. It must read as if written specifically for this company and role.

SKILLS:
• Pick AT MOST 15 skills total. Quality over quantity — a focused list reads
  as senior; a 40-item dump reads as junior and gets skimmed past.
• Order them by relevance to THIS specific job: the most JD-critical skills
  first, niceties last.
• Mirror the exact terminology used in the JD (e.g. if JD says "Google
  Analytics" don't write "GA").
• Only include skills the candidate actually has (per integrity rules below).
• When grouping is natural (e.g. "Paid: Google Ads, Meta Ads | Analytics: GA4,
  Looker"), prefer pipe-grouped categories within a single skill entry. Each
  entry can be a category header + a few items.
• Cut: generic soft skills ("communication", "teamwork") unless the JD
  explicitly names them. Cut overlapping near-duplicates.

EXPERIENCE BULLETS (most critical section):
• Reorder roles so the most relevant one appears first (even if it's not the most recent).
• Each bullet must follow the formula: [Strong Action Verb] + [What You Did] + [Result/Impact].
  - Good: "Grew organic search traffic 140% in 6 months by rebuilding keyword strategy for 3,000-page site"
  - Bad: "Responsible for SEO and content strategy"
• Naturally weave in ATS keywords from the JD — do not stuff, integrate them.
• If the profile has vague bullets, sharpen them using whatever context is available.
• If quantified impact exists in the profile, preserve it exactly. If not, use relative language.
• Write 3-5 strong bullets per role. Cut weak or irrelevant bullets ruthlessly.
• Surface achievements buried in `additional_context` as bullets — these are often the best stories.

CERTIFICATIONS / PROJECTS (if present):
• Include certifications relevant to the role.
• Include projects that demonstrate required skills.

EDUCATION:
• Keep accurate. If a degree is highly relevant, promote it higher.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE INTEGRITY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Never invent a skill, tool, or technology the candidate did not mention anywhere in their profile.
2. Never fabricate job titles, employers, dates, or credentials.
3. Never change numbers to be more impressive than stated.
4. Never add responsibilities or achievements with no basis in the source profile.
5. Reframing is encouraged; fabricating is not. Sharpen and elevate — don't invent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRE-FLIGHT CHECKLIST (mandatory)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before returning JSON, verify each item. If any check fails, fix the output
before returning. This is not optional.

  [1] Summary opener: the first 1-3 words of `summary` describe the JD's role
      type, not the profile's broadest identity. ("Enrollment Marketing
      Manager…" or "Marketing leader…", not "CRM Systems Builder…" for a
      marketing role).

  [2] Skills list contains ≤ 15 entries and is ordered by JD relevance.

  [3] PRODUCT-NAME WHITELIST: every specific product name appearing in
      `summary`, `skills`, or `experience[*].bullets` MUST be a product the
      JD explicitly named. If the JD says "Salesforce CRM" and "HubSpot",
      you may use those names. You may NOT introduce Privyr, GoHighLevel,
      Wix CRM, Shopify CRM, Pipedrive, Zoho, Monday.com, or any other
      specific product name unless the JD wrote it verbatim. Generic
      category names ("CRM", "email platform", "analytics tool") are fine.

  [4] REQUIRED-TOOL COVERAGE: for every tool the JD lists as required,
      preferred, or in a tools/skills callout, confirm it's either in the
      skills list (if the candidate has it) or absent from the entire
      candidate profile (if they don't). The skills list should not be
      missing a required tool the candidate actually has.

  [5] No words from the WORDS TO AVOID list below appear anywhere.

  [6] Topic prominence in resume matches topic prominence in JD. A topic
      with one passing mention in the JD does NOT appear in the summary
      and gets at most one skills entry.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE — WORDS TO AVOID
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do not use these in summary or bullets (they signal junior writing and get flagged):
passionate, ninja, rockstar, guru, synergy, leverage, utilize, utilise, dynamic,
innovative, thought leader, game changer, game-changer, disruptive, holistic,
ecosystem, proactive, go-getter, self-starter, team player, detail-oriented,
results-driven, hardworking, motivated, enthusiastic, seasoned professional,
proven track record.

Use specific replacements:
  • "leverage X" → "use X" / "apply X" / "build on X"
  • "results-driven" → cite the actual result
  • "proven track record" → name the proof point directly
  • "passionate about X" → describe what you actually did with X

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON, no markdown fences, no commentary:

{
  "summary": "targeted 2-3 sentence summary",
  "skills": ["skill1", "skill2", ...],   // MAX 15. Most JD-relevant first.
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "start_date": "YYYY-MM or null",
      "end_date": "YYYY-MM or null",
      "bullets": ["bullet1", "bullet2", ...]
    }
  ],
  "certifications": [
    {"name": "Cert Name", "issuer": "Issuer", "year": "YYYY or null"}
  ],
  "projects": [
    {"name": "Project Name", "description": "1-2 sentence description with impact", "technologies": ["tech1"]}
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "Institution Name",
      "graduation_year": "YYYY or null"
    }
  ],
  "keywords_matched": ["keyword1", "keyword2", ...],
  "tailoring_notes": ["what was emphasised and why", ...]
}
"""


def tailor_resume(profile: dict, job: dict) -> dict:
    jd_text = (job.get('description') or '')[:4000]
    must_include = _compute_must_include_tools(profile, jd_text)

    user_msg_parts = [
        f"CANDIDATE PROFILE:\n{json.dumps(_slim_profile(profile), indent=2)}",
        f"TARGET JOB:\nTitle: {job.get('title', '')}\nCompany: {job.get('company_name', '')}\n"
        f"Location: {job.get('location') or 'unspecified'}\n"
        f"Work mode: {job.get('work_mode') or 'unspecified'}\n"
        f"Full job description:\n{jd_text}",
    ]
    if must_include:
        user_msg_parts.append(
            "MUST_INCLUDE_SKILLS — the JD explicitly requires/prefers these tools, and "
            "the candidate's profile confirms they have them. They MUST appear verbatim "
            "in your `skills` output (each can be a standalone entry or grouped within "
            "another entry, but the literal token must be present):\n"
            f"{json.dumps(must_include)}"
        )
    user_msg = "\n\n".join(user_msg_parts)

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = resp.content[0].text.strip()

    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]

    result = json.loads(text.strip())

    # Final guard: if the AI ignored MUST_INCLUDE_SKILLS, force them in.
    if must_include:
        result["skills"] = _force_must_include(result.get("skills") or [], must_include)
    return result


# ---------------------------------------------------------------------------
# JD-required-tool extraction + matching against profile
# ---------------------------------------------------------------------------

_TOOL_MATCH_STOPWORDS = frozenset({
    "the", "and", "or", "a", "an", "of", "for", "with", "tool", "tools",
    "platform", "platforms", "comparable", "required", "preferred",
    "must", "have", "experience", "knowledge", "expertise",
})


def _extract_jd_required_tools(jd_text: str) -> list[str]:
    """
    Pull tool/skill names from JD lines with explicit (required) / (preferred) /
    (must have) markers. Examples it catches:
      - "WordPress (required)"
      - "ChatGPT or comparable AI platform (required)"
      - "SEMRush (preferred)"
    """
    if not jd_text:
        return []
    out: list[str] = []
    pattern = re.compile(r"^(.+?)\s*\((required|preferred|must[ -]have)\)\s*$", re.IGNORECASE)
    for line in jd_text.splitlines():
        s = line.strip().lstrip("-•*•").strip()
        m = pattern.match(s)
        if m:
            name = m.group(1).strip().strip(":").strip()
            if name and name not in out:
                out.append(name)
    return out


def _find_matching_profile_skill(target: str, profile: dict) -> str | None:
    """
    Does the candidate have something matching this JD tool? Looks across
    profile.skills (and falls back to experience.description text). Returns
    the matched profile skill / None.
    """
    if not target:
        return None
    target_lower = target.lower()
    skills = profile.get("skills") or []

    # 1. Direct substring match on full target
    for skill in skills:
        sl = skill.lower()
        if target_lower in sl or sl in target_lower:
            return skill

    # 2. Split alternatives on " or " / "/" — match any branch
    for cand in re.split(r"\s+or\s+|/", target_lower):
        cand = cand.strip()
        if not cand:
            continue
        for skill in skills:
            sl = skill.lower()
            if cand in sl or sl in cand:
                return skill

    # 3. Distinctive-token match. Keep 2-letter tokens (AI, ML, GA, JS, etc.)
    #    since they're real tool names; filter stopwords by membership only.
    tokens = [
        t for t in re.findall(r"\w+", target_lower)
        if len(t) >= 2 and t not in _TOOL_MATCH_STOPWORDS
    ]
    for skill in skills:
        sl = skill.lower()
        if any(tok in sl for tok in tokens):
            return skill

    # 4. Fall back to experience descriptions
    for role in (profile.get("experience") or []):
        desc = (role.get("description") or "").lower()
        if any(tok in desc for tok in tokens):
            return target  # candidate has it in prose; surface using the JD's name

    return None


def _compute_must_include_tools(profile: dict, jd_text: str) -> list[str]:
    """
    Return a list of tool names to FORCE into the tailored skills list. Each
    item is either the candidate's exact profile-skill string (preferred so
    the resume mirrors how they describe it) or the JD's name when the
    candidate has it only in prose.
    """
    requirements = _extract_jd_required_tools(jd_text)
    out: list[str] = []
    for req in requirements:
        match = _find_matching_profile_skill(req, profile)
        if match and match not in out:
            out.append(match)
    return out


def _force_must_include(output_skills: list[str], must_include: list[str]) -> list[str]:
    """If any must-include skill is missing from output, append it."""
    out = list(output_skills)
    out_blob = " | ".join(s.lower() for s in out)
    for must in must_include:
        if must.lower() not in out_blob:
            out.append(must)
            out_blob = " | ".join(s.lower() for s in out)
    return out


def _slim_profile(profile: dict) -> dict:
    """Pass through all profile fields the AI should know about."""
    slim = {
        "full_name": profile.get("full_name"),
        "email": profile.get("resume_email") or profile.get("email"),
        "phone": profile.get("phone"),
        "location": profile.get("location"),
        "linkedin_url": profile.get("linkedin_url"),
        "github_url": profile.get("github_url"),
        "portfolio_url": profile.get("portfolio_url"),
        "summary": profile.get("summary"),
        "skills": profile.get("skills", []),
        "experience": profile.get("experience", []),
        "education": profile.get("education", []),
        "certifications": profile.get("certifications", []),
        "projects": profile.get("projects", []),
        "languages": profile.get("languages", []),
        # Free-form notes the candidate wrote about themselves — treat as first-person testimony
        "additional_context": profile.get("additional_context") or "",
        # Added by profile_context.enrich_profile — keep tailoring and Scout
        # on a single source of truth.
        "memories": profile.get("memories") or [],
        "raw_resume_text": profile.get("raw_resume_text") or "",
        "past_application_answers": profile.get("past_application_answers") or [],
    }
    # Strip None values to keep prompt clean
    return {k: v for k, v in slim.items() if v not in (None, [], "")}

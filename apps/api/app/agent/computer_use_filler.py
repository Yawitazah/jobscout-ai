"""
Claude Computer Use filler.

Handles any ATS platform (Workday, iCIMS, SmartRecruiters, Taleo, LinkedIn
Easy Apply, direct company portals, etc.) by giving Claude a live view of
the browser and letting it act like a human.

Used as the fallback when the platform isn't in the fast-path registry
(greenhouse / lever), or as the primary strategy from the local runner.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

VIEWPORT_W = 1280
VIEWPORT_H = 900
MAX_ITERATIONS = 60          # hard cap — ~3-4 minutes of back-and-forth
INTER_ACTION_DELAY = 0.4     # seconds to wait between actions


def _build_system_prompt(profile: dict, job: dict, cover_letter_text: str) -> str:
    full_name = profile.get("full_name") or ""
    email = profile.get("resume_email") or profile.get("email") or profile.get("contact_email") or ""
    phone = profile.get("phone") or ""
    location = profile.get("location") or ""
    linkedin = profile.get("linkedin_url") or ""
    summary = profile.get("summary") or ""

    exp_lines = []
    for exp in (profile.get("experience") or [])[:5]:
        title = exp.get("title") or ""
        company = exp.get("company") or ""
        start = exp.get("start_date") or ""
        end = exp.get("end_date") or "Present"
        exp_lines.append(f"  • {title} at {company} ({start}–{end})")

    edu_lines = []
    for edu in (profile.get("education") or [])[:3]:
        degree = edu.get("degree") or ""
        inst = edu.get("institution") or ""
        year = edu.get("graduation_year") or ""
        edu_lines.append(f"  • {degree}, {inst} {year}".strip())

    skills = ", ".join((profile.get("skills") or [])[:20])
    job_title = job.get("title") or "the position"
    company_name = job.get("company_name") or job.get("company") or "the company"

    cover_snippet = cover_letter_text[:2000] if cover_letter_text else "(none)"

    return f"""You are an AI job application agent acting on behalf of {full_name}.
Your job is to fill out and submit the job application shown in the browser.

═══════════════════════════════════════
CANDIDATE
═══════════════════════════════════════
Full name : {full_name}
Email     : {email}
Phone     : {phone}
Location  : {location}
LinkedIn  : {linkedin}
(Use the Email above for ALL email fields — do not use a different address.)
Summary   : {summary}

Experience:
{chr(10).join(exp_lines) or "  (see uploaded resume)"}

Education:
{chr(10).join(edu_lines) or "  (see uploaded resume)"}

Skills: {skills}

═══════════════════════════════════════
TARGET JOB
═══════════════════════════════════════
Title   : {job_title}
Company : {company_name}

═══════════════════════════════════════
COVER LETTER (paste if there is a box)
═══════════════════════════════════════
{cover_snippet}

═══════════════════════════════════════
RULES
═══════════════════════════════════════
1. Take a screenshot first to assess the page.
2. If you see an "Easy Apply", "Quick Apply", "1-Click Apply", or "Apply with
   LinkedIn / Indeed" button — USE IT. It saves time and is more reliable.
3. Fill every required field (*). Skip optional fields unless you have the info.
4. NEVER invent data. Only use what is listed above.
5. For salary questions: use the midpoint of any range in the job description,
   or leave blank if no data is available.
6. For "years of experience" selectors: compute from the experience list above.
7. After filling all fields, click the Submit / Apply button.
8. Take a final screenshot and confirm you see a success/confirmation message.
9. Report the confirmation or reference number if one appears.

10. FILLING TEXT FIELDS — always do this 3-step sequence, never type character-by-character:
    a. left_click the field to focus it.
    b. key "ctrl+a" to select all existing text.
    c. type the value once — it replaces everything instantly.

11. UNKNOWN REQUIRED FIELDS — If you encounter a required (*) field or question
    for which you have NO information in the candidate data above:
    - DO NOT guess, invent, or skip it.
    - STOP the entire application process immediately.
    - Output EXACTLY one line per unknown field, starting with "MISSING_INFO:":
        MISSING_INFO: <short_key> | <Full question text exactly as shown on the form>
    - Then stop — write nothing else.
    Examples:
        MISSING_INFO: years_coding | How many years of programming experience do you have?
        MISSING_INFO: visa_status | Are you legally authorized to work in the United States?
        MISSING_INFO: salary_expectation | What are your salary expectations?

The viewport is {VIEWPORT_W}×{VIEWPORT_H} px. Use pixel coordinates for clicks."""


class ComputerUseFiller:
    def __init__(
        self,
        page: Any,
        profile: dict,
        apply_url: str,
        cover_letter_text: str = "",
        resume_pdf_bytes: bytes | None = None,
        job: dict | None = None,
        supabase=None,
        user_id: str | None = None,
        app_id: str | None = None,
    ):
        self.page = page
        self.profile = profile
        self.apply_url = apply_url
        self.cover_letter_text = cover_letter_text
        self.resume_pdf_bytes = resume_pdf_bytes
        self.job = job or {}

        # Live screenshot streaming
        self._supabase = supabase
        self._user_id = user_id
        self._app_id = app_id
        self._last_live_upload: float = 0.0

        self._submitted = False
        self._confirmation: str | None = None
        self._screenshot_bytes: bytes | None = None
        self._missing_questions: list[str] = []

    async def fill(self) -> None:
        """Navigate to the job URL and wait for the page to load."""
        await self.page.goto(self.apply_url, wait_until="domcontentloaded", timeout=30_000)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass  # networkidle can time out on SPAs — that's fine

    async def submit_with_proof(self) -> dict:
        """Drive the form using Claude computer use tool."""
        import anthropic
        client = anthropic.Anthropic()

        system_prompt = _build_system_prompt(self.profile, self.job, self.cover_letter_text)

        # Seed the conversation with an initial screenshot
        initial_screenshot = await self._screenshot_b64()
        messages: list[dict] = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": initial_screenshot,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "This is the job application page. "
                            "Please fill out and submit the application on my behalf."
                        ),
                    },
                ],
            }
        ]

        tools = [
            {
                "type": "computer_20250124",
                "name": "computer",
                "display_width_px": VIEWPORT_W,
                "display_height_px": VIEWPORT_H,
            }
        ]

        for iteration in range(MAX_ITERATIONS):
            try:
                response = client.beta.messages.create(
                    model="claude-sonnet-4-5",
                    max_tokens=4096,
                    system=system_prompt,
                    tools=tools,
                    messages=messages,
                    betas=["computer-use-2025-01-24"],
                )
            except Exception as exc:
                logger.error("Anthropic API error on iteration %d: %s", iteration, exc)
                break

            messages.append({"role": "assistant", "content": response.content})

            # Check if Claude finished without a tool call
            if response.stop_reason == "end_turn":
                for block in response.content:
                    raw_text = getattr(block, "text", "")
                    lower_text = raw_text.lower()
                    # Detect MISSING_INFO lines before checking for success
                    missing = [
                        line[len("MISSING_INFO:"):].strip()
                        for line in raw_text.splitlines()
                        if line.upper().startswith("MISSING_INFO:")
                    ]
                    if missing:
                        self._missing_questions = missing
                        logger.info("Claude reported %d missing field(s)", len(missing))
                        break
                    if any(w in lower_text for w in ["submitted", "confirmation", "successfully applied", "application received", "thank you"]):
                        self._submitted = True
                        self._screenshot_bytes = await self.page.screenshot(type="png", full_page=False)
                        self._confirmation = _extract_confirmation(raw_text)
                logger.info("Claude finished after %d iterations, submitted=%s, missing=%s",
                            iteration + 1, self._submitted, bool(self._missing_questions))
                break

            # Execute tool calls and collect results
            tool_results = []
            for block in response.content:
                if getattr(block, "type", None) != "tool_use":
                    continue

                action = block.input.get("action", "")
                result_content = await self._execute_action(block.input)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_content,
                    }
                )

            if tool_results:
                messages.append({"role": "user", "content": tool_results})

            await asyncio.sleep(INTER_ACTION_DELAY)
        else:
            logger.warning("Reached MAX_ITERATIONS (%d) without completion", MAX_ITERATIONS)

        return {
            "submitted": self._submitted,
            "missing_info": bool(self._missing_questions),
            "missing_questions": self._missing_questions,
            "confirmation_number": self._confirmation,
            "confirmation_email": None,
            "screenshot_bytes": self._screenshot_bytes,
            "form_responses": {},
            "submission_log": [
                {
                    "action": "computer_use",
                    "ok": self._submitted,
                    "detail": f"claude-opus-4-5 — {len(messages)} turns",
                }
            ],
        }

    # ------------------------------------------------------------------ #
    # Action dispatcher
    # ------------------------------------------------------------------ #

    async def _execute_action(self, tool_input: dict) -> list[dict]:
        action = tool_input.get("action", "")
        try:
            if action == "screenshot":
                b64 = await self._screenshot_b64()
                return [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}}]

            elif action == "left_click":
                x, y = tool_input["coordinate"]
                await self.page.mouse.click(x, y)
                await asyncio.sleep(0.3)
                return [{"type": "text", "text": f"Clicked ({x}, {y})"}]

            elif action == "double_click":
                x, y = tool_input["coordinate"]
                await self.page.mouse.dblclick(x, y)
                await asyncio.sleep(0.3)
                return [{"type": "text", "text": f"Double-clicked ({x}, {y})"}]

            elif action == "right_click":
                x, y = tool_input["coordinate"]
                await self.page.mouse.click(x, y, button="right")
                return [{"type": "text", "text": f"Right-clicked ({x}, {y})"}]

            elif action == "middle_click":
                x, y = tool_input["coordinate"]
                await self.page.mouse.click(x, y, button="middle")
                return [{"type": "text", "text": f"Middle-clicked ({x}, {y})"}]

            elif action == "left_click_drag":
                sx, sy = tool_input["start_coordinate"]
                ex, ey = tool_input["coordinate"]
                await self.page.mouse.move(sx, sy)
                await self.page.mouse.down()
                await self.page.mouse.move(ex, ey)
                await self.page.mouse.up()
                return [{"type": "text", "text": f"Dragged ({sx},{sy})→({ex},{ey})"}]

            elif action == "type":
                text = tool_input.get("text", "")
                # Fast-fill via JS: set value + fire React-compatible events instantly
                filled = await self.page.evaluate(
                    """(text) => {
                        const el = document.activeElement;
                        if (!el) return false;
                        const proto = el instanceof HTMLTextAreaElement
                            ? HTMLTextAreaElement.prototype
                            : HTMLInputElement.prototype;
                        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                        if (setter) {
                            setter.call(el, text);
                        } else {
                            el.value = text;
                        }
                        el.dispatchEvent(new Event('input',  { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }""",
                    text,
                )
                if not filled:
                    # Fallback: instant keyboard type (no per-character delay)
                    await self.page.keyboard.type(text, delay=0)
                return [{"type": "text", "text": f"Filled {len(text)} chars"}]

            elif action == "key":
                key = tool_input.get("text", "")
                await self.page.keyboard.press(key)
                return [{"type": "text", "text": f"Pressed {key}"}]

            elif action == "scroll":
                x, y = tool_input["coordinate"]
                direction = tool_input.get("direction", "down")
                amount = int(tool_input.get("amount", 3))
                delta = amount * 120 * (1 if direction == "down" else -1)
                await self.page.mouse.move(x, y)
                await self.page.mouse.wheel(0, delta)
                await asyncio.sleep(0.3)
                return [{"type": "text", "text": f"Scrolled {direction} {amount} at ({x},{y})"}]

            elif action == "cursor_position":
                return [{"type": "text", "text": "Cursor position requested (not tracked)"}]

            else:
                logger.warning("Unknown computer-use action: %s", action)
                return [{"type": "text", "text": f"Unknown action: {action}"}]

        except Exception as exc:
            logger.warning("Action %s failed: %s", action, exc)
            return [{"type": "text", "text": f"Action {action} failed: {exc}"}]

    async def _screenshot_b64(self) -> str:
        png = await self.page.screenshot(type="png", full_page=False)
        asyncio.ensure_future(self._push_live_screenshot(png))
        return base64.standard_b64encode(png).decode()

    async def _push_live_screenshot(self, png: bytes) -> None:
        """Upload screenshot to storage and update live_screenshot_path (throttled to 3s)."""
        import time
        if not self._supabase or not self._app_id or not self._user_id:
            return
        now = time.monotonic()
        if now - self._last_live_upload < 3.0:
            return
        self._last_live_upload = now
        path = f"{self._user_id}/{self._app_id}/live.png"
        try:
            try:
                self._supabase.storage.from_("generated-documents").upload(
                    path, png, file_options={"content-type": "image/png", "upsert": "true"},
                )
            except Exception:
                # Fallback: remove then re-upload if upsert isn't supported
                try:
                    self._supabase.storage.from_("generated-documents").remove([path])
                except Exception:
                    pass
                self._supabase.storage.from_("generated-documents").upload(
                    path, png, file_options={"content-type": "image/png"},
                )
            self._supabase.table("applications").update(
                {"live_screenshot_path": path}
            ).eq("id", self._app_id).execute()
        except Exception as exc:
            logger.debug("Live screenshot push failed: %s", exc)


def _extract_confirmation(text: str) -> str | None:
    """Try to parse a confirmation / reference number from Claude's summary."""
    patterns = [
        r"confirmation(?:\s+(?:number|#|id|code))?[:\s]+([A-Z0-9\-]{4,20})",
        r"reference(?:\s+(?:number|#|id))?[:\s]+([A-Z0-9\-]{4,20})",
        r"application\s+(?:id|number|#)[:\s]+([A-Z0-9\-]{4,20})",
        r"#([A-Z0-9]{6,15})\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const ai = new Anthropic();

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Load user context from DB ────────────────────────────────────────────────

async function loadUserContext(userId: string): Promise<string> {
  const admin = getAdmin();

  const [profileRes, prefsRes, resumeRes, memoriesRes, jobsRes] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name, email, phone, location, summary, skills, experience, education, certifications, projects, languages, linkedin_url, github_url, portfolio_url, additional_context")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("preferences")
      .select("target_titles, target_locations, work_modes, salary_min, salary_max, industries, deal_breakers, automation_level")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("resume_uploads")
      .select("extracted_text, original_filename")
      .eq("user_id", userId)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("profile_memories")
      .select("content, source, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    // The user's saved/approved jobs and their applications — so Scout knows
    // about positions imported via URL or approved from a previous chat, not
    // just what was discussed in this conversation.
    admin
      .from("user_jobs")
      .select(`
        status,
        score,
        decision_source,
        reviewed_at,
        job:jobs(title, source_url, source_platform, location, company:companies(name)),
        applications(id, status, submitted_at, confirmation_number, missing_questions)
      `)
      .eq("user_id", userId)
      .in("status", ["approved", "pending", "saved"])
      .order("scored_at", { ascending: false })
      .limit(20),
  ]);

  const profile = profileRes.data;
  const prefs = prefsRes.data;
  const resume = resumeRes.data;
  const memories = memoriesRes.data ?? [];
  const userJobs = jobsRes.data ?? [];

  const lines: string[] = ["=== WHAT YOU KNOW ABOUT THIS USER ===", ""];

  // Profile
  if (profile) {
    if (profile.full_name) lines.push(`Name: ${profile.full_name}`);
    if (profile.email) lines.push(`Email: ${profile.email}`);
    if (profile.location) lines.push(`Location: ${profile.location}`);
    if (profile.phone) lines.push(`Phone: ${profile.phone}`);
    if (profile.linkedin_url) lines.push(`LinkedIn: ${profile.linkedin_url}`);
    if (profile.github_url) lines.push(`GitHub: ${profile.github_url}`);
    if (profile.portfolio_url) lines.push(`Portfolio: ${profile.portfolio_url}`);
    if (profile.summary) {
      lines.push("", `Professional Summary: ${profile.summary}`);
    }
    if (Array.isArray(profile.skills) && profile.skills.length > 0) {
      lines.push("", `Skills: ${profile.skills.join(", ")}`);
    }

    // Experience
    if (Array.isArray(profile.experience) && profile.experience.length > 0) {
      lines.push("", "Work Experience:");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const exp of profile.experience as any[]) {
        const range = [exp.start_date, exp.end_date ?? "Present"].filter(Boolean).join(" – ");
        lines.push(`  - ${exp.title} at ${exp.company}${range ? ` (${range})` : ""}`);
        if (exp.description) lines.push(`    ${exp.description}`);
      }
    }

    // Education
    if (Array.isArray(profile.education) && profile.education.length > 0) {
      lines.push("", "Education:");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const edu of profile.education as any[]) {
        lines.push(`  - ${edu.degree ?? "Degree"} from ${edu.institution}${edu.graduation_year ? ` (${edu.graduation_year})` : ""}`);
      }
    }

    // Certifications
    if (Array.isArray(profile.certifications) && profile.certifications.length > 0) {
      lines.push("", "Certifications:");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of profile.certifications as any[]) {
        lines.push(`  - ${c.name}${c.issuer ? ` (${c.issuer})` : ""}${c.year ? ` ${c.year}` : ""}`);
      }
    }

    // Projects
    if (Array.isArray(profile.projects) && profile.projects.length > 0) {
      lines.push("", "Projects:");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of profile.projects as any[]) {
        lines.push(`  - ${p.name}: ${p.description ?? ""}${p.technologies?.length ? ` [${p.technologies.join(", ")}]` : ""}`);
      }
    }

    // Languages
    if (Array.isArray(profile.languages) && profile.languages.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const langStr = (profile.languages as any[]).map((l) => `${l.language} (${l.proficiency})`).join(", ");
      lines.push("", `Languages: ${langStr}`);
    }

    // Additional context (free-form notes)
    if (profile.additional_context?.trim()) {
      lines.push("", "Additional background (user's own words):", profile.additional_context.trim());
    }
  }

  // Preferences
  if (prefs) {
    lines.push("", "Job Search Preferences:");
    if (Array.isArray(prefs.target_titles) && prefs.target_titles.length > 0) {
      lines.push(`  Target roles: ${prefs.target_titles.join(", ")}`);
    }
    if (Array.isArray(prefs.work_modes) && prefs.work_modes.length > 0) {
      lines.push(`  Work modes: ${prefs.work_modes.join(", ")}`);
    }
    if (prefs.target_locations) {
      const locs = Array.isArray(prefs.target_locations)
        ? prefs.target_locations.join(", ")
        : JSON.stringify(prefs.target_locations);
      lines.push(`  Target locations: ${locs}`);
    }
    if (prefs.salary_min || prefs.salary_max) {
      const min = prefs.salary_min ? `$${Number(prefs.salary_min).toLocaleString()}` : "any";
      const max = prefs.salary_max ? `$${Number(prefs.salary_max).toLocaleString()}` : "any";
      lines.push(`  Salary range: ${min} – ${max}`);
    }
    if (Array.isArray(prefs.industries) && prefs.industries.length > 0) {
      lines.push(`  Industries: ${prefs.industries.join(", ")}`);
    }
    if (prefs.deal_breakers && Object.keys(prefs.deal_breakers).length > 0) {
      lines.push(`  Deal breakers: ${JSON.stringify(prefs.deal_breakers)}`);
    }
  }

  // Resume
  if (resume?.extracted_text) {
    const truncated = resume.extracted_text.slice(0, 3000);
    lines.push("", `Resume (${resume.original_filename}):`, truncated);
    if (resume.extracted_text.length > 3000) lines.push("[...truncated for brevity]");
  }

  // Saved memories from Scout conversations
  if (memories.length > 0) {
    lines.push("", "Saved memories / facts about this user (from prior conversations):");
    for (const m of memories) {
      lines.push(`  • ${m.content}`);
    }
  }

  // Saved / approved jobs + their applications. Critical so Scout doesn't say
  // "I don't see that job" when the user references something imported via
  // URL or approved in a prior chat.
  if (userJobs.length > 0) {
    lines.push("", "Saved jobs & applications (this user's current pipeline):");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const uj of userJobs as any[]) {
      const job = uj.job;
      if (!job) continue;
      const company = job.company?.name ?? "Unknown company";
      const platform = job.source_platform ?? "custom";
      const source = uj.decision_source ?? "auto";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apps = (uj.applications ?? []) as any[];
      const appsByRecency = apps.slice().sort((a, b) =>
        (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "")
      );
      const latest = appsByRecency[0];
      const appPart = latest
        ? ` → application: ${latest.status}${
            latest.confirmation_number ? ` (confirmation ${latest.confirmation_number})` : ""
          }${
            Array.isArray(latest.missing_questions) && latest.missing_questions.length > 0
              ? ` | ${latest.missing_questions.length} question(s) need answers`
              : ""
          }`
        : " → no application yet";
      const decisionLabel = source === "manual" ? "manually saved" : `${uj.status}`;
      lines.push(
        `  • [${decisionLabel}] ${job.title} @ ${company} (${platform})${appPart}`,
      );
      if (job.source_url) {
        lines.push(`      ${job.source_url}`);
      }
    }
  }

  lines.push("", "=== END USER CONTEXT ===");
  return lines.join("\n");
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(userContext: string): string {
  return `You are Scout — a sharp, dedicated AI job search agent inside JobScout AI. You work exclusively for this user and have their back completely.

${userContext}

CORE RULES — NEVER BREAK THESE:
- You already know everything about this user from their profile above. Never ask them to repeat info you already have.
- Never use markdown symbols in your responses. No asterisks (**), no dashes (---), no pound signs (#). Write in clean, natural prose. Use line breaks to separate thoughts.
- Be direct and specific. No fluff, no filler. Quality over quantity.
- When you reference past preferences or profile details, do it naturally — "Based on your background in..." or "Since you prefer remote roles..."
- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

HOW TO BEHAVE:
- Always have a conversation first. When someone asks a vague question like "What's my best match?" or "What should I be applying to?", do NOT immediately search. Instead, give them your honest take based on their profile, then ask a specific question to refine, then confirm before searching.
- Never use web_search unless the user has explicitly said to search: "go ahead", "yes", "search now", "find me jobs", "start searching", or similar. A question alone is not permission to search.
- After your analysis, close with something like: "Want me to run a search based on this? I can start right now." Then wait.
- When the user does give the go-ahead, say what you'll search for in one sentence, then immediately begin.

WHEN YOU DO SEARCH:
- Use web_search to find real, current job openings. Search multiple times with different phrasings and job boards (LinkedIn, Indeed, Glassdoor, company career pages).
- Use add_jobs_to_queue to save quality matches. Be very selective — only add roles that genuinely fit this person's background and stated preferences.
- After adding jobs: tell the user how many you added, name the top pick and explain why in 1-2 sentences, then say what else you're looking at.

UPDATING PREFERENCES:
If the user asks to change or update their preferences, confirm what you heard, call update_preferences to save it, and confirm it's done.

SAVING MEMORIES:
Whenever the user shares a new fact about themselves — an achievement, a project, a preference, a career story — silently call save_profile_memory to preserve it. Do NOT ask for permission; save it in the background. Examples: "Built a team of 12 engineers at XYZ", "Managed a $2M budget", "Launched a product that hit 100k users in 3 months". These memories feed directly into resume generation, so capturing them is critical.

You remember everything from prior conversations and saved memories above. Reference it naturally. Be honest, direct, and genuinely helpful — like a recruiter who actually knows them.`;
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const ADD_JOBS_TOOL: Anthropic.Tool = {
  name: "add_jobs_to_queue",
  description: "Add job opportunities found during search to the user's review queue in JobScout AI.",
  input_schema: {
    type: "object" as const,
    properties: {
      jobs: {
        type: "array",
        description: "List of job opportunities to add",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Job title" },
            company: { type: "string", description: "Company name" },
            url: { type: "string", description: "Direct link to the job posting" },
            location: { type: "string", description: "Location or 'Remote'" },
            description: { type: "string", description: "Brief job description (2-3 sentences)" },
            why_good_match: { type: "string", description: "Why this is a strong match for the user" },
          },
          required: ["title", "company", "url", "location", "description", "why_good_match"],
        },
      },
    },
    required: ["jobs"],
  },
};

const SAVE_MEMORY_TOOL: Anthropic.Tool = {
  name: "save_profile_memory",
  description: "Save a fact, achievement, or piece of background the user just shared about themselves that isn't already in their profile. Use this proactively whenever the user reveals new information about their work history, skills, accomplishments, goals, or preferences that would help tailor their resume or job search. Only save genuinely new information — not things already captured in their profile.",
  input_schema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "The fact or memory to save, written as a clear, complete sentence from the user's perspective. E.g. 'Grew a newsletter from 0 to 50k subscribers while at Acme Corp.' or 'Prefers not to work at companies with fewer than 50 employees.'",
      },
    },
    required: ["content"],
  },
};

const ANSWER_APPLICATION_TOOL: Anthropic.Tool = {
  name: "answer_application_question",
  description: "Save the user's answer to a specific question the agent needs to submit their job application. Call this once per question, as soon as the user provides the answer. When all questions have been answered, the application will automatically be queued for resubmission.",
  input_schema: {
    type: "object" as const,
    properties: {
      application_id: {
        type: "string",
        description: "The application ID (provided in context above)",
      },
      question_key: {
        type: "string",
        description: "Short identifier for the question (e.g. 'years_coding', 'visa_status')",
      },
      answer: {
        type: "string",
        description: "The user's answer, exactly as they stated it",
      },
      all_answered: {
        type: "boolean",
        description: "Set to true only when this is the last question and all questions have now been answered",
      },
    },
    required: ["application_id", "question_key", "answer", "all_answered"],
  },
};

const UPDATE_PREFERENCES_TOOL: Anthropic.Tool = {
  name: "update_preferences",
  description: "Update the user's saved job search preferences after they have approved the changes in conversation. Only call this when the user explicitly asks to update or change their preferences.",
  input_schema: {
    type: "object" as const,
    properties: {
      target_titles: {
        type: "array",
        items: { type: "string" },
        description: "Job titles/roles they're targeting",
      },
      target_locations: {
        type: "array",
        items: { type: "string" },
        description: "Preferred locations (city names or 'Remote')",
      },
      work_modes: {
        type: "array",
        items: { type: "string", enum: ["remote", "hybrid", "onsite"] },
        description: "Preferred work arrangements",
      },
      salary_min: { type: "number", description: "Minimum acceptable annual salary in USD" },
      salary_max: { type: "number", description: "Maximum expected annual salary in USD" },
      industries: {
        type: "array",
        items: { type: "string" },
        description: "Preferred industries",
      },
      summary: {
        type: "string",
        description: "Brief summary of what was changed, to confirm back to the user",
      },
    },
  },
};

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleAddJobs(
  jobs: Array<{ title: string; company: string; url: string; location: string; description: string; why_good_match: string }>,
  userId: string
): Promise<string> {
  const admin = getAdmin();
  let added = 0;

  for (const job of jobs) {
    try {
      const { data: companyData } = await admin
        .from("companies")
        .upsert(
          { name: job.company, source_platform: "scout", source_id: `scout:${job.company.toLowerCase().replace(/\s+/g, "-")}` },
          { onConflict: "source_platform,source_id" }
        )
        .select("id")
        .single();

      const companyId = companyData?.id ?? null;

      const sourceId = `scout:${Buffer.from(job.url).toString("base64").slice(0, 40)}`;
      const description = `${job.description}\n\nWhy this matches you: ${job.why_good_match}`;
      const dedupeHash = createHash("sha1")
        .update(`${job.title}|${job.company}|${description.slice(0, 200)}`)
        .digest("hex");

      const { data: jobData, error: jobError } = await admin
        .from("jobs")
        .upsert(
          {
            company_id: companyId,
            source_platform: "scout",
            source_id: sourceId,
            source_url: job.url,
            title: job.title,
            location: job.location,
            description,
            dedupe_hash: dedupeHash,
            is_active: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "source_platform,source_id" }
        )
        .select("id")
        .single();

      if (jobError || !jobData?.id) {
        console.error("Job upsert failed:", jobError?.message, job.title);
        continue;
      }

      const { data: existing } = await admin
        .from("user_jobs")
        .select("id")
        .eq("user_id", userId)
        .eq("job_id", jobData.id)
        .maybeSingle();

      if (!existing) {
        const { error: ujError } = await admin.from("user_jobs").insert({
          user_id: userId,
          job_id: jobData.id,
          status: "pending",
          score: 80,
          decision_source: "auto",
        });
        if (ujError) {
          console.error("user_jobs insert failed:", ujError.message, job.title);
        } else {
          added++;
        }
      }
    } catch (err) {
      console.error("handleAddJobs error:", err instanceof Error ? err.message : err);
    }
  }

  return `Successfully added ${added} job${added !== 1 ? "s" : ""} to the queue.`;
}

async function handleUpdatePreferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  userId: string
): Promise<string> {
  const admin = getAdmin();
  const { summary, ...fields } = input;

  // Build the patch — only include fields that were provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};

  if (Array.isArray(fields.target_titles)) patch.target_titles = fields.target_titles;
  if (Array.isArray(fields.target_locations)) patch.target_locations = fields.target_locations;
  if (Array.isArray(fields.work_modes)) patch.work_modes = fields.work_modes;
  if (typeof fields.salary_min === "number") patch.salary_min = fields.salary_min;
  if (typeof fields.salary_max === "number") patch.salary_max = fields.salary_max;
  if (Array.isArray(fields.industries)) patch.industries = fields.industries;

  if (Object.keys(patch).length === 0) {
    return "No preference fields to update.";
  }

  const { error } = await admin
    .from("preferences")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });

  if (error) return `Failed to update preferences: ${error.message}`;
  return summary ? `Preferences updated: ${summary}` : "Preferences updated successfully.";
}

// ─── Application context (for "Provide Details" flow) ─────────────────────────

interface AppContext {
  applicationId: string;
  jobTitle: string;
  company: string;
  missingQuestions: string[];
}

async function loadApplicationContext(applicationId: string, userId: string): Promise<AppContext | null> {
  const admin = getAdmin();
  const { data } = await admin
    .from("applications")
    .select("id, missing_questions, user_job:user_jobs(job:jobs(title, company:companies(name)))")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uj = (data as any).user_job;
  const job = uj?.job;
  return {
    applicationId,
    jobTitle: job?.title ?? "this role",
    company: job?.company?.name ?? "the company",
    missingQuestions: (data.missing_questions as string[]) ?? [],
  };
}

function buildApplicationSystemPrompt(ctx: AppContext): string {
  const lines = [
    `=== APPLICATION DETAILS NEEDED ===`,
    ``,
    `The agent tried to submit a job application but stopped because it didn't have all the required information.`,
    ``,
    `Job: ${ctx.jobTitle} at ${ctx.company}`,
    `Application ID: ${ctx.applicationId}`,
    ``,
    `Questions the agent couldn't answer:`,
  ];
  ctx.missingQuestions.forEach((q, i) => {
    const label = q.includes("|") ? q.split("|").slice(1).join("|").trim() : q;
    lines.push(`${i + 1}. ${label}`);
  });
  lines.push(
    ``,
    `YOUR JOB: Ask the user for each answer in a friendly, conversational way.`,
    `Call answer_application_question for each answer as you receive it.`,
    `When all questions are answered (all_answered: true on the last one), tell the user their application is ready and the agent will re-run automatically.`,
    `Do NOT search for jobs or do anything else — stay focused on getting these answers.`,
    `=== END APPLICATION CONTEXT ===`,
  );
  return lines.join("\n");
}

async function handleAnswerApplicationQuestion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  userId: string,
): Promise<string> {
  const admin = getAdmin();
  const { application_id, question_key, answer, all_answered } = input;

  // Upsert the answer into application_answers
  const { error } = await admin
    .from("application_answers")
    .upsert(
      { user_id: userId, question_key, answer },
      { onConflict: "user_id,question_key" }
    );

  if (error) return `Failed to save answer: ${error.message}`;

  // Also save to profile_memories so the answer informs future resume generation.
  // Look up job context to make the memory more useful.
  try {
    const { data: appRow } = await admin
      .from("applications")
      .select("user_job:user_jobs(job:jobs(title, company:companies(name)))")
      .eq("id", application_id)
      .eq("user_id", userId)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uj = (appRow as any)?.user_job;
    const jobTitle: string = uj?.job?.title ?? "";
    const companyName: string = uj?.job?.company?.name ?? "";
    const prefix = jobTitle && companyName ? `[${jobTitle} @ ${companyName}] ` : "";
    const memoryContent = `${prefix}${question_key}: ${answer}`;

    await admin.from("profile_memories").insert({ user_id: userId, content: memoryContent, source: "scout" });
  } catch {
    // Non-fatal — don't fail the whole save just because the memory write failed
  }

  // If all answered, reset application status to ready_to_submit
  if (all_answered) {
    await admin
      .from("applications")
      .update({ status: "ready_to_submit", missing_questions: [], updated_at: new Date().toISOString() })
      .eq("id", application_id)
      .eq("user_id", userId);
    return `Answer saved. All questions answered — application reset to ready for the agent.`;
  }

  return `Answer saved for "${question_key}".`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { message, applicationId } = body;
  if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

  // Confirm conversation belongs to user
  const { data: convo } = await supabase
    .from("scout_conversations")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!convo) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const admin = getAdmin();

  // Save user message
  await admin.from("scout_messages").insert({ conversation_id: id, role: "user", content: message });

  // Auto-title from first user message
  if (convo.title === "New conversation") {
    const shortTitle = message.slice(0, 60).trim();
    await admin.from("scout_conversations").update({ title: shortTitle }).eq("id", id);
  }

  // Load conversation history + user context (+ optional application context) in parallel
  const [historyRes, userContext, appCtx] = await Promise.all([
    admin
      .from("scout_messages")
      .select("role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
    loadUserContext(user.id),
    applicationId ? loadApplicationContext(applicationId, user.id) : Promise.resolve(null),
  ]);

  const systemPrompt = appCtx
    ? buildApplicationSystemPrompt(appCtx) + "\n\n" + buildSystemPrompt(userContext)
    : buildSystemPrompt(userContext);

  const messages: Anthropic.MessageParam[] = (historyRes.data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Stream response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let fullText = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentMessages: any[] = [...messages];

        while (true) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tools: any[] = [
            { type: "web_search_20250305", name: "web_search" },
            ADD_JOBS_TOOL,
            UPDATE_PREFERENCES_TOOL,
            SAVE_MEMORY_TOOL,
            ...(appCtx ? [ANSWER_APPLICATION_TOOL] : []),
          ];

          const apiStream = ai.messages.stream({
            model: "claude-sonnet-4-5",
            max_tokens: 8192,
            system: systemPrompt,
            tools,
            messages: currentMessages,
          } as Parameters<typeof ai.messages.stream>[0]);

          const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contentBlocks: any[] = [];
          let stopReason = "";

          for await (const event of apiStream) {
            if (event.type === "content_block_start") {
              if (event.content_block.type === "text") {
                contentBlocks.push({ type: "text", text: "" });
              } else if (event.content_block.type === "tool_use") {
                contentBlocks.push({ ...event.content_block, input: {} });
                // Immediately notify the user so the cursor doesn't blankly blink
                if (event.content_block.name === "web_search") {
                  send({ type: "status", text: "Searching the web for job listings..." });
                } else if (event.content_block.name === "add_jobs_to_queue") {
                  send({ type: "status", text: "Saving matches to your queue..." });
                } else if (event.content_block.name === "update_preferences") {
                  send({ type: "status", text: "Updating your preferences..." });
                } else if (event.content_block.name === "save_profile_memory") {
                  send({ type: "status", text: "Saving to your profile memory..." });
                } else if (event.content_block.name === "answer_application_question") {
                  send({ type: "status", text: "Saving your answer..." });
                }
              }
            } else if (event.type === "content_block_delta") {
              const block = contentBlocks[event.index];
              if (event.delta.type === "text_delta" && block?.type === "text") {
                block.text += event.delta.text;
                fullText += event.delta.text;
                send({ type: "text", delta: event.delta.text });
              } else if (event.delta.type === "input_json_delta" && block?.type === "tool_use") {
                block.inputRaw = (block.inputRaw ?? "") + event.delta.partial_json;
              }
            } else if (event.type === "message_delta") {
              stopReason = event.delta.stop_reason ?? "";
            }
          }

          // Parse tool inputs
          for (const block of contentBlocks) {
            if (block.type === "tool_use") {
              try { block.input = JSON.parse(block.inputRaw ?? "{}"); } catch { block.input = {}; }
              toolUseBlocks.push(block as Anthropic.ToolUseBlock);
            }
          }

          currentMessages.push({ role: "assistant", content: contentBlocks });

          if (stopReason !== "tool_use" || toolUseBlocks.length === 0) break;

          // Handle tool calls
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolResults: any[] = [];
          for (const toolUse of toolUseBlocks) {
            let result = "";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const input = toolUse.input as Record<string, any>;

            if (toolUse.name === "add_jobs_to_queue") {
              const jobs = input.jobs ?? [];
              send({ type: "status", text: `Adding ${jobs.length} job${jobs.length !== 1 ? "s" : ""} to your queue...` });
              result = await handleAddJobs(jobs, user.id);
              send({ type: "status", text: result });
            } else if (toolUse.name === "update_preferences") {
              send({ type: "status", text: "Updating your preferences..." });
              result = await handleUpdatePreferences(input, user.id);
            } else if (toolUse.name === "save_profile_memory") {
              const content = (input.content ?? "").trim();
              if (content) {
                await admin.from("profile_memories").insert({ user_id: user.id, content, source: "scout" });
                result = `Memory saved.`;
                send({ type: "status", text: `Saved to your profile: "${content}"` });
              } else {
                result = "No content to save.";
              }
            } else if (toolUse.name === "answer_application_question") {
              send({ type: "status", text: "Saving your answer..." });
              result = await handleAnswerApplicationQuestion(input, user.id);
              send({ type: "status", text: result });
            } else if (toolUse.name === "web_search") {
              result = "Search completed.";
            }

            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
          }
          currentMessages.push({ role: "user", content: toolResults });
        }

        // Save full assistant response
        if (fullText.trim()) {
          await admin.from("scout_messages").insert({
            conversation_id: id,
            role: "assistant",
            content: fullText,
          });
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

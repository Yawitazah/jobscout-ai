import { NextRequest, NextResponse } from "next/server";
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

const SYSTEM_PROMPT = `You are Scout — a dedicated AI job search agent inside JobScout AI. You act like a sharp, experienced recruiter who is entirely on the user's side.

Your goals:
1. Have a real conversation to understand exactly what they want: role title, seniority level, industry, company size, remote/hybrid/onsite preference, location, salary range, culture fit, what they're moving away from and toward.
2. Ask smart follow-up questions — don't assume, dig in. One or two questions at a time.
3. Before searching, confirm your understanding clearly:
   "Here's what I'll be searching for: [specific criteria list]. Ready to start?"
4. Use the web_search tool to find REAL, CURRENT job openings. Search multiple queries — different phrasings, job boards (LinkedIn, Indeed, Glassdoor, company career pages).
5. Use add_jobs_to_queue to save quality matches. Be selective — only add roles that genuinely fit.
6. After adding jobs, tell the user:
   - "I added [N] matches to your queue."
   - "Top pick: [Job title] at [Company] — [1-2 sentences on the specific fit]."
   - What you're continuing to research.

You remember everything from prior conversations. Reference past preferences naturally.
Be direct, confident, and specific. No fluff. Quality over quantity.
Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

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

async function handleAddJobs(
  jobs: Array<{ title: string; company: string; url: string; location: string; description: string; why_good_match: string }>,
  userId: string
): Promise<string> {
  const admin = getAdmin();
  let added = 0;

  for (const job of jobs) {
    try {
      // Upsert company
      const { data: companyData } = await admin
        .from("companies")
        .upsert(
          { name: job.company, source_platform: "scout", source_id: `scout:${job.company.toLowerCase().replace(/\s+/g, "-")}` },
          { onConflict: "source_platform,source_id" }
        )
        .select("id")
        .single();

      const companyId = companyData?.id ?? null;

      // Upsert job
      const { data: jobData } = await admin
        .from("jobs")
        .upsert(
          {
            company_id: companyId,
            source_platform: "scout",
            source_id: `scout:${Buffer.from(job.url).toString("base64").slice(0, 40)}`,
            source_url: job.url,
            title: job.title,
            location: job.location,
            description: `${job.description}\n\n**Why this matches you:** ${job.why_good_match}`,
            is_active: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "source_platform,source_id" }
        )
        .select("id")
        .single();

      if (!jobData?.id) continue;

      // Add to user_jobs if not already there
      const { data: existing } = await admin
        .from("user_jobs")
        .select("id")
        .eq("user_id", userId)
        .eq("job_id", jobData.id)
        .maybeSingle();

      if (!existing) {
        await admin.from("user_jobs").insert({
          user_id: userId,
          job_id: jobData.id,
          status: "pending",
          score: 80,
          decision_source: "scout",
        });
        added++;
      }
    } catch {
      // skip individual failures
    }
  }

  return `Successfully added ${added} job${added !== 1 ? "s" : ""} to the queue.`;
}

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

  // Confirm conversation belongs to user
  const { data: convo } = await supabase
    .from("scout_conversations")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!convo) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  // Save user message
  const admin = getAdmin();
  await admin.from("scout_messages").insert({ conversation_id: id, role: "user", content: message });

  // Auto-title the conversation from first user message
  if (convo.title === "New conversation") {
    const shortTitle = message.slice(0, 60).trim();
    await admin.from("scout_conversations").update({ title: shortTitle }).eq("id", id);
  }

  // Load conversation history
  const { data: history } = await admin
    .from("scout_messages")
    .select("role, content")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const messages: Anthropic.MessageParam[] = (history ?? []).map((m) => ({
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

        // Agentic loop: keep going until end_turn (handles tool use)
        while (true) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tools: any[] = [
            { type: "web_search_20250305", name: "web_search" },
            ADD_JOBS_TOOL,
          ];

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const apiStream = ai.messages.stream({
            model: "claude-sonnet-4-5",
            max_tokens: 8192,
            system: SYSTEM_PROMPT,
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

          // Parse tool use blocks
          for (const block of contentBlocks) {
            if (block.type === "tool_use") {
              try {
                block.input = JSON.parse(block.inputRaw ?? "{}");
              } catch { block.input = {}; }
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
            if (toolUse.name === "add_jobs_to_queue") {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const jobs = (toolUse.input as any).jobs ?? [];
              send({ type: "status", text: `Adding ${jobs.length} jobs to your queue…` });
              result = await handleAddJobs(jobs, user.id);
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

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const ai = new Anthropic();

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/profile/memories/from-upload
 * Takes an upload_id, extracts career facts from the PDF using Claude,
 * and saves each fact as a profile_memory.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const upload_id = body?.upload_id;
  if (!upload_id) return NextResponse.json({ error: "upload_id required" }, { status: 400 });

  const admin = getAdminClient();

  // Verify upload belongs to this user
  const { data: upload, error: uploadErr } = await admin
    .from("resume_uploads")
    .select("id, user_id, storage_path, mime_type, original_filename")
    .eq("id", upload_id)
    .single();

  if (uploadErr || !upload || upload.user_id !== user.id) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.mime_type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 422 });
  }

  // Download file from storage
  const { data: fileBlob, error: dlError } = await admin.storage
    .from("resumes")
    .download(upload.storage_path as string);

  if (dlError || !fileBlob) {
    return NextResponse.json({ error: "Could not download file" }, { status: 502 });
  }

  await admin.from("resume_uploads").update({ status: "processing" }).eq("id", upload_id);

  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Extract key career facts from the document
  let memories: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (ai.messages.create as any)({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: `Extract 5-10 specific, factual career memory items from this document.
Each memory should be a single concrete fact — specific achievements, roles, skills, metrics, awards, clients, or context that would help write a better resume or cover letter for this person.
Be specific: include numbers, company names, dates, and outcomes where present.
Return ONLY a valid JSON array of strings. No markdown fences, no commentary.
Example output: ["Led a team of 12 engineers at Acme Corp from 2021–2023", "Grew organic traffic 140% in 6 months by rebuilding SEO strategy", "Expert in Kubernetes and AWS ECS, holds AWS Solutions Architect certification"]`,
          },
        ],
      }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
    const clean = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(clean);
    memories = Array.isArray(parsed) ? parsed.filter((m: unknown) => typeof m === "string" && m.trim()) : [];
  } catch {
    await admin.from("resume_uploads").update({ status: "failed" }).eq("id", upload_id);
    return NextResponse.json({ error: "AI extraction failed — please try again" }, { status: 502 });
  }

  if (memories.length === 0) {
    await admin.from("resume_uploads").update({ status: "processed" }).eq("id", upload_id);
    return NextResponse.json({ memories: [], message: "No facts could be extracted from this document." });
  }

  // Save each as a profile_memory
  const source = `pdf:${(upload.original_filename as string | null) ?? "document"}`;
  const rows = memories.map((content: string) => ({
    user_id: user.id,
    content: content.trim(),
    source,
  }));

  const { data: saved, error: saveErr } = await admin
    .from("profile_memories")
    .insert(rows)
    .select("id, source, content, created_at");

  if (saveErr) {
    await admin.from("resume_uploads").update({ status: "failed" }).eq("id", upload_id);
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  await admin.from("resume_uploads").update({ status: "processed" }).eq("id", upload_id);

  return NextResponse.json({ memories: saved ?? [], count: (saved ?? []).length });
}

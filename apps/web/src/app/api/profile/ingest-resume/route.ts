import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const ai = new Anthropic();

// Admin client uses service role — bypasses RLS for storage download
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const upload_id = body?.upload_id;
  if (!upload_id) {
    return NextResponse.json({ error: "upload_id required" }, { status: 400 });
  }

  // Confirm the upload belongs to this user
  const admin = getAdminClient();
  const { data: upload, error: uploadErr } = await admin
    .from("resume_uploads")
    .select("id, user_id, storage_path, mime_type, status, extracted_text")
    .eq("id", upload_id)
    .single();

  if (uploadErr || !upload || upload.user_id !== user.id) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Step 1: Download file bytes from storage using admin client
  const { data: fileBlob, error: dlError } = await admin.storage
    .from("resumes")
    .download(upload.storage_path as string);

  if (dlError || !fileBlob) {
    return NextResponse.json(
      { error: `Could not download resume file: ${dlError?.message ?? "unknown"}` },
      { status: 502 }
    );
  }

  const mimeType = upload.mime_type as string;
  const isPdf = mimeType === "application/pdf";

  // Mark as processing
  await admin
    .from("resume_uploads")
    .update({ status: "processing" })
    .eq("id", upload_id);

  let parsed: Record<string, unknown> = {};
  let extractedText = "";

  if (isPdf) {
    // Step 2a: Send PDF directly to Claude — it reads PDFs natively
    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messagePayload: any = {
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: `Extract this person's professional profile from the resume. Return ONLY valid JSON, no markdown fences.
Schema:
{
  "full_name": "string or null",
  "location": "city, state or null",
  "phone": "string or null",
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1", "skill2"],
  "experience": [{"title":"","company":"","start_date":"YYYY-MM or null","end_date":"YYYY-MM or null","description":"1-2 sentences"}],
  "education": [{"degree":"","institution":"","graduation_year":"YYYY or null"}]
}`,
            },
          ],
        },
      ],
    };

    let msg: Awaited<ReturnType<typeof ai.messages.create>>;
    try {
      msg = await ai.messages.create(messagePayload);
    } catch (aiErr: unknown) {
      await admin
        .from("resume_uploads")
        .update({ status: "failed" })
        .eq("id", upload_id);
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      return NextResponse.json(
        { error: `AI parsing failed: ${msg}` },
        { status: 502 }
      );
    }

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
    extractedText = raw;
    try {
      const clean = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
      parsed = JSON.parse(clean);
    } catch {
      await admin
        .from("resume_uploads")
        .update({ status: "failed" })
        .eq("id", upload_id);
      return NextResponse.json({ error: "AI returned invalid JSON — please try again" }, { status: 502 });
    }
  } else {
    // DOCX: not yet supported without FastAPI
    await admin
      .from("resume_uploads")
      .update({ status: "failed" })
      .eq("id", upload_id);
    return NextResponse.json(
      { error: "DOCX files are not yet supported. Please upload a PDF." },
      { status: 422 }
    );
  }

  // Step 3: Save extracted text + mark processed
  await admin
    .from("resume_uploads")
    .update({ status: "processed", extracted_text: extractedText })
    .eq("id", upload_id);

  // Step 4: Upsert into profiles table
  const patch: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    full_name: "full_name",
    location: "location",
    phone: "phone",
    summary: "summary",
    skills: "skills",
    experience: "experience",
    education: "education",
  };
  const fieldsUpdated: string[] = [];

  for (const [aiKey, dbKey] of Object.entries(fieldMap)) {
    const val = parsed[aiKey];
    if (val !== null && val !== undefined && val !== "") {
      if (Array.isArray(val) && val.length === 0) continue;
      patch[dbKey] = val;
      fieldsUpdated.push(dbKey);
    }
  }

  if (Object.keys(patch).length > 0) {
    await admin.from("profiles").update(patch).eq("id", user.id);
  }

  // Step 5: Generate clarifying questions about gaps
  let questions: { id: string; question: string; hint: string }[] = [];
  try {
    const clarifyMsg = await ai.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: `You are a career assistant. Given a job seeker's parsed profile, identify up to 3 gaps.
Return ONLY a JSON array. No markdown.
Schema: [{"id":"q1","question":"...","hint":"short placeholder"}]
Focus on: missing skills context, unclear roles, employment gaps, missing contact info.
If the profile looks complete, return [].`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({ ...parsed, ...patch }),
        },
      ],
    });

    const clarifyRaw =
      clarifyMsg.content[0].type === "text" ? clarifyMsg.content[0].text.trim() : "[]";
    const clean = clarifyRaw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
    questions = JSON.parse(clean);
  } catch {
    // Non-fatal — clarifying questions are optional
    questions = [];
  }

  return NextResponse.json({
    fields_updated: fieldsUpdated,
    profile: { ...parsed, ...patch },
    questions,
  });
}

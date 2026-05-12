import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const ai = new Anthropic();

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user, session },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { upload_id } = await req.json();
  if (!upload_id) {
    return NextResponse.json({ error: "upload_id required" }, { status: 400 });
  }

  // Confirm the upload belongs to this user
  const { data: upload, error: uploadErr } = await supabase
    .from("resume_uploads")
    .select("id, user_id, storage_path, mime_type, status, extracted_text")
    .eq("id", upload_id)
    .single();

  if (uploadErr || !upload || upload.user_id !== user.id) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Step 1: extract text via FastAPI if not already done
  let extractedText = upload.extracted_text as string | null;

  if (!extractedText && upload.status !== "processed") {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.INTERNAL_API_URL;
    if (!apiUrl) {
      return NextResponse.json(
        { error: "API service not configured" },
        { status: 503 }
      );
    }

    // Get a fresh session token for server-to-server call
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      return NextResponse.json({ error: "No session token" }, { status: 401 });
    }

    const extractRes = await fetch(`${apiUrl}/resumes/${upload_id}/extract`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!extractRes.ok) {
      const body = await extractRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Extraction failed: ${body || extractRes.status}` },
        { status: 502 }
      );
    }

    // Re-fetch the record to get extracted_text now that extract ran
    const { data: fresh } = await supabase
      .from("resume_uploads")
      .select("extracted_text")
      .eq("id", upload_id)
      .single();

    extractedText = (fresh?.extracted_text as string | null) ?? null;
  }

  if (!extractedText) {
    return NextResponse.json(
      { error: "Could not extract text from resume" },
      { status: 422 }
    );
  }

  const snippet = extractedText.slice(0, 8000);

  // Step 2: parse resume into structured profile fields
  const parseMsg = await ai.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `Extract professional profile data from this resume text. Return ONLY valid JSON, no markdown.
Schema:
{
  "full_name": "string or null",
  "location": "string or null",
  "phone": "string or null",
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1", "skill2"],
  "experience": [{"title":"","company":"","start_date":"YYYY-MM or null","end_date":"YYYY-MM or null","description":"1-2 sentences"}],
  "education": [{"degree":"","institution":"","graduation_year":"YYYY or null"}]
}
Keep experience descriptions concise. Include all relevant skills as individual strings.`,
    messages: [{ role: "user", content: snippet }],
  });

  const parseRaw =
    parseMsg.content[0].type === "text" ? parseMsg.content[0].text.trim() : "{}";

  let parsed: Record<string, unknown> = {};
  try {
    // Strip markdown code fences if Claude wrapped it
    const clean = parseRaw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(clean);
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid data" },
      { status: 502 }
    );
  }

  // Step 3: upsert into profiles table
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
    await supabase.from("profiles").update(patch).eq("id", user.id);
  }

  // Step 4: generate clarifying questions about gaps
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, summary, skills, experience, education, location, phone")
    .eq("id", user.id)
    .single();

  const clarifyMsg = await ai.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: `You are a career assistant. Given a job seeker's profile, identify up to 3 gaps that would help employers evaluate them.
Return ONLY a JSON array. No markdown, no explanation.
Schema: [{"id":"q1","question":"...","hint":"short placeholder"}]
Focus on: missing skills context, unclear job titles, employment gaps, missing contact info.
If the profile looks complete, return [].`,
    messages: [
      {
        role: "user",
        content: `Profile:\n${JSON.stringify(profile ?? {})}\n\nResume snippet:\n${snippet.slice(0, 3000)}`,
      },
    ],
  });

  const clarifyRaw =
    clarifyMsg.content[0].type === "text" ? clarifyMsg.content[0].text.trim() : "[]";

  let questions: { id: string; question: string; hint: string }[] = [];
  try {
    const clean = clarifyRaw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
    questions = JSON.parse(clean);
  } catch {
    questions = [];
  }

  return NextResponse.json({
    fields_updated: fieldsUpdated,
    profile: { ...profile, ...patch },
    questions,
  });
}

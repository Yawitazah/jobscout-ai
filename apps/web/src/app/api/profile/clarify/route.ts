import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { upload_id } = await req.json();
  if (!upload_id) {
    return NextResponse.json({ error: "upload_id required" }, { status: 400 });
  }

  const { data: upload } = await supabase
    .from("resume_uploads")
    .select("extracted_text, user_id")
    .eq("id", upload_id)
    .single();

  if (!upload || upload.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!upload.extracted_text) {
    return NextResponse.json({ error: "Resume not yet extracted" }, { status: 422 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, summary, skills, experience, education, location")
    .eq("id", user.id)
    .single();

  const profileJson = JSON.stringify(profile ?? {});
  const resumeSnippet = upload.extracted_text.slice(0, 6000);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: `You are a career assistant helping a job seeker complete their profile.
Given their extracted resume text and the profile data we parsed, identify up to 3 gaps or ambiguities that would most help employers evaluate them.
Return ONLY a JSON array of question objects. No markdown, no explanation.
Schema: [{"id":"q1","question":"...", "hint":"short placeholder text"}]
Focus on: missing skills context, unclear job titles, employment gaps, or missing contact info.
If the profile looks complete, return an empty array [].`,
    messages: [
      {
        role: "user",
        content: `Profile so far:\n${profileJson}\n\nResume text:\n${resumeSnippet}`,
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "[]";

  let questions: { id: string; question: string; hint: string }[] = [];
  try {
    questions = JSON.parse(raw);
  } catch {
    questions = [];
  }

  return NextResponse.json({ questions });
}

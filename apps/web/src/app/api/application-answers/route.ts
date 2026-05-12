import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("application_answers")
    .select("question_key, question_text, answer, updated_at")
    .eq("user_id", user.id)
    .order("question_key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answers: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { question_key, question_text, answer } = body;

  if (!question_key || typeof answer !== "string") {
    return NextResponse.json({ error: "question_key and answer are required" }, { status: 400 });
  }

  const { error } = await supabase.from("application_answers").upsert(
    {
      user_id: user.id,
      question_key,
      question_text: question_text || question_key,
      answer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,question_key" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const question_key = searchParams.get("question_key");
  if (!question_key) {
    return NextResponse.json({ error: "question_key required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("application_answers")
    .delete()
    .eq("user_id", user.id)
    .eq("question_key", question_key);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

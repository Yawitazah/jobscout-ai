import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = [
  "target_titles",
  "target_locations",
  "work_modes",
  "salary_min",
  "salary_max",
  "industries",
  "deal_breakers",
  "auto_approve_rules",
];

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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key];
  }

  const { error } = await supabase
    .from("preferences")
    .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

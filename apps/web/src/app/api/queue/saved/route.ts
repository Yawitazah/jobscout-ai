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
    .from("user_jobs")
    .select(`
      id,
      score,
      match_reasons,
      deal_breakers_hit,
      reviewed_at,
      job:jobs (
        id,
        title,
        location,
        work_mode,
        employment_type,
        salary_min,
        salary_max,
        salary_currency,
        source_url,
        source_platform,
        posted_at,
        description,
        company:companies ( name, logo_url, website )
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "saved")
    .order("reviewed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const items = (data ?? []).map((item) => ({
    ...item,
    job: item.job
      ? {
          ...(item.job as any),
          description: stripHtml(((item.job as any).description ?? "")).slice(0, 600),
        }
      : null,
  }));

  return NextResponse.json({ items });
}

// Unsave (move back to pending or reject)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  const { error } = await supabase
    .from("user_jobs")
    .update({ status: "rejected", decision_source: "manual" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

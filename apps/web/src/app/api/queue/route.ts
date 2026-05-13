import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  // Load up to 200 — client handles filtering/sorting in-memory
  const limit = Math.min(Number(searchParams.get("limit") ?? "200"), 200);

  const { data, error } = await supabase
    .from("user_jobs")
    .select(
      `
      id,
      score,
      match_reasons,
      deal_breakers_hit,
      status,
      decision_source,
      scored_at,
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
        description,
        source_url,
        source_platform,
        posted_at,
        company:companies ( name, logo_url, website )
      )
    `
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .order("score", { ascending: false })
    .order("scored_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Strip HTML tags from description server-side
  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const mapped = (data ?? []).map((item) => ({
    ...item,
    job: item.job
      ? {
          ...item.job,
          description: stripHtml((item.job as any).description ?? "").slice(0, 800),
        }
      : null,
  }));

  return NextResponse.json({ items: mapped, next_cursor: null });
}

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
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 50);
  const cursor = searchParams.get("cursor");

  let query = supabase
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
    .limit(limit + 1);

  if (cursor) {
    // Fetch the score of the cursor item for keyset pagination
    const cursorRow = await supabase
      .from("user_jobs")
      .select("score, scored_at")
      .eq("id", cursor)
      .single();
    if (cursorRow.data) {
      query = query.lt("score", cursorRow.data.score);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  // Trim description to 600 chars
  const mapped = items.map((item) => ({
    ...item,
    job: item.job
      ? {
          ...item.job,
          description: (item.job as any).description?.slice(0, 600) ?? "",
        }
      : null,
  }));

  return NextResponse.json({ items: mapped, next_cursor: nextCursor });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from("user_jobs")
    .select(
      `
      id, score, match_reasons, deal_breakers_hit, status,
      job:jobs (
        id, title, location, work_mode, employment_type,
        salary_min, salary_max, salary_currency,
        description, source_url, source_platform, posted_at,
        skills_required, seniority_level,
        company:companies ( name, logo_url, website, description, industry )
      )
    `
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

import { NextResponse } from "next/server";
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

  // All approved user_jobs (source of truth for the Applications page)
  const { data: userJobs, error: ujError } = await supabase
    .from("user_jobs")
    .select(`
      id,
      score,
      reviewed_at,
      job:jobs (
        id,
        title,
        source_url,
        company:companies ( name, logo_url )
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false });

  if (ujError) {
    return NextResponse.json({ error: ujError.message }, { status: 500 });
  }

  if (!userJobs || userJobs.length === 0) {
    return NextResponse.json({ applications: [] });
  }

  // Fetch any application rows that exist for these user_jobs
  const userJobIds = userJobs.map((uj) => uj.id);
  const { data: apps } = await supabase
    .from("applications")
    .select(
      "id, status, user_job_id, submission_method, confirmation_number, submitted_at, updated_at, resume_doc_id, cover_letter_doc_id"
    )
    .in("user_job_id", userJobIds);

  const appByUserJobId = Object.fromEntries(
    (apps || []).map((a) => [a.user_job_id, a])
  );

  const merged = userJobs.map((uj) => ({
    user_job_id: uj.id,
    score: uj.score,
    reviewed_at: uj.reviewed_at,
    job: uj.job,
    application: appByUserJobId[uj.id] ?? null,
  }));

  return NextResponse.json({ applications: merged });
}

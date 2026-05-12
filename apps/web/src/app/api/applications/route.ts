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

  const { data, error } = await supabase
    .from("applications")
    .select(`
      id,
      status,
      submission_method,
      confirmation_number,
      submitted_at,
      created_at,
      updated_at,
      user_job:user_jobs (
        id,
        score,
        job:jobs (
          id,
          title,
          source_url,
          company:companies ( name, logo_url )
        )
      )
    `)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ applications: data });
}

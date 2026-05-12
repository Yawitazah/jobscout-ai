import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
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
    .from("applications")
    .select(`
      id,
      status,
      submission_method,
      confirmation_number,
      confirmation_email,
      screenshot_paths,
      submission_log,
      form_responses,
      submitted_at,
      created_at,
      updated_at,
      user_job:user_jobs (
        id,
        score,
        job:jobs (
          id,
          title,
          description,
          source_url,
          source_platform,
          location,
          work_mode,
          company:companies ( name, logo_url, website )
        )
      ),
      resume:generated_documents!resume_doc_id (
        id,
        content_json,
        content_text,
        verification_status,
        verification_notes,
        created_at
      ),
      cover_letter:generated_documents!cover_letter_doc_id (
        id,
        content_json,
        content_text,
        created_at
      )
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

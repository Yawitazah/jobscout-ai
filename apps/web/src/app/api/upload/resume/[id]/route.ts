import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function DELETE(
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
  const admin = getAdminClient();

  // Fetch the upload row — must belong to this user
  const { data: upload, error: fetchErr } = await admin
    .from("resume_uploads")
    .select("id, user_id, storage_path")
    .eq("id", id)
    .single();

  if (fetchErr || !upload || upload.user_id !== user.id) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Delete from storage
  if (upload.storage_path) {
    await admin.storage.from("resumes").remove([upload.storage_path as string]);
  }

  // Delete the DB row
  const { error: deleteErr } = await admin
    .from("resume_uploads")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

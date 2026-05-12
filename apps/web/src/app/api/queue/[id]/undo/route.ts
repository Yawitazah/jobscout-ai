import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

  // Only allow undo within 30 seconds
  const cutoff = new Date(Date.now() - 30_000).toISOString();

  const { data, error } = await supabase
    .from("user_jobs")
    .update({ status: "pending", reviewed_at: null, decision_source: null })
    .eq("id", id)
    .eq("user_id", user.id)
    .neq("status", "pending")
    .gte("reviewed_at", cutoff)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

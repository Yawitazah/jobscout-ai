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
  const { decision } = await req.json();

  const validDecisions = ["approve", "reject", "save"];
  if (!validDecisions.includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const statusMap: Record<string, string> = {
    approve: "approved",
    reject: "rejected",
    save: "saved",
  };

  const { data, error } = await supabase
    .from("user_jobs")
    .update({
      status: statusMap[decision],
      reviewed_at: new Date().toISOString(),
      decision_source: "manual",
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Kick off the application pipeline when a job is approved (fire-and-forget)
  if (decision === "approve") {
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch(`${apiUrl}/applications/start/${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {
          // Non-blocking — pipeline failure doesn't fail the decision
        });
      }
    }
  }

  return NextResponse.json(data);
}

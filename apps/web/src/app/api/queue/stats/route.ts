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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("user_jobs")
    .select("status, decision_source, scored_at, reviewed_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const counts = { pending: 0, approved: 0, rejected: 0, saved: 0 };
  let autoApproved = 0;
  let autoRejected = 0;

  for (const row of rows) {
    if (row.status in counts) counts[row.status as keyof typeof counts]++;
    if (row.decision_source === "auto") {
      if (row.status === "approved") autoApproved++;
      if (row.status === "rejected") autoRejected++;
    }
  }

  return NextResponse.json({
    ...counts,
    auto_approved_today: autoApproved,
    auto_rejected_today: autoRejected,
  });
}

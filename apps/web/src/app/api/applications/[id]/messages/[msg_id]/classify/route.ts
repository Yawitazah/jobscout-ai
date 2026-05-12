import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; msg_id: string }> }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { msg_id } = await params;
  const { classification } = await req.json();

  const valid = [
    "application_ack","interview_request","interview_followup",
    "request_info","rejection","offer","withdrawn","irrelevant","unknown",
  ];
  if (!valid.includes(classification)) {
    return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
  }

  const { error } = await supabase
    .from("inbox_messages")
    .update({
      classification,
      user_action: "seen",
      user_action_at: new Date().toISOString(),
    })
    .eq("id", msg_id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

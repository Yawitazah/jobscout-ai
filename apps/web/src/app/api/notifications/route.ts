import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, event_type, title, body, action_url, priority, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const unread_count = (data ?? []).filter((n) => !n.read_at).length;
  return NextResponse.json({ notifications: data ?? [], unread_count });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, id } = await req.json();

  if (action === "mark_read" && id) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  } else if (action === "mark_all_read") {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  }

  return NextResponse.json({ ok: true });
}

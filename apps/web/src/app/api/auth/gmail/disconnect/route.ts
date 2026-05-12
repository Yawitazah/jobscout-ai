import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { connection_id } = await req.json();

  await supabase
    .from("email_connections")
    .update({ is_active: false, access_token: "", refresh_token: null })
    .eq("id", connection_id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}

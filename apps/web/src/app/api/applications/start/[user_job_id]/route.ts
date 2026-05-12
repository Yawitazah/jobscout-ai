import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ user_job_id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();
  if (authError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user_job_id } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "API not configured" }, { status: 503 });
  }

  const res = await fetch(`${apiUrl}/applications/start/${user_job_id}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}

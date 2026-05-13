import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ user_job_id: string }> }
) {
  const supabase = await createClient();

  // getUser() hits Supabase's auth server — always returns a fresh, valid token.
  // getSession() can return a cached/expired token from cookies.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Grab a fresh session so we have a valid access_token to forward
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const { user_job_id } = await params;
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "API_URL not configured" }, { status: 503 });
  }

  const backendUrl = `${apiUrl}/applications/start/${user_job_id}`;

  let res: Response;
  try {
    res = await fetch(backendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Could not reach backend: ${err?.message ?? err}` },
      { status: 502 }
    );
  }

  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}

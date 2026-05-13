import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  // getUser() reliably verifies the user via Supabase API (works in Railway SSR)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiUrl) {
    return NextResponse.json({ error: "API URL not configured" }, { status: 500 });
  }
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Service key not configured" }, { status: 500 });
  }

  try {
    // Authenticate as service role so we don't need the user's session token.
    // FastAPI's get_service_or_user accepts the service-role JWT + X-User-Id header.
    const res = await fetch(`${apiUrl}/api/admin/scout/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        "X-User-Id": user.id,
      },
      body: JSON.stringify({ user_id: user.id }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail ?? `Scout trigger failed (${res.status})` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Network error" },
      { status: 502 }
    );
  }
}

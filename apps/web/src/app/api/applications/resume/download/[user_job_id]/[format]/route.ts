import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ user_job_id: string; format: string }> }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const { user_job_id, format } = await params;
  if (!["docx", "pdf"].includes(format)) {
    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  }

  // API_URL is preferred (server-only var); fall back to NEXT_PUBLIC_API_URL
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "API_URL not configured" }, { status: 503 });
  }

  const backendUrl = `${apiUrl}/applications/${user_job_id}/resume/download/${format}`;

  let res: Response;
  try {
    res = await fetch(backendUrl, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Backend unreachable: ${err?.message}` }, { status: 502 });
  }

  if (!res.ok) {
    const body = await res.text();
    return new NextResponse(body, { status: res.status });
  }

  const blob = await res.arrayBuffer();
  const contentType = format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const filename = format === "pdf" ? "resume.pdf" : "resume.docx";

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

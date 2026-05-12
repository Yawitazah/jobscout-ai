import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

const ALLOWED_HOSTS = [
  "linkedin.com",
  "www.linkedin.com",
  "github.com",
  "www.github.com",
];

function isAllowedUrl(raw: string): boolean {
  try {
    const { hostname, protocol } = new URL(raw);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  if (!isAllowedUrl(url)) {
    return NextResponse.json(
      { error: "Only LinkedIn and GitHub URLs are supported" },
      { status: 400 }
    );
  }

  let pageText: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; JobScoutBot/1.0; +https://jobscout.ai/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${res.status}` },
        { status: 400 }
      );
    }
    const html = await res.text();
    pageText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 10000);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch the URL" }, { status: 400 });
  }

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `Extract professional profile data from this webpage text. Return ONLY JSON.
Schema:
{
  "full_name": "string or null",
  "headline": "string or null",
  "location": "string or null",
  "summary": "string or null",
  "skills": ["skill1", ...],
  "experience": [{"title":"","company":"","start_date":"YYYY-MM or null","end_date":"YYYY-MM or null","description":""}],
  "education": [{"degree":"","institution":"","graduation_year":"YYYY or null"}]
}`,
    messages: [{ role: "user", content: pageText }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "AI returned invalid data" }, { status: 502 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fieldMap: Record<string, string> = {
    full_name: "full_name",
    headline: "summary",
    location: "location",
    summary: "summary",
    skills: "skills",
    experience: "experience",
    education: "education",
  };
  const updated: string[] = [];
  for (const [aiKey, dbKey] of Object.entries(fieldMap)) {
    const val = parsed[aiKey];
    if (val !== null && val !== undefined && val !== "" && !( Array.isArray(val) && val.length === 0)) {
      patch[dbKey] = val;
      if (!updated.includes(dbKey)) updated.push(dbKey);
    }
  }

  await supabase.from("profiles").update(patch).eq("id", user.id);

  return NextResponse.json({ fields_updated: updated });
}

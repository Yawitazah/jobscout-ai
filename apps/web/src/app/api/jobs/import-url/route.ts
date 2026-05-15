import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

function detectPlatform(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "custom";
  }
  if (host.includes("greenhouse.io") || url.includes("gh_jid=")) return "greenhouse";
  if (host.includes("lever.co")) return "lever";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("indeed.com")) return "indeed";
  if (host.includes("workday") || host.includes("myworkdayjobs.com")) return "workday";
  if (host.includes("ashbyhq.com")) return "ashby";
  if (host.includes("smartrecruiters.com")) return "smartrecruiters";
  if (host.includes("icims.com")) return "icims";
  return "custom";
}

type Scraped = { title: string; company: string; description: string };

function pickMeta(html: string, prop: string, attr: "property" | "name" = "property"): string {
  const a = html.match(new RegExp(`<meta\\s+[^>]*${attr}=["']${prop}["']\\s+[^>]*content=["']([^"']*)["']`, "i"));
  const b = html.match(new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["']\\s+[^>]*${attr}=["']${prop}["']`, "i"));
  return (a?.[1] ?? b?.[1] ?? "").trim();
}

function extractBodyText(html: string): string {
  // Strip script/style/nav/footer/header so they don't leak into the JD.
  let cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "");
  // Prefer <main> / <article> if present (real content lives there).
  const main = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
    || cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (main) cleaned = main[1];
  // Convert block-level closures to newlines so paragraphs/list-items stay readable.
  cleaned = cleaned
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

async function scrape(url: string): Promise<Scraped> {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JobScout-Importer/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { title: "", company: "", description: "" };
    const html = await r.text();

    let title = pickMeta(html, "og:title") || pickMeta(html, "twitter:title");
    if (!title) {
      const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      title = t?.[1]?.trim() ?? "";
    }
    const company = pickMeta(html, "og:site_name");

    // Prefer the page body text (real JD content) over og:description (usually
    // a one-liner). Cap at 8 KB so we don't blow up the tailoring prompt.
    const bodyText = extractBodyText(html);
    const ogDesc = pickMeta(html, "og:description") || pickMeta(html, "description", "name");
    let description = bodyText.length > ogDesc.length * 2 ? bodyText : ogDesc;
    if (description.length > 8000) description = description.slice(0, 8000);

    if (title.includes(" - ") && !company) {
      const idx = title.lastIndexOf(" - ");
      return { title: title.slice(0, idx).trim(), company: title.slice(idx + 3).trim(), description };
    }
    return { title: title.trim(), company: company.trim(), description: description.trim() };
  } catch {
    return { title: "", company: "", description: "" };
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

  const body = await req.json().catch(() => ({} as { url?: string; title?: string; company?: string }));
  const url = (body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const platform = detectPlatform(url);
  const scraped = await scrape(url);
  const title = (body.title?.trim() || scraped.title || `Imported job (${platform})`).trim();
  const companyName = (body.company?.trim() || scraped.company || "Unknown company").trim();

  const { data: coExisting } = await supabase
    .from("companies")
    .select("id")
    .eq("name", companyName)
    .limit(1)
    .maybeSingle();

  let companyId: string;
  if (coExisting?.id) {
    companyId = coExisting.id;
  } else {
    const { data: coNew, error: coErr } = await supabase
      .from("companies")
      .insert({ name: companyName })
      .select("id")
      .single();
    if (coErr || !coNew) {
      return NextResponse.json({ error: `Company insert failed: ${coErr?.message}` }, { status: 500 });
    }
    companyId = coNew.id;
  }

  const dedupeHash = createHash("sha256").update(url).digest("hex");
  const sourceId = `${platform}-${dedupeHash.slice(0, 12)}`;

  const { data: jobExisting } = await supabase
    .from("jobs")
    .select("id")
    .eq("dedupe_hash", dedupeHash)
    .limit(1)
    .maybeSingle();

  let jobId: string;
  if (jobExisting?.id) {
    jobId = jobExisting.id;
  } else {
    const { data: jobNew, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        source_platform: platform,
        source_id: sourceId,
        source_url: url,
        title,
        description: scraped.description || "",
        company_id: companyId,
        dedupe_hash: dedupeHash,
        location: "",
      })
      .select("id")
      .single();
    if (jobErr || !jobNew) {
      return NextResponse.json({ error: `Job insert failed: ${jobErr?.message}` }, { status: 500 });
    }
    jobId = jobNew.id;
  }

  const { data: ujExisting } = await supabase
    .from("user_jobs")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("job_id", jobId)
    .limit(1)
    .maybeSingle();

  let userJobId: string;
  if (ujExisting?.id) {
    userJobId = ujExisting.id;
    if (ujExisting.status !== "approved") {
      await supabase
        .from("user_jobs")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", userJobId);
    }
  } else {
    const { data: ujNew, error: ujErr } = await supabase
      .from("user_jobs")
      .insert({
        user_id: user.id,
        job_id: jobId,
        score: 100,
        status: "approved",
        decision_source: "manual",
      })
      .select("id")
      .single();
    if (ujErr || !ujNew) {
      return NextResponse.json({ error: `user_job insert failed: ${ujErr?.message}` }, { status: 500 });
    }
    userJobId = ujNew.id;
  }

  // Clone most-recent docs so the agent has something to upload immediately.
  const { data: lastApp } = await supabase
    .from("applications")
    .select("resume_doc_id, cover_letter_doc_id")
    .eq("user_id", user.id)
    .not("resume_doc_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const resumeDocId = lastApp?.resume_doc_id ?? null;
  const coverDocId = lastApp?.cover_letter_doc_id ?? null;

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      user_job_id: userJobId,
      status: resumeDocId ? "ready_to_submit" : "queued",
      resume_doc_id: resumeDocId,
      cover_letter_doc_id: coverDocId,
    })
    .select("id, status")
    .single();
  if (appErr || !app) {
    return NextResponse.json({ error: `application insert failed: ${appErr?.message}` }, { status: 500 });
  }

  return NextResponse.json({
    application_id: app.id,
    status: app.status,
    title,
    company: companyName,
    platform,
    source_url: url,
  });
}

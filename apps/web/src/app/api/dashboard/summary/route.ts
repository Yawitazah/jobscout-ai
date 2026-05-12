import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = user.id;
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86400_000).toISOString();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [
    queueRes,
    appliedRes,
    conversationRes,
    interviewingRes,
    offerRes,
    upcomingRes,
    todayMatchesRes,
    todaySubmittedRes,
    activityRes,
    needsActionAppsRes,
    needsActionMsgsRes,
  ] = await Promise.all([
    supabase.from("user_jobs").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "pending"),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "submitted"),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", uid).in("status", ["submitted","interview_proposed","interview_scheduled"]),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", uid).in("status", ["interview_proposed","interview_scheduled"]),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "offer_received"),
    supabase.from("interviews").select("id, round_name, scheduled_at, format, meeting_link, status, application:applications(user_jobs(job:jobs(title, company:companies(name))))").eq("user_id", uid).in("status", ["scheduled","proposed"]).gte("scheduled_at", now.toISOString()).lte("scheduled_at", in14Days).order("scheduled_at"),
    supabase.from("user_jobs").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "pending"),
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("submitted_at", today),
    supabase.from("application_events").select("id, event_type, event_data, occurred_at, application:applications(user_jobs(job:jobs(title, company:companies(name))))").eq("user_id", uid).order("occurred_at", { ascending: false }).limit(10),
    supabase.from("applications").select("id, status, user_jobs(job:jobs(title, company:companies(name)))").eq("user_id", uid).in("status", ["interview_proposed"]),
    supabase.from("inbox_messages").select("id, subject, classification, application_id").eq("user_id", uid).eq("requires_user_attention" as any, true).is("user_action", null).limit(5),
  ]);

  const topItems: any[] = [];
  for (const app of needsActionAppsRes.data ?? []) {
    const job = (app.user_jobs as any)?.job;
    topItems.push({
      type: "interview_proposed",
      label: `Confirm interview: ${job?.title ?? "role"} at ${job?.company?.name ?? ""}`,
      url: `/applications/${app.id}`,
    });
  }
  for (const msg of needsActionMsgsRes.data ?? []) {
    topItems.push({
      type: msg.classification,
      label: msg.subject ?? "Recruiter message",
      url: msg.application_id ? `/applications/${msg.application_id}` : "/applications",
    });
  }

  return NextResponse.json({
    needs_action: { count: topItems.length, top_items: topItems.slice(0, 3) },
    pipeline: {
      queue: queueRes.count ?? 0,
      applied: appliedRes.count ?? 0,
      conversation: conversationRes.count ?? 0,
      interviewing: interviewingRes.count ?? 0,
      offer: offerRes.count ?? 0,
    },
    upcoming_interviews: upcomingRes.data ?? [],
    today_stats: {
      matches_pending: todayMatchesRes.count ?? 0,
      applications_submitted: todaySubmittedRes.count ?? 0,
    },
    activity: activityRes.data ?? [],
  });
}

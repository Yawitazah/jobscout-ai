"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Inbox, FileText, MessageCircle, Calendar, Gift,
  AlertCircle, Clock, Video, Phone, Monitor, ArrowRight,
} from "lucide-react";
import { useUser, getFirstName } from "@/components/app/UserContext";
import { createClient } from "@/lib/supabase/client";

interface DashboardSummary {
  needs_action: { count: number; top_items: Array<{ type: string; label: string; url: string }> };
  pipeline: { queue: number; applied: number; conversation: number; interviewing: number; offer: number };
  upcoming_interviews: Array<{
    id: string;
    round_name: string | null;
    scheduled_at: string;
    format: string;
    meeting_link: string | null;
    status: string;
    application: { user_jobs: { job: { title: string; company: { name: string } | null } | null } | null } | null;
  }>;
  today_stats: { matches_pending: number; applications_submitted: number };
  activity: Array<{ id: string; event_type: string; event_data: Record<string, unknown>; occurred_at: string; application: unknown }>;
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const FORMAT_ICONS: Record<string, React.ElementType> = {
  video: Video,
  phone: Phone,
  onsite: Monitor,
  take_home: FileText,
};

const PIPELINE_STAGES = [
  { key: "queue", label: "Queue", icon: Inbox, href: "/queue", color: "text-gray-500 bg-gray-50" },
  { key: "applied", label: "Applied", icon: FileText, href: "/applications?filter=active", color: "text-blue-600 bg-blue-50" },
  { key: "conversation", label: "Conversation", icon: MessageCircle, href: "/applications?filter=active", color: "text-purple-600 bg-purple-50" },
  { key: "interviewing", label: "Interviewing", icon: Calendar, href: "/applications?filter=needs_action", color: "text-yellow-600 bg-yellow-50" },
  { key: "offer", label: "Offer", icon: Gift, href: "/applications?filter=closed", color: "text-green-600 bg-green-50" },
];

export default function DashboardPage() {
  const { user } = useUser();
  const firstName = getFirstName(user.user_metadata?.full_name as string | undefined);
  const greeting = getTimeGreeting();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchSummary() {
    const r = await fetch("/api/dashboard/summary");
    if (r.ok) setSummary(await r.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchSummary();
  }, []);

  // Realtime: re-fetch when applications or events change
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "applications", filter: `user_id=eq.${user.id}` }, fetchSummary)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "application_events", filter: `user_id=eq.${user.id}` }, fetchSummary)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user.id]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Good {greeting}{firstName ? `, ${firstName}` : ""}.
        </h1>
      </div>

      {/* Needs attention */}
      {!loading && summary && summary.needs_action.count > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
            <AlertCircle size={16} />
            {summary.needs_action.count} item{summary.needs_action.count !== 1 ? "s" : ""} need your attention
          </div>
          {summary.needs_action.top_items.map((item, i) => (
            <Link key={i} href={item.url} className="flex items-center justify-between text-sm text-amber-800 hover:text-amber-900 group">
              <span className="truncate">{item.label}</span>
              <ArrowRight size={14} className="flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
          <Link href="/applications?filter=needs_action" className="text-xs text-amber-600 underline">See all</Link>
        </div>
      )}

      {/* Pipeline strip */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pipeline</h2>
        <div className="grid grid-cols-5 gap-2">
          {PIPELINE_STAGES.map((stage) => {
            const Icon = stage.icon;
            const count = loading ? null : (summary?.pipeline as any)?.[stage.key] ?? 0;
            return (
              <Link
                key={stage.key}
                href={stage.href}
                className="border border-gray-100 rounded-xl p-3 text-center hover:border-gray-200 hover:shadow-sm transition-all"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1.5 ${stage.color}`}>
                  <Icon size={15} />
                </div>
                <p className="text-lg font-bold text-gray-900">{count ?? "—"}</p>
                <p className="text-xs text-gray-400 truncate">{stage.label}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Today's stats */}
      {!loading && summary && (
        <div className="flex gap-3">
          <div className="flex-1 border border-gray-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{summary.today_stats.matches_pending}</p>
            <p className="text-xs text-gray-400">matches to review</p>
            <Link href="/queue" className="text-xs text-[#1A2B4C] underline mt-1 block">Review queue →</Link>
          </div>
          <div className="flex-1 border border-gray-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{summary.today_stats.applications_submitted}</p>
            <p className="text-xs text-gray-400">submitted today</p>
          </div>
        </div>
      )}

      {/* Upcoming interviews */}
      {!loading && summary && summary.upcoming_interviews.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Upcoming interviews</h2>
          <div className="space-y-2">
            {summary.upcoming_interviews.map((iv) => {
              const job = (iv.application as any)?.user_jobs?.job;
              const FormatIcon = FORMAT_ICONS[iv.format] ?? Calendar;
              return (
                <div key={iv.id} className="flex items-center gap-3 border border-gray-100 rounded-xl p-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-yellow-50 rounded-full flex items-center justify-center">
                    <FormatIcon size={14} className="text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {iv.round_name ?? "Interview"} — {job?.company?.name ?? ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(iv.scheduled_at).toLocaleString()}
                      {iv.status === "proposed" && " (unconfirmed)"}
                    </p>
                  </div>
                  {iv.meeting_link && (
                    <a href={iv.meeting_link} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-xs text-[#1A2B4C] border border-[#1A2B4C] px-2 py-1 rounded-[6px] hover:bg-[#F7F9FC]">
                      Join
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity feed */}
      {!loading && summary && summary.activity.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent activity</h2>
          <div className="space-y-2">
            {summary.activity.map((ev) => {
              const job = (ev.application as any)?.user_jobs?.job;
              return (
                <div key={ev.id} className="flex items-center gap-3 text-sm text-gray-600">
                  <Clock size={13} className="text-gray-300 flex-shrink-0" />
                  <span className="flex-1 truncate">
                    {ev.event_type.replace(/_/g, " ")}{job?.title ? ` — ${job.title}` : ""}
                  </span>
                  <span className="text-xs text-gray-300 flex-shrink-0">
                    {new Date(ev.occurred_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading dashboard...</div>}
    </div>
  );
}

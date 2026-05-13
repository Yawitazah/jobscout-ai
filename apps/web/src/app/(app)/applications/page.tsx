"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, CheckCircle, XCircle, Clock, Send, AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

interface Application {
  id: string;
  status: string;
  submission_method: string | null;
  confirmation_number: string | null;
  submitted_at: string | null;
  updated_at: string;
  user_job: {
    id: string;
    score: number;
    job: {
      id: string;
      title: string;
      source_url: string;
      company: { name: string; logo_url: string | null } | null;
    } | null;
  } | null;
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:                { label: "Draft",                    color: "text-gray-500 bg-gray-50",    icon: FileText },
  tailoring_resume:     { label: "Tailoring resume…",        color: "text-yellow-700 bg-yellow-50", icon: Clock },
  writing_cover_letter: { label: "Writing cover letter…",    color: "text-yellow-700 bg-yellow-50", icon: Clock },
  ready_to_submit:      { label: "Waiting for local agent",  color: "text-blue-700 bg-blue-50",    icon: Send },
  submitting:           { label: "Submitting…",              color: "text-yellow-700 bg-yellow-50", icon: Clock },
  submitted:            { label: "Submitted ✓",              color: "text-green-700 bg-green-50",  icon: CheckCircle },
  submit_failed:        { label: "Failed",                   color: "text-red-700 bg-red-50",      icon: XCircle },
  withdrawn:            { label: "Withdrawn",                color: "text-gray-400 bg-gray-50",    icon: AlertCircle },
};

type Filter = "all" | "needs_action" | "active" | "closed";

const NEEDS_ACTION_STATUSES = ["interview_proposed"];
const ACTIVE_STATUSES = ["submitted", "interview_scheduled", "interview_proposed"];
const CLOSED_STATUSES = ["closed_rejected", "withdrawn", "offer_received"];

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.json())
      .then((d) => setApplications(d.applications ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = applications.filter((app) => {
    if (filter === "needs_action") return NEEDS_ACTION_STATUSES.includes(app.status);
    if (filter === "active") return ACTIVE_STATUSES.includes(app.status);
    if (filter === "closed") return CLOSED_STATUSES.includes(app.status);
    return true;
  });

  if (loading) {
    return (
      <div className="text-center text-gray-400 py-20 text-sm">Loading applications...</div>
    );
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No applications yet."
        description="Approve jobs in your queue to start applying."
      />
    );
  }

  const readyCount = applications.filter((a) => a.status === "ready_to_submit").length;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <span className="text-sm text-gray-500">{applications.length} total</span>
      </div>

      {/* Local agent banner */}
      {readyCount > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3 items-start">
          <Send size={16} className="text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-900">
              {readyCount} application{readyCount > 1 ? "s" : ""} ready to submit
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              The resume & cover letter are generated. Start the local agent on your computer to open a browser and submit automatically.
            </p>
            <code className="mt-1.5 block text-[11px] bg-blue-100 text-blue-800 rounded px-2 py-1 font-mono">
              cd apps/api &amp;&amp; python -m app.agent.local_runner
            </code>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-4">
        {(["all", "needs_action", "active", "closed"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              filter === f
                ? "bg-[#1A2B4C] text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {f === "needs_action" ? "Needs action" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">No applications in this filter.</p>
      )}

      {filtered.map((app) => {
        const meta = STATUS_META[app.status] ?? STATUS_META.draft;
        const Icon = meta.icon;
        const job = app.user_job?.job;
        return (
          <Link
            key={app.id}
            href={`/applications/${app.id}`}
            className="block border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {job?.title ?? "Unknown role"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {job?.company?.name}
                  {app.confirmation_number && ` · Ref: ${app.confirmation_number}`}
                </p>
              </div>
              <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${meta.color}`}>
                <Icon size={11} />
                {meta.label}
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-2">
              Updated {new Date(app.updated_at).toLocaleDateString()}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

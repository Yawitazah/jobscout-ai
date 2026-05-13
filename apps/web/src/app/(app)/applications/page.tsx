"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  AlertCircle,
  Play,
  Loader2,
  RefreshCw,
  Mail,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

interface ApprovedJob {
  user_job_id: string;
  score: number;
  reviewed_at: string;
  job: {
    id: string;
    title: string;
    source_url: string;
    company: { name: string; logo_url: string | null } | null;
  } | null;
  application: {
    id: string;
    status: string;
    submission_method: string | null;
    confirmation_number: string | null;
    submitted_at: string | null;
    updated_at: string;
    resume_doc_id: string | null;
    cover_letter_doc_id: string | null;
  } | null;
}

const APP_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  queued:               { label: "Queued",                  color: "text-gray-500 bg-gray-50",     icon: Clock        },
  draft:                { label: "Draft",                   color: "text-gray-500 bg-gray-50",     icon: FileText     },
  tailoring_resume:     { label: "Tailoring resume…",       color: "text-yellow-700 bg-yellow-50", icon: Clock        },
  writing_cover_letter: { label: "Writing cover letter…",   color: "text-yellow-700 bg-yellow-50", icon: Clock        },
  ready_to_submit:      { label: "Ready — run local agent", color: "text-blue-700 bg-blue-50",     icon: Send         },
  submitting:           { label: "Submitting…",             color: "text-yellow-700 bg-yellow-50", icon: Clock        },
  submitted:            { label: "Submitted ✓",             color: "text-green-700 bg-green-50",   icon: CheckCircle  },
  submit_failed:        { label: "Failed",                  color: "text-red-700 bg-red-50",       icon: XCircle      },
  more_info_needed:     { label: "More info needed",        color: "text-amber-700 bg-amber-50",   icon: AlertCircle  },
  withdrawn:            { label: "Withdrawn",               color: "text-gray-400 bg-gray-50",     icon: AlertCircle  },
};

type Filter = "all" | "in_progress" | "submitted" | "failed";

function effectiveStatus(app: ApprovedJob["application"]) {
  return app?.status ?? "queued";
}

export default function ApplicationsPage() {
  const [jobs, setJobs] = useState<ApprovedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [starting, setStarting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadJobs = async () => {
    const r = await fetch("/api/applications");
    const d = await r.json();
    if (d.applications) setJobs(d.applications);
  };

  useEffect(() => {
    loadJobs().finally(() => setLoading(false));

    // Poll every 8 s while any job is in an in-progress state
    const timer = setInterval(() => {
      loadJobs();
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const startApplication = async (userJobId: string) => {
    setStarting(userJobId);
    setErrors((e) => ({ ...e, [userJobId]: "" }));
    try {
      const res = await fetch(`/api/applications/start/${userJobId}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.detail || data?.error || `Error ${res.status}`;
        setErrors((e) => ({ ...e, [userJobId]: msg }));
        return;
      }

      // Optimistically flip to tailoring_resume so the button disappears immediately
      setJobs((prev) =>
        prev.map((j) =>
          j.user_job_id === userJobId
            ? {
                ...j,
                application: {
                  id: data.application_id ?? "",
                  status: data.status ?? "tailoring_resume",
                  submission_method: null,
                  confirmation_number: null,
                  submitted_at: null,
                  updated_at: new Date().toISOString(),
                  resume_doc_id: null,
                  cover_letter_doc_id: null,
                },
              }
            : j
        )
      );
    } catch (err: any) {
      setErrors((e) => ({ ...e, [userJobId]: err?.message ?? "Network error" }));
    } finally {
      setStarting(null);
    }
  };

  const readyWithDocs = jobs.filter(
    (j) => j.application?.status === "ready_to_submit" && j.application?.resume_doc_id
  ).length;
  const readyNoDocs = jobs.filter(
    (j) => j.application?.status === "ready_to_submit" && !j.application?.resume_doc_id
  ).length;
  const readyCount = readyWithDocs + readyNoDocs;

  const filtered = jobs.filter((j) => {
    const s = effectiveStatus(j.application);
    if (filter === "in_progress") return ["queued", "draft", "tailoring_resume", "writing_cover_letter", "ready_to_submit", "submitting"].includes(s);
    if (filter === "submitted") return s === "submitted";
    if (filter === "failed") return ["submit_failed", "more_info_needed"].includes(s);
    return true;
  });

  if (loading) {
    return <div className="text-center text-gray-400 py-20 text-sm">Loading applications…</div>;
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No approved jobs yet."
        description="Approve jobs in your queue and the agent will generate a tailored resume and cover letter, then submit automatically."
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <span className="text-sm text-gray-500">{jobs.length} approved</span>
      </div>

      {/* Local agent banner — only show when docs actually exist */}
      {readyWithDocs > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3 items-start">
          <Send size={16} className="text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-900">
              {readyWithDocs} application{readyWithDocs > 1 ? "s" : ""} ready to submit
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Resume &amp; cover letter are tailored. Start the local agent to open a browser and submit.
            </p>
            <code className="mt-1.5 block text-[11px] bg-blue-100 text-blue-800 rounded px-2 py-1 font-mono">
              cd apps/api &amp;&amp; python -m app.agent.local_runner
            </code>
          </div>
        </div>
      )}

      {/* Regenerate banner — docs missing due to API credit issue */}
      {readyNoDocs > 0 && readyWithDocs === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 items-start">
          <RefreshCw size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {readyNoDocs} application{readyNoDocs > 1 ? "s need" : " needs"} document generation
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Add credits at{" "}
              <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" className="underline">
                console.anthropic.com/settings/billing
              </a>
              {" "}then click <strong>Regenerate Docs</strong> on each card below.
            </p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "in_progress", "submitted", "failed"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              filter === f ? "bg-[#1A2B4C] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {f === "in_progress" ? "In Progress" : f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">No applications in this category.</p>
      )}

      <div className="space-y-3">
        {filtered.map((item) => {
          const app = item.application;
          const status = effectiveStatus(app);
          const meta = APP_STATUS[status] ?? APP_STATUS.queued;
          const Icon = meta.icon;
          const job = item.job;
          const hasResume = !!app?.resume_doc_id;
          const hasCoverLetter = !!app?.cover_letter_doc_id;

          return (
            <div
              key={item.user_job_id}
              className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all bg-white"
            >
              <div className="flex items-start gap-3">
                {/* Company logo */}
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-gray-400 text-xs font-bold overflow-hidden">
                  {(job?.company as any)?.logo_url ? (
                    <img src={(job?.company as any).logo_url} alt="" className="w-full h-full object-contain" />
                  ) : (
                    (job?.company?.name ?? "?")[0]?.toUpperCase()
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {job?.title ?? "Unknown role"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {job?.company?.name}
                    {app?.confirmation_number && ` · Ref: ${app.confirmation_number}`}
                  </p>

                  {/* Doc badges */}
                  {(hasResume || hasCoverLetter) && (
                    <div className="flex gap-1.5 mt-1.5">
                      {hasResume && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">
                          Resume ready
                        </span>
                      )}
                      {hasCoverLetter && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">
                          Cover letter ready
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${meta.color}`}>
                  <Icon size={10} />
                  {meta.label}
                </span>
              </div>

              {/* Action row */}
              <div className="flex flex-col gap-1 mt-3 pt-3 border-t border-gray-50">
                {/* Error message */}
                {errors[item.user_job_id] && (
                  <p className="text-xs text-red-600 mb-1">
                    ⚠ {errors[item.user_job_id]}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {/* View application detail */}
                  {app?.id && (
                    <Link
                      href={`/applications/${app.id}`}
                      className="text-xs font-medium text-[#1A2B4C] hover:underline"
                    >
                      View details →
                    </Link>
                  )}

                  {/* More info needed — open Scout */}
                  {status === "more_info_needed" && app?.id && (
                    <Link
                      href={`/scout?applicationId=${app.id}`}
                      className="flex items-center gap-1.5 text-xs font-medium bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors"
                    >
                      <Mail size={11} /> Provide Details
                    </Link>
                  )}

                  {/* (Re-)start application */}
                  {(!app || ["queued", "submit_failed"].includes(status)) && (
                    <button
                      onClick={() => startApplication(item.user_job_id)}
                      disabled={starting === item.user_job_id}
                      className="flex items-center gap-1.5 text-xs font-medium bg-[#1A2B4C] text-white px-3 py-1.5 rounded-lg hover:bg-[#243b63] disabled:opacity-60 transition-colors"
                    >
                      {starting === item.user_job_id ? (
                        <><Loader2 size={11} className="animate-spin" /> Starting…</>
                      ) : (
                        <><Play size={11} /> {app ? "Retry" : "Start Application"}</>
                      )}
                    </button>
                  )}

                  {/* Generate docs when ready_to_submit but nothing generated yet */}
                  {status === "ready_to_submit" && !hasResume && !hasCoverLetter && (
                    <button
                      onClick={() => startApplication(item.user_job_id)}
                      disabled={starting === item.user_job_id}
                      className="flex items-center gap-1.5 text-xs font-medium bg-[#1A2B4C] text-white px-3 py-1.5 rounded-lg hover:bg-[#243b63] disabled:opacity-60 transition-colors"
                    >
                      {starting === item.user_job_id ? (
                        <><Loader2 size={11} className="animate-spin" /> Generating…</>
                      ) : (
                        <><RefreshCw size={11} /> Generate Docs</>
                      )}
                    </button>
                  )}

                  {/* Regenerate — docs already exist but user wants a fresh version */}
                  {(status === "ready_to_submit" && (hasResume || hasCoverLetter)) && (
                    <button
                      onClick={() => startApplication(item.user_job_id)}
                      disabled={starting === item.user_job_id}
                      className="flex items-center gap-1.5 text-xs font-medium border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
                    >
                      {starting === item.user_job_id ? (
                        <><Loader2 size={11} className="animate-spin" /> Regenerating…</>
                      ) : (
                        <><RefreshCw size={11} /> Regenerate</>
                      )}
                    </button>
                  )}

                  {/* Regenerate after submission — get a better version */}
                  {status === "submitted" && (
                    <button
                      onClick={() => startApplication(item.user_job_id)}
                      disabled={starting === item.user_job_id}
                      className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
                    >
                      {starting === item.user_job_id ? (
                        <><Loader2 size={11} className="animate-spin" /> Regenerating…</>
                      ) : (
                        <><RefreshCw size={11} /> Regenerate docs</>
                      )}
                    </button>
                  )}

                  {/* Manual apply link */}
                  {job?.source_url && (
                    <a
                      href={job.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-xs text-gray-400 hover:text-gray-600 hover:underline"
                    >
                      Apply manually ↗
                    </a>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-gray-300 mt-2">
                Approved {new Date(item.reviewed_at).toLocaleDateString()}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

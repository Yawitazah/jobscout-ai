"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { ArrowLeft, Download, Send, CheckCircle, XCircle, Clock, AlertCircle, ExternalLink, Mail, Calendar, FileText, Info, RefreshCw, Loader2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface ApplicationDetail {
  id: string;
  status: string;
  submission_method: string | null;
  confirmation_number: string | null;
  confirmation_email: string | null;
  screenshot_paths: string[];
  submission_log: Array<{ action: string; detail: string; ok: boolean }>;
  form_responses: Record<string, string>;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  user_job: {
    id: string;
    score: number;
    job: {
      id: string;
      title: string;
      description: string;
      source_url: string;
      source_platform: string;
      location: string | null;
      work_mode: string | null;
      company: { name: string; logo_url: string | null; website: string | null } | null;
    } | null;
  } | null;
  resume: {
    id: string;
    content_json: Record<string, unknown>;
    content_text: string;
    verification_status: string;
    verification_notes: Array<{ field: string; issue: string; severity: string }>;
    created_at: string;
  } | null;
  cover_letter: {
    id: string;
    content_json: { paragraphs: string[]; word_count: number; banned_words_found: string[] };
    content_text: string;
    created_at: string;
  } | null;
}

type Tab = "resume" | "cover_letter" | "submission" | "timeline";

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:                { label: "Draft",                   color: "text-gray-500",   icon: AlertCircle  },
  queued:               { label: "Queued",                  color: "text-gray-500",   icon: Clock        },
  tailoring_resume:     { label: "Tailoring resume…",       color: "text-yellow-600", icon: Clock        },
  writing_cover_letter: { label: "Writing cover letter…",   color: "text-yellow-600", icon: Clock        },
  ready_to_submit:      { label: "Ready to submit",         color: "text-blue-600",   icon: CheckCircle  },
  submitting:           { label: "Submitting…",             color: "text-yellow-600", icon: Clock        },
  submitted:            { label: "Submitted ✓",             color: "text-green-600",  icon: CheckCircle  },
  submit_failed:        { label: "Submission failed",       color: "text-red-600",    icon: XCircle      },
  withdrawn:            { label: "Withdrawn",               color: "text-gray-400",   icon: AlertCircle  },
};

export default function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("resume");
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showAgentCmd, setShowAgentCmd] = useState(false);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then((r) => r.json())
      .then(setApp)
      .finally(() => setLoading(false));
  }, [id]);

  // Realtime status subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`application:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setApp((prev) => prev ? { ...prev, ...(payload.new as Partial<ApplicationDetail>) } : prev);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  async function triggerSubmit() {
    if (!app?.user_job?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/applications/start/${app.user_job.id}`, { method: "POST" });
      const data = await res.json();
      if (data.status) {
        setApp((prev) => prev ? { ...prev, status: data.status } : prev);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function triggerRegenerate() {
    if (!app?.user_job?.id) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/applications/start/${app.user_job.id}`, { method: "POST" });
      const data = await res.json();
      if (data.status) {
        setApp((prev) => prev ? { ...prev, status: data.status } : prev);
      }
    } finally {
      setRegenerating(false);
    }
  }

  const inProgress = ["tailoring_resume", "writing_cover_letter", "submitting"].includes(app?.status ?? "");
  const hasDocs = !!(app?.resume || app?.cover_letter);

  if (loading) {
    return <div className="text-center text-gray-400 py-20 text-sm">Loading...</div>;
  }

  if (!app) {
    return <div className="text-center text-gray-400 py-20 text-sm">Application not found.</div>;
  }

  const job = app.user_job?.job;
  const meta = STATUS_META[app.status] ?? STATUS_META.draft;
  const Icon = meta.icon;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/applications" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{job?.title ?? "Application"}</h1>
          <p className="text-sm text-gray-400">{job?.company?.name}</p>
        </div>
        {job?.source_url && (
          <a href={job.source_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600">
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3">
        <div className={`flex items-center gap-2 text-sm font-medium ${meta.color}`}>
          {inProgress ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
          {meta.label}
        </div>
        <div className="flex items-center gap-2">
          {/* Regenerate — show for ready_to_submit (with or without docs) and after submission */}
          {(app.status === "ready_to_submit" || app.status === "submitted") && (
            <button
              onClick={triggerRegenerate}
              disabled={regenerating || inProgress}
              title="Re-run AI to generate a new resume & cover letter"
              className="flex items-center gap-1.5 text-xs font-medium border border-gray-300 text-gray-600 px-3 py-1.5 rounded-[6px] hover:bg-gray-50 disabled:opacity-60"
            >
              {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {regenerating ? "Regenerating…" : "Regenerate docs"}
            </button>
          )}
          {/* Submit / retry pipeline */}
          {(app.status === "draft" || app.status === "submit_failed") && (
            <button
              onClick={triggerSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#1A2B4C] px-3 py-1.5 rounded-[6px] hover:bg-[#243660] disabled:opacity-60"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {submitting ? "Starting…" : "Start Pipeline"}
            </button>
          )}
          {/* Docs ready — show local agent command */}
          {app.status === "ready_to_submit" && hasDocs && (
            <button
              onClick={() => setShowAgentCmd((v) => !v)}
              className="text-xs text-blue-600 font-medium hover:underline"
            >
              Run local agent to submit {showAgentCmd ? "▲" : "▼"}
            </button>
          )}
          {app.status === "submitted" && app.confirmation_number && (
            <span className="text-xs text-gray-500">Ref: {app.confirmation_number}</span>
          )}
        </div>
      </div>

      {/* Local agent command panel */}
      {showAgentCmd && app.status === "ready_to_submit" && hasDocs && (
        <div className="bg-slate-900 text-slate-100 rounded-xl p-4 space-y-2 text-xs font-mono">
          <p className="text-slate-400 font-sans font-medium text-[11px] uppercase tracking-wider">Run the local agent on your machine</p>
          <p className="text-slate-300 font-sans text-xs mb-2">The local agent opens a real browser and submits the application on your behalf using Claude computer use.</p>
          <div className="bg-slate-800 rounded-lg px-3 py-2 select-all text-green-400">
            cd apps/api && python -m app.agent.local_runner
          </div>
          <p className="text-slate-500 font-sans text-[11px]">Make sure your <code className="text-slate-300">.env</code> has <code className="text-slate-300">SUPABASE_URL</code>, <code className="text-slate-300">SUPABASE_SERVICE_ROLE_KEY</code>, and <code className="text-slate-300">ANTHROPIC_API_KEY</code> set before running.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {(["resume", "cover_letter", "submission", "timeline"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "text-[#1A2B4C] border-b-2 border-[#1A2B4C] -mb-px"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "resume" && <ResumeTab app={app} onRegenerate={triggerRegenerate} />}
      {tab === "cover_letter" && <CoverLetterTab app={app} onRegenerate={triggerRegenerate} />}
      {tab === "submission" && <SubmissionTab app={app} />}
      {tab === "timeline" && <TimelineTab applicationId={id} />}
    </div>
  );
}

function ResumeTab({ app, onRegenerate }: { app: ApplicationDetail; onRegenerate?: () => void }) {
  const resume = app.resume;
  const userJobId = app.user_job?.id;
  const isGenerating = ["tailoring_resume", "writing_cover_letter"].includes(app.status);

  if (!resume) {
    return (
      <div className="text-center text-gray-400 py-10 text-sm space-y-3">
        {isGenerating ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={20} className="animate-spin text-yellow-500" />
            <p className="text-yellow-600 font-medium">Tailoring your resume with AI…</p>
            <p className="text-xs text-gray-400">This usually takes 30–60 seconds.</p>
          </div>
        ) : (
          <>
            <FileText size={28} className="mx-auto text-gray-300" />
            <p>No resume generated yet.</p>
            {app.status === "ready_to_submit" && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="mx-auto flex items-center gap-1.5 text-xs font-medium border border-[#1A2B4C] text-[#1A2B4C] px-3 py-1.5 rounded-lg hover:bg-blue-50"
              >
                <RefreshCw size={11} /> Regenerate Docs
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  const contact = (resume.content_json as any)?.contact ?? {};
  const rj = resume.content_json as any;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            resume.verification_status === "passed"
              ? "bg-green-50 text-green-700"
              : resume.verification_status === "failed_review"
              ? "bg-amber-50 text-amber-700"
              : "bg-gray-50 text-gray-500"
          }`}>
            {resume.verification_status === "passed" ? "Verified" :
             resume.verification_status === "failed_review" ? "Needs review" : "Pending"}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded-[6px] hover:bg-gray-50"
              title="Re-run AI to get a fresh resume tailored to this job"
            >
              <RefreshCw size={11} /> Regenerate
            </button>
          )}
          {userJobId && (
            <>
              <a
                href={`/api/applications/resume/download/${userJobId}/docx`}
                className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded-[6px] hover:bg-gray-50"
              >
                <Download size={11} /> DOCX
              </a>
              <a
                href={`/api/applications/resume/download/${userJobId}/pdf`}
                className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded-[6px] hover:bg-gray-50"
              >
                <Download size={11} /> PDF
              </a>
            </>
          )}
        </div>
      </div>

      {resume.verification_status === "failed_review" && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1">
          <p className="text-xs font-medium text-amber-700">
            AI flagged potential issues — review before submitting. The resume is still usable; click Regenerate to try for a cleaner pass.
          </p>
          {resume.verification_notes.map((n, i) => (
            <p key={i} className="text-xs text-amber-600">• {n.field}: {n.issue}</p>
          ))}
        </div>
      )}

      {/* Structured resume preview */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-4 text-sm text-gray-800 max-h-[600px] overflow-y-auto">
        {/* Contact header */}
        <div className="text-center space-y-1 pb-3 border-b border-gray-100">
          <p className="text-lg font-bold">{contact.full_name || "—"}</p>
          {(contact.email || contact.phone || contact.location) && (
            <p className="text-xs text-gray-500">
              {[contact.email, contact.phone, contact.location].filter(Boolean).join(" · ")}
            </p>
          )}
          {(contact.linkedin_url || contact.github_url || contact.portfolio_url) && (
            <p className="text-xs text-gray-400">
              {[contact.linkedin_url, contact.github_url, contact.portfolio_url].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {rj?.summary && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Summary</p>
            <p className="text-sm leading-relaxed">{rj.summary}</p>
          </div>
        )}

        {rj?.skills?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Skills</p>
            <p className="text-sm leading-relaxed">{rj.skills.join(", ")}</p>
          </div>
        )}

        {rj?.experience?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Experience</p>
            <div className="space-y-3">
              {rj.experience.map((exp: any, i: number) => (
                <div key={i}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm">{exp.title} — {exp.company}</p>
                    <p className="text-xs text-gray-400 shrink-0">{exp.start_date || ""} – {exp.end_date || "Present"}</p>
                  </div>
                  {exp.bullets?.length > 0 && (
                    <ul className="mt-1 space-y-0.5 ml-4 list-disc">
                      {exp.bullets.map((b: string, j: number) => (
                        <li key={j} className="text-xs text-gray-700 leading-relaxed">{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {rj?.certifications?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Certifications</p>
            <div className="space-y-1">
              {rj.certifications.map((c: any, i: number) => (
                <p key={i} className="text-xs">{c.name}{c.issuer ? ` — ${c.issuer}` : ""}{c.year ? ` (${c.year})` : ""}</p>
              ))}
            </div>
          </div>
        )}

        {rj?.projects?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Projects</p>
            <div className="space-y-2">
              {rj.projects.map((p: any, i: number) => (
                <div key={i}>
                  <p className="text-xs font-semibold">{p.name}{p.technologies?.length ? ` — ${p.technologies.join(", ")}` : ""}</p>
                  {p.description && <p className="text-xs text-gray-600">{p.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {rj?.education?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Education</p>
            <div className="space-y-1">
              {rj.education.map((e: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <p className="text-xs font-semibold">{e.degree} — {e.institution}</p>
                  {e.graduation_year && <p className="text-xs text-gray-400">{e.graduation_year}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CoverLetterTab({ app, onRegenerate }: { app: ApplicationDetail; onRegenerate?: () => void }) {
  const cl = app.cover_letter;
  const isGenerating = ["tailoring_resume", "writing_cover_letter"].includes(app.status);

  if (!cl) {
    return (
      <div className="text-center text-gray-400 py-10 text-sm space-y-3">
        {isGenerating ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={20} className="animate-spin text-yellow-500" />
            <p className="text-yellow-600 font-medium">Writing your cover letter…</p>
            <p className="text-xs text-gray-400">Almost done.</p>
          </div>
        ) : (
          <>
            <Mail size={28} className="mx-auto text-gray-300" />
            <p>No cover letter generated yet.</p>
            {app.status === "ready_to_submit" && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="mx-auto flex items-center gap-1.5 text-xs font-medium border border-[#1A2B4C] text-[#1A2B4C] px-3 py-1.5 rounded-lg hover:bg-blue-50"
              >
                <RefreshCw size={11} /> Regenerate Docs
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  const banned = cl.content_json?.banned_words_found ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{cl.content_json?.word_count ?? 0} words</span>
          {banned.length > 0 && (
            <span className="text-amber-600">Flagged: {banned.join(", ")}</span>
          )}
        </div>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded-[6px] hover:bg-gray-50"
            title="Re-run AI to write a fresh cover letter"
          >
            <RefreshCw size={11} /> Regenerate
          </button>
        )}
      </div>
      <div className="space-y-3">
        {cl.content_json?.paragraphs?.map((p, i) => (
          <p key={i} className="text-sm text-gray-700 leading-relaxed">{p}</p>
        )) ?? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{cl.content_text}</p>
        )}
      </div>
    </div>
  );
}

function SubmissionTab({ app }: { app: ApplicationDetail }) {
  const log = app.submission_log ?? [];
  const responses = app.form_responses ?? {};

  return (
    <div className="space-y-6">
      {app.submitted_at && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-green-700">
          Submitted on {new Date(app.submitted_at).toLocaleString()}
          {app.confirmation_number && ` · Confirmation: ${app.confirmation_number}`}
        </div>
      )}

      {Object.keys(responses).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Form responses</h3>
          <div className="space-y-2">
            {Object.entries(responses).map(([k, v]) => (
              <div key={k} className="flex gap-3 text-sm">
                <span className="text-gray-400 min-w-[140px] truncate">{k}</span>
                <span className="text-gray-700">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Submission log</h3>
          <div className="space-y-1.5">
            {log.map((entry, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs ${entry.ok === false ? "text-red-500" : "text-gray-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.ok === false ? "bg-red-400" : "bg-green-400"}`} />
                <span className="font-mono text-gray-400">{entry.action}</span>
                <span className="truncate">{entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.length === 0 && !app.submitted_at && (
        <p className="text-sm text-gray-400">No submission data yet.</p>
      )}
    </div>
  );
}

interface TimelineEvent {
  id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  occurred_at: string;
  message?: {
    id: string;
    subject: string;
    from_address: string;
    from_name: string;
    received_at: string;
    classification: string;
    body_text: string;
    snippet: string;
  } | null;
  interview?: {
    id: string;
    round_name: string | null;
    scheduled_at: string | null;
    format: string;
    meeting_link: string | null;
    status: string;
  } | null;
}

const EVENT_META: Record<string, { icon: React.ElementType; label: (ev: TimelineEvent) => string; color: string }> = {
  application_created: { icon: FileText, label: () => "Application started", color: "text-gray-400 bg-gray-50" },
  status_changed: {
    icon: Info,
    label: (ev) => {
      const to = (ev.event_data?.to as string) ?? "";
      const labels: Record<string, string> = {
        submitted: "Submitted",
        submitting: "Submission started",
        submit_failed: "Submission failed",
        interview_proposed: "Interview proposed",
        interview_scheduled: "Interview confirmed",
        closed_rejected: "Closed — not selected",
        offer_received: "Offer received",
      };
      return labels[to] ?? `Status → ${to}`;
    },
    color: "text-blue-600 bg-blue-50",
  },
  email_received: {
    icon: Mail,
    label: (ev) => {
      const subj = (ev.message?.subject ?? "Email received");
      return subj.length > 50 ? subj.slice(0, 50) + "…" : subj;
    },
    color: "text-purple-600 bg-purple-50",
  },
  interview_scheduled: { icon: Calendar, label: () => "Interview confirmed", color: "text-green-600 bg-green-50" },
  interview_proposed: { icon: Calendar, label: () => "Interview proposed", color: "text-yellow-600 bg-yellow-50" },
};

function TimelineTab({ applicationId }: { applicationId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingMsg, setViewingMsg] = useState<TimelineEvent["message"] | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${applicationId}/events`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, [applicationId]);

  if (loading) return <div className="text-sm text-gray-400">Loading timeline...</div>;

  if (events.length === 0) {
    return <p className="text-sm text-gray-400">No events recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((ev) => {
        const meta = EVENT_META[ev.event_type] ?? { icon: Info, label: () => ev.event_type, color: "text-gray-400 bg-gray-50" };
        const Icon = meta.icon;
        const label = meta.label(ev);

        return (
          <div key={ev.id} className="flex gap-3">
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${meta.color}`}>
              <Icon size={13} />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-400">
                {new Date(ev.occurred_at).toLocaleString()}
              </p>
              {ev.interview?.scheduled_at && (
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(ev.interview.scheduled_at).toLocaleString()}
                  {ev.interview.meeting_link && (
                    <> · <a href={ev.interview.meeting_link} target="_blank" rel="noopener noreferrer" className="text-[#1A2B4C] underline">Join</a></>
                  )}
                </p>
              )}
              {ev.message && (
                <button
                  onClick={() => setViewingMsg(ev.message!)}
                  className="text-xs text-[#1A2B4C] underline mt-0.5"
                >
                  View email
                </button>
              )}
            </div>
          </div>
        );
      })}

      {viewingMsg && (
        <EmailModal msg={viewingMsg} applicationId={applicationId} onClose={() => setViewingMsg(null)} />
      )}
    </div>
  );
}

function EmailModal({
  msg,
  applicationId,
  onClose,
}: {
  msg: NonNullable<TimelineEvent["message"]>;
  applicationId: string;
  onClose: () => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [selected, setSelected] = useState(msg.classification);

  const CLASSIFICATIONS = [
    "application_ack","interview_request","interview_followup",
    "request_info","rejection","offer","withdrawn","irrelevant","unknown",
  ];

  async function saveCorrection() {
    await fetch(`/api/applications/${applicationId}/messages/${msg.id}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classification: selected }),
    });
    setCorrecting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 truncate pr-4">{msg.subject}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          <div className="text-xs text-gray-400 space-y-0.5">
            <p>From: {msg.from_name} &lt;{msg.from_address}&gt;</p>
            <p>Received: {new Date(msg.received_at).toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
            {msg.body_text || msg.snippet}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-400">
              AI: <span className="font-medium">{msg.classification}</span>
            </span>
            {correcting ? (
              <div className="flex items-center gap-2">
                <select
                  className="text-xs border border-gray-200 rounded px-1.5 py-1"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={saveCorrection} className="text-xs text-white bg-[#1A2B4C] px-2 py-1 rounded">Save</button>
                <button onClick={() => setCorrecting(false)} className="text-xs text-gray-400">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setCorrecting(true)} className="text-xs text-[#1A2B4C] underline">
                Wrong classification
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bookmark,
  Building2,
  MapPin,
  DollarSign,
  Briefcase,
  ExternalLink,
  Play,
  Trash2,
  Loader2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

interface SavedJob {
  id: string; // user_job_id
  score: number;
  match_reasons: string[];
  reviewed_at: string;
  job: {
    id: string;
    title: string;
    location: string | null;
    work_mode: string | null;
    employment_type: string | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_currency: string;
    source_url: string;
    source_platform: string;
    posted_at: string | null;
    description: string;
    company: { name: string; logo_url: string | null; website: string | null } | null;
  } | null;
}

function formatSalary(min: number | null, max: number | null, currency: string) {
  if (!min && !max) return null;
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (min && max) return `${currency} ${fmt(min)} – ${fmt(max)}`;
  if (min) return `${currency} ${fmt(min)}+`;
  return `up to ${currency} ${fmt(max!)}`;
}

export default function SavedPage() {
  const [items, setItems] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/queue/saved")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const approve = useCallback(async (item: SavedJob) => {
    setApplying(item.id);
    try {
      // Mark approved
      await fetch(`/api/queue/${item.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally {
      setApplying(null);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setRemoving(id);
    try {
      await fetch("/api/queue/saved", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setRemoving(null);
    }
  }, []);

  if (loading) {
    return <div className="text-center text-gray-400 py-20 text-sm">Loading saved jobs…</div>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="No saved jobs yet."
        description="Swipe up or tap the bookmark button on any job card to save it for later."
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Saved Jobs</h1>
        <span className="text-sm text-gray-500">{items.length} saved</span>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const job = item.job;
          if (!job) return null;
          const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency ?? "USD");
          const isExpanded = expanded === item.id;
          const postedDate = job.posted_at
            ? new Date(job.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : null;

          return (
            <div
              key={item.id}
              className="border border-gray-100 rounded-xl bg-white hover:border-gray-200 hover:shadow-sm transition-all overflow-hidden"
            >
              {/* Header row */}
              <button
                className="w-full text-left p-4"
                onClick={() => setExpanded(isExpanded ? null : item.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {job.company?.logo_url ? (
                      <img src={job.company.logo_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 size={18} className="text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate capitalize">
                      {job.company?.name ?? "Unknown"}
                    </p>
                    <p className="text-base font-bold text-gray-900 leading-tight mt-0.5">
                      {job.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Match score pill */}
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        item.score >= 75
                          ? "bg-green-50 text-green-700"
                          : item.score >= 50
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {item.score}%
                    </span>
                    {postedDate && (
                      <span className="text-[10px] text-gray-400">{postedDate}</span>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mt-2 ml-13">
                  {job.location && (
                    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      <MapPin size={9} />
                      {job.location}
                    </span>
                  )}
                  {job.work_mode && (
                    <span className="inline-flex items-center gap-1 text-xs bg-[#EEF2FF] text-[#1A2B4C] px-2 py-0.5 rounded-full capitalize">
                      {job.work_mode}
                    </span>
                  )}
                  {job.employment_type && (
                    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      <Briefcase size={9} />
                      {job.employment_type}
                    </span>
                  )}
                  {salary && (
                    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      <DollarSign size={9} />
                      {salary}
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded description */}
              {isExpanded && (
                <div className="px-4 pb-3">
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">
                    {job.description}
                  </p>
                  {item.match_reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.match_reasons.slice(0, 4).map((r, i) => (
                        <span key={i} className="text-xs bg-[#EEF2FF] text-[#1A2B4C] px-2 py-0.5 rounded-full">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action row */}
              <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
                {/* Approve → triggers full pipeline */}
                <button
                  onClick={() => approve(item)}
                  disabled={applying === item.id}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-[#1F7A4D] text-white px-3 py-2 rounded-lg hover:bg-[#196642] disabled:opacity-60 transition-colors"
                >
                  {applying === item.id ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Play size={11} />
                  )}
                  Approve &amp; Apply
                </button>

                {/* View original */}
                <a
                  href={job.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:border-gray-400 transition-colors"
                >
                  <ExternalLink size={11} />
                  View Listing
                </a>

                {/* View & manually apply */}
                <a
                  href={job.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-[#1A2B4C] border border-[#1A2B4C] px-3 py-2 rounded-lg hover:bg-[#1A2B4C] hover:text-white transition-colors"
                >
                  <ExternalLink size={11} />
                  View &amp; Manually Apply
                </a>

                {/* Remove */}
                <button
                  onClick={() => remove(item.id)}
                  disabled={removing === item.id}
                  className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {removing === item.id ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Trash2 size={11} />
                  )}
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Building2, MapPin, DollarSign, Briefcase } from "lucide-react";
import { MatchScoreRing } from "./MatchScoreRing";
import { ActionBar } from "./ActionBar";

interface Company {
  name: string;
  logo_url: string | null;
  website: string | null;
}

interface Job {
  id: string;
  title: string;
  location: string | null;
  work_mode: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  description: string;
  source_url: string;
  source_platform: string;
  posted_at: string | null;
  company: Company | null;
}

export interface QueueItem {
  id: string;
  score: number;
  match_reasons: string[];
  deal_breakers_hit: string[];
  job: Job | null;
}

interface Props {
  item: QueueItem;
  onDecision: (decision: "approve" | "reject" | "save") => void;
  isActive: boolean;
  stackIndex: number;
}

function formatSalary(min: number | null, max: number | null, currency: string): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`;
  if (min) return `${currency} ${fmt(min)}+`;
  return `up to ${currency} ${fmt(max!)}`;
}

export function JobCard({ item, onDecision, isActive, stackIndex }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { job, score, match_reasons } = item;

  if (!job) return null;

  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency ?? "USD");
  const postedDate = job.posted_at
    ? new Date(job.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const translateY = stackIndex * 8;
  const scale = 1 - stackIndex * 0.03;

  return (
    <div
      className="absolute inset-0 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col transition-transform duration-200"
      style={{
        transform: `translateY(${translateY}px) scale(${scale})`,
        zIndex: 10 - stackIndex,
        pointerEvents: isActive ? "auto" : "none",
      }}
    >
      <div className="flex flex-col flex-1 p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {job.company?.logo_url ? (
              <img
                src={job.company.logo_url}
                alt={job.company.name}
                className="w-12 h-12 rounded-xl object-contain border border-gray-100"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <Building2 size={20} className="text-gray-400" />
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900 text-sm">{job.company?.name ?? "Unknown"}</p>
              {job.company?.website && (
                <a
                  href={job.company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-400 hover:underline"
                >
                  {job.company.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
          {postedDate && (
            <span className="text-xs text-gray-400 whitespace-nowrap">{postedDate}</span>
          )}
        </div>

        {/* Title */}
        <h2 className="text-[22px] font-bold text-gray-900 leading-tight mb-3">
          {job.title}
        </h2>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {job.location && (
            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              <MapPin size={11} />
              {job.location}
            </span>
          )}
          {job.work_mode && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#EEF2FF] text-[#1A2B4C] px-2 py-1 rounded-full capitalize">
              {job.work_mode}
            </span>
          )}
          {job.employment_type && (
            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              <Briefcase size={11} />
              {job.employment_type}
            </span>
          )}
          {salary && (
            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              <DollarSign size={11} />
              {salary}
            </span>
          )}
        </div>

        {/* Score ring + reasons */}
        <div className="flex items-center gap-4 mb-4">
          <MatchScoreRing score={score} size={80} />
          <div className="flex flex-wrap gap-1.5">
            {match_reasons.slice(0, 4).map((r, i) => (
              <span
                key={i}
                className="text-xs bg-[#EEF2FF] text-[#1A2B4C] px-2 py-1 rounded-full"
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="text-sm text-gray-600 leading-relaxed">
          <p className={expanded ? "" : "line-clamp-3"}>
            {(job.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
          </p>
          {!expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-[#1A2B4C] text-xs font-medium mt-1 hover:underline"
            >
              Read full description
            </button>
          )}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <a
                href={job.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-[#1A2B4C] text-xs font-medium hover:underline"
              >
                View original posting
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="px-6 pb-6">
        <ActionBar
          onReject={() => onDecision("reject")}
          onSave={() => onDecision("save")}
          onApprove={() => onDecision("approve")}
          disabled={!isActive}
        />
      </div>
    </div>
  );
}

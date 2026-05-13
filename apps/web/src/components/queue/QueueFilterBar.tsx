"use client";

import { useState } from "react";

export type SortOption =
  | "score_desc"
  | "score_asc"
  | "newest"
  | "oldest"
  | "company_az";

export interface QueueFilters {
  sortBy: SortOption;
  minScore: number;
  workModes: string[];
  location: string;
  search: string;
  company: string;
}

export const DEFAULT_FILTERS: QueueFilters = {
  sortBy: "score_desc",
  minScore: 0,
  workModes: [],
  location: "",
  search: "",
  company: "",
};

const WORK_MODES = ["Remote", "Hybrid", "Onsite"];

const SORT_LABELS: Record<SortOption, string> = {
  score_desc: "Score: High → Low",
  score_asc:  "Score: Low → High",
  newest:     "Newest posted",
  oldest:     "Oldest posted",
  company_az: "Company A → Z",
};

function activeCount(f: QueueFilters): number {
  let n = 0;
  if (f.sortBy !== "score_desc") n++;
  if (f.minScore > 0) n++;
  if (f.workModes.length > 0) n++;
  if (f.location) n++;
  if (f.search) n++;
  if (f.company) n++;
  return n;
}

interface Props {
  filters: QueueFilters;
  totalItems: number;
  filteredItems: number;
  onChange: (f: QueueFilters) => void;
}

export function QueueFilterBar({ filters, totalItems, filteredItems, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const count = activeCount(filters);
  const hasActive = count > 0;

  const set = (partial: Partial<QueueFilters>) =>
    onChange({ ...filters, ...partial });

  const toggleWorkMode = (mode: string) => {
    const next = filters.workModes.includes(mode)
      ? filters.workModes.filter((m) => m !== mode)
      : [...filters.workModes, mode];
    set({ workModes: next });
  };

  const clearAll = () => onChange(DEFAULT_FILTERS);

  return (
    <div className="space-y-2">
      {/* Toggle row */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            open || hasActive
              ? "bg-[#1A2B4C] text-white border-[#1A2B4C]"
              : "bg-white text-gray-600 border-gray-200 hover:border-[#1A2B4C] hover:text-[#1A2B4C]"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M10 12h4" />
          </svg>
          Filters & Sort
          {hasActive && (
            <span className="bg-white text-[#1A2B4C] text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
              {count}
            </span>
          )}
        </button>

        {/* Quick sort chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(["score_desc", "newest", "company_az"] as SortOption[]).map((s) => (
            <button
              key={s}
              onClick={() => set({ sortBy: s })}
              className={`whitespace-nowrap text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filters.sortBy === s
                  ? "bg-[#1A2B4C] text-white border-[#1A2B4C]"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              {s === "score_desc" ? "⭐ Top matches" : s === "newest" ? "🕐 Newest" : "🏢 A-Z"}
            </button>
          ))}
        </div>

        {/* Results count */}
        {hasActive && (
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
            {filteredItems} / {totalItems}
          </span>
        )}
      </div>

      {/* Expanded panel */}
      {open && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
          {/* Row 1: Sort + Score */}
          <div className="grid grid-cols-2 gap-4">
            {/* Sort */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Sort by
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) => set({ sortBy: e.target.value as SortOption })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]/20 focus:border-[#1A2B4C]"
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Min score */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Min match score: <span className="text-[#1A2B4C] font-bold">{filters.minScore > 0 ? `${filters.minScore}+` : "Any"}</span>
              </label>
              <input
                type="range"
                min={0}
                max={90}
                step={10}
                value={filters.minScore}
                onChange={(e) => set({ minScore: Number(e.target.value) })}
                className="w-full accent-[#1A2B4C]"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Any</span>
                <span>30</span>
                <span>50</span>
                <span>70</span>
                <span>90+</span>
              </div>
            </div>
          </div>

          {/* Row 2: Work mode */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Work mode
            </label>
            <div className="flex gap-2">
              {WORK_MODES.map((mode) => {
                const active = filters.workModes.includes(mode);
                const icons: Record<string, string> = { Remote: "🏠", Hybrid: "🔀", Onsite: "🏢" };
                return (
                  <button
                    key={mode}
                    onClick={() => toggleWorkMode(mode)}
                    className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      active
                        ? "bg-[#1A2B4C] text-white border-[#1A2B4C]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-[#1A2B4C] hover:text-[#1A2B4C]"
                    }`}
                  >
                    <span>{icons[mode]}</span>
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Text searches */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Job title keyword
              </label>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  placeholder="e.g. Marketing Manager"
                  value={filters.search}
                  onChange={(e) => set({ search: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]/20 focus:border-[#1A2B4C]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Location
              </label>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/>
                </svg>
                <input
                  type="text"
                  placeholder="e.g. Charlotte, Remote"
                  value={filters.location}
                  onChange={(e) => set({ location: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]/20 focus:border-[#1A2B4C]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Company
              </label>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
                <input
                  type="text"
                  placeholder="e.g. Stripe, Google"
                  value={filters.company}
                  onChange={(e) => set({ company: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]/20 focus:border-[#1A2B4C]"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Showing <strong className="text-gray-900">{filteredItems}</strong> of{" "}
              <strong className="text-gray-900">{totalItems}</strong> jobs
            </span>
            {hasActive && (
              <button
                onClick={clearAll}
                className="text-sm text-red-500 hover:text-red-700 font-medium"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardStack } from "@/components/queue/CardStack";
import { UndoToast } from "@/components/queue/UndoToast";
import { QueueItem } from "@/components/queue/JobCard";
import {
  QueueFilterBar,
  QueueFilters,
  DEFAULT_FILTERS,
} from "@/components/queue/QueueFilterBar";

interface UndoState {
  id: string;
  label: string;
}

async function fetchQueue(): Promise<{ items: QueueItem[] }> {
  const url = `/api/queue?status=pending&limit=200`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to fetch queue");
  return r.json();
}

async function fetchStats(): Promise<{ pending: number; auto_approved_today: number; auto_rejected_today: number }> {
  const r = await fetch("/api/queue/stats");
  if (!r.ok) return { pending: 0, auto_approved_today: 0, auto_rejected_today: 0 };
  return r.json();
}

function applyFilters(items: QueueItem[], f: QueueFilters): QueueItem[] {
  let out = items;

  if (f.minScore > 0) {
    out = out.filter((i) => i.score >= f.minScore);
  }
  if (f.workModes.length > 0) {
    out = out.filter((i) => {
      const mode = (i.job?.work_mode ?? "").toLowerCase();
      return f.workModes.some((wm) => mode.includes(wm.toLowerCase()));
    });
  }
  if (f.location) {
    const loc = f.location.toLowerCase();
    out = out.filter((i) =>
      (i.job?.location ?? "").toLowerCase().includes(loc)
    );
  }
  if (f.search) {
    const kw = f.search.toLowerCase();
    out = out.filter((i) =>
      (i.job?.title ?? "").toLowerCase().includes(kw)
    );
  }
  if (f.company) {
    const co = f.company.toLowerCase();
    out = out.filter((i) =>
      ((i.job as any)?.company?.name ?? "").toLowerCase().includes(co)
    );
  }

  // Sort
  out = [...out];
  if (f.sortBy === "score_desc") {
    out.sort((a, b) => b.score - a.score);
  } else if (f.sortBy === "score_asc") {
    out.sort((a, b) => a.score - b.score);
  } else if (f.sortBy === "newest") {
    out.sort(
      (a, b) =>
        new Date(b.job?.posted_at ?? 0).getTime() -
        new Date(a.job?.posted_at ?? 0).getTime()
    );
  } else if (f.sortBy === "oldest") {
    out.sort(
      (a, b) =>
        new Date(a.job?.posted_at ?? 0).getTime() -
        new Date(b.job?.posted_at ?? 0).getTime()
    );
  } else if (f.sortBy === "company_az") {
    out.sort((a, b) =>
      ((a.job as any)?.company?.name ?? "").localeCompare(
        (b.job as any)?.company?.name ?? ""
      )
    );
  }

  return out;
}

export default function QueuePage() {
  // All items loaded from the server
  const [allItems, setAllItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, auto_approved_today: 0, auto_rejected_today: 0 });
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);
  const lastDecisionRef = useRef<{ id: string; prevItem: QueueItem } | null>(null);
  const initialLoaded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, s] = await Promise.all([fetchQueue(), fetchStats()]);
      setAllItems(q.items);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    load();
  }, [load]);

  // Apply filters to get the displayed stack
  const displayedItems = useMemo(
    () => applyFilters(allItems, filters),
    [allItems, filters]
  );

  const handleDecision = useCallback(
    async (id: string, decision: "approve" | "reject" | "save") => {
      const item = allItems.find((i) => i.id === id);
      if (!item) return;

      setAllItems((prev) => prev.filter((i) => i.id !== id));
      lastDecisionRef.current = { id, prevItem: item };

      const labelMap = { approve: "Approved", reject: "Rejected", save: "Saved" };
      setUndo({ id, label: labelMap[decision] });

      try {
        await fetch(`/api/queue/${id}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
      } catch {
        if (lastDecisionRef.current?.id === id) {
          setAllItems((prev) => [item, ...prev]);
        }
      }
    },
    [allItems]
  );

  const handleUndo = useCallback(async () => {
    const last = lastDecisionRef.current;
    if (!last) return;
    setUndo(null);
    try {
      await fetch(`/api/queue/${last.id}/undo`, { method: "POST" });
      setAllItems((prev) => [last.prevItem, ...prev]);
    } catch {
      // ignore
    }
    lastDecisionRef.current = null;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (displayedItems.length === 0) return;
      const top = displayedItems[0];
      if (e.key === "ArrowLeft") handleDecision(top.id, "reject");
      if (e.key === "ArrowRight") handleDecision(top.id, "approve");
      if (e.key === "ArrowUp") { e.preventDefault(); handleDecision(top.id, "save"); }
      if (e.key === "u" || e.key === "U") handleUndo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayedItems, handleDecision, handleUndo]);

  const triggerScout = async () => {
    setTriggering(true);
    setTriggerError(null);
    try {
      const res = await fetch("/api/scout/trigger", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTriggerError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setTimeout(() => load(), 30000);
    } catch {
      setTriggerError("Network error — could not trigger scout.");
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today's matches</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {stats.pending} pending
            {stats.auto_approved_today + stats.auto_rejected_today > 0 &&
              ` · ${stats.auto_approved_today} auto-approved, ${stats.auto_rejected_today} auto-rejected`}
          </p>
        </div>
      </div>

      {/* Filter bar — always shown when items exist */}
      {!loading && allItems.length > 0 && (
        <QueueFilterBar
          filters={filters}
          totalItems={allItems.length}
          filteredItems={displayedItems.length}
          onChange={setFilters}
        />
      )}

      <div className="hidden sm:flex gap-4 text-xs text-gray-400">
        <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">←</kbd> Reject</span>
        <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">→</kbd> Approve</span>
        <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">↑</kbd> Save</span>
        <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">U</kbd> Undo</span>
      </div>

      {loading && allItems.length === 0 ? (
        <div className="text-center text-gray-400 py-20 text-sm">Loading matches...</div>
      ) : displayedItems.length === 0 && allItems.length > 0 ? (
        <div className="text-center space-y-3 py-16">
          <p className="text-gray-500 text-sm">No jobs match your current filters.</p>
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-sm font-medium text-[#1A2B4C] underline"
          >
            Clear filters
          </button>
        </div>
      ) : allItems.length === 0 ? (
        <div className="text-center space-y-4 py-20">
          <p className="text-gray-500 text-sm">
            No more matches for now. Next scout runs at 6:00 AM or 4:00 PM ET.
          </p>
          <button
            onClick={triggerScout}
            disabled={triggering}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#1A2B4C] border border-[#1A2B4C] px-4 py-2 rounded-[8px] hover:bg-[#F7F9FC] disabled:opacity-60"
          >
            {triggering ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Triggering…
              </>
            ) : "Trigger scout now"}
          </button>
          {triggering && (
            <p className="text-xs text-gray-400">Scout is running — matches will appear in ~30 seconds</p>
          )}
          {triggerError && (
            <p className="text-xs text-red-500">{triggerError}</p>
          )}
        </div>
      ) : (
        <CardStack items={displayedItems} onDecision={handleDecision} />
      )}

      {undo && (
        <UndoToast
          message={undo.label}
          onUndo={handleUndo}
          onDismiss={() => setUndo(null)}
        />
      )}
    </div>
  );
}

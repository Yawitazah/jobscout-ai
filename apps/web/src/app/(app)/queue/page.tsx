"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CardStack } from "@/components/queue/CardStack";
import { UndoToast } from "@/components/queue/UndoToast";
import { QueueItem } from "@/components/queue/JobCard";

interface UndoState {
  id: string;
  label: string;
}

async function fetchQueue(cursor?: string): Promise<{ items: QueueItem[]; next_cursor: string | null }> {
  const url = `/api/queue?status=pending&limit=20${cursor ? `&cursor=${cursor}` : ""}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to fetch queue");
  return r.json();
}

async function fetchStats(): Promise<{ pending: number; auto_approved_today: number; auto_rejected_today: number }> {
  const r = await fetch("/api/queue/stats");
  if (!r.ok) return { pending: 0, auto_approved_today: 0, auto_rejected_today: 0 };
  return r.json();
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, auto_approved_today: 0, auto_rejected_today: 0 });
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [triggering, setTriggering] = useState(false);
  const lastDecisionRef = useRef<{ id: string; prevItem: QueueItem } | null>(null);
  const initialLoaded = useRef(false);

  const load = useCallback(async (reset = false, existingCursor?: string | null) => {
    setLoading(true);
    try {
      const c = reset ? undefined : (existingCursor ?? undefined);
      const [q, s] = await Promise.all([fetchQueue(c), fetchStats()]);
      setItems((prev) => (reset ? q.items : [...prev, ...q.items]));
      setCursor(q.next_cursor);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    load(true);
  }, [load]);

  const handleDecision = useCallback(
    async (id: string, decision: "approve" | "reject" | "save") => {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      setItems((prev) => prev.filter((i) => i.id !== id));
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
          setItems((prev) => [item, ...prev]);
        }
      }
    },
    [items]
  );

  const handleUndo = useCallback(async () => {
    const last = lastDecisionRef.current;
    if (!last) return;
    setUndo(null);
    try {
      await fetch(`/api/queue/${last.id}/undo`, { method: "POST" });
      setItems((prev) => [last.prevItem, ...prev]);
    } catch {
      // ignore
    }
    lastDecisionRef.current = null;
  }, []);

  // Prefetch when 5 cards remain
  useEffect(() => {
    if (items.length > 0 && items.length <= 5 && cursor && !loading) {
      load(false, cursor);
    }
  }, [items.length, cursor, loading, load]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (items.length === 0) return;
      const top = items[0];
      if (e.key === "ArrowLeft") handleDecision(top.id, "reject");
      if (e.key === "ArrowRight") handleDecision(top.id, "approve");
      if (e.key === "ArrowUp") { e.preventDefault(); handleDecision(top.id, "save"); }
      if (e.key === "u" || e.key === "U") handleUndo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, handleDecision, handleUndo]);

  const triggerScout = async () => {
    setTriggering(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (apiUrl) {
        await fetch(`${apiUrl}/api/admin/scout/trigger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      }
      setTimeout(() => load(true), 3000);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-20">
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

      <div className="hidden sm:flex gap-4 text-xs text-gray-400">
        <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">←</kbd> Reject</span>
        <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">→</kbd> Approve</span>
        <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">↑</kbd> Save</span>
        <span><kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">U</kbd> Undo</span>
      </div>

      {loading && items.length === 0 ? (
        <div className="text-center text-gray-400 py-20 text-sm">Loading matches...</div>
      ) : items.length === 0 ? (
        <div className="text-center space-y-4 py-20">
          <p className="text-gray-500 text-sm">
            No more matches for now. Next scout runs at 6:00 AM or 4:00 PM ET.
          </p>
          <button
            onClick={triggerScout}
            disabled={triggering}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#1A2B4C] border border-[#1A2B4C] px-4 py-2 rounded-[8px] hover:bg-[#F7F9FC] disabled:opacity-60"
          >
            {triggering ? "Triggering..." : "Trigger scout now"}
          </button>
        </div>
      ) : (
        <CardStack items={items} onDecision={handleDecision} />
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

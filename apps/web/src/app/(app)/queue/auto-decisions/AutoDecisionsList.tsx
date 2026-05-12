"use client";

import { useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";

interface Item {
  id: string;
  score: number;
  status: string;
  decision_source: string;
  scored_at: string;
  reviewed_at: string | null;
  job: {
    id: string;
    title: string;
    source_url: string;
    company: { name: string } | null;
  } | null;
}

export function AutoDecisionsList({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial);
  const [overriding, setOverriding] = useState<string | null>(null);

  async function override(id: string) {
    setOverriding(id);
    try {
      await fetch(`/api/queue/${id}/undo`, { method: "POST" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setOverriding(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400">No auto-decisions in the last 24 hours.</p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-4 border border-gray-100 rounded-xl p-4"
        >
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              item.status === "approved"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {item.status === "approved" ? <Check size={14} /> : <X size={14} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {item.job?.title ?? "Unknown role"}
            </p>
            <p className="text-xs text-gray-400">
              {item.job?.company?.name} · Score {item.score} · Auto-{item.status}
            </p>
          </div>
          <button
            onClick={() => override(item.id)}
            disabled={overriding === item.id}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-[#1A2B4C] border border-[#1A2B4C] px-2.5 py-1.5 rounded-[6px] hover:bg-[#F7F9FC] disabled:opacity-60"
          >
            <RotateCcw size={12} />
            Override
          </button>
        </div>
      ))}
    </div>
  );
}

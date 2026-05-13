"use client";

import { Bookmark, Check, X } from "lucide-react";
import { useState } from "react";

interface Props {
  onReject: () => void;
  onSave: () => void;
  onApprove: () => void;
  disabled?: boolean;
}

type Action = "reject" | "save" | "approve";

const BASE =
  "relative flex items-center justify-center rounded-full border-2 transition-all duration-150 active:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer";

export function ActionBar({ onReject, onSave, onApprove, disabled }: Props) {
  const [burst, setBurst] = useState<Action | null>(null);

  const trigger = (action: Action, handler: () => void) => {
    if (disabled) return;
    setBurst(action);
    handler();
    setTimeout(() => setBurst(null), 400);
  };

  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      {/* ── REJECT ── */}
      <button
        onClick={() => trigger("reject", onReject)}
        disabled={disabled}
        aria-label="Reject"
        className={`${BASE} w-16 h-16 border-[#A52A2A] text-[#A52A2A] hover:bg-[#A52A2A] hover:text-white hover:shadow-lg hover:shadow-red-100 focus-visible:ring-[#A52A2A] ${
          burst === "reject" ? "bg-[#A52A2A] text-white scale-110 shadow-lg shadow-red-200" : ""
        }`}
      >
        <X size={26} strokeWidth={2.5} />
        {burst === "reject" && <Ripple color="rgba(165,42,42,0.25)" />}
      </button>

      {/* ── SAVE ── */}
      <button
        onClick={() => trigger("save", onSave)}
        disabled={disabled}
        aria-label="Save for later"
        className={`${BASE} w-14 h-14 border-gray-300 text-gray-400 hover:border-[#1A2B4C] hover:text-[#1A2B4C] hover:shadow-md focus-visible:ring-[#1A2B4C] ${
          burst === "save" ? "border-[#1A2B4C] text-[#1A2B4C] scale-110 shadow-md" : ""
        }`}
      >
        <Bookmark size={22} strokeWidth={2} />
        {burst === "save" && <Ripple color="rgba(26,43,76,0.15)" />}
      </button>

      {/* ── APPROVE ── */}
      <button
        onClick={() => trigger("approve", onApprove)}
        disabled={disabled}
        aria-label="Approve"
        className={`${BASE} w-16 h-16 border-[#1F7A4D] text-[#1F7A4D] hover:bg-[#1F7A4D] hover:text-white hover:shadow-lg hover:shadow-green-100 focus-visible:ring-[#1F7A4D] ${
          burst === "approve" ? "bg-[#1F7A4D] text-white scale-110 shadow-lg shadow-green-200" : ""
        }`}
      >
        <Check size={26} strokeWidth={2.5} />
        {burst === "approve" && <Ripple color="rgba(31,122,77,0.25)" />}
      </button>
    </div>
  );
}

/** Expanding ripple ring that appears on action tap */
function Ripple({ color }: { color: string }) {
  return (
    <span
      className="absolute inset-0 rounded-full animate-ping"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

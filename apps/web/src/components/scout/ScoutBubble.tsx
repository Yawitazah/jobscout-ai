"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ScoutShell } from "./ScoutShell";

function ScoutIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="white" />
      <path d="M8 12.5c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="#1A2B4C" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="14.5" r="1.5" fill="#1A2B4C" />
    </svg>
  );
}

export function ScoutBubble() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Don't show the floating bubble on the Scout page itself — it's redundant
  // (you're already in Scout) and overlaps the chat send button.
  if (pathname === "/scout" || pathname.startsWith("/scout/")) return null;

  return (
    <>
      {/* Floating button — lifted above the mobile bottom tab bar (h-16). */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 w-14 h-14 rounded-full bg-[#1A2B4C] shadow-lg hover:bg-[#243d6b] transition-all flex items-center justify-center group"
        title="Open Scout"
        aria-label="Open Scout job search agent"
      >
        <ScoutIcon />
        <span className="absolute -top-8 right-0 bg-gray-900 text-white text-xs rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Scout
        </span>
      </button>

      {/* Full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <ScoutShell onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

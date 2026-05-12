"use client";

import { useEffect } from "react";

interface Props {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ message, onUndo, onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-6 z-50 flex items-center gap-3 bg-[#1A2B4C] text-white px-4 py-3 rounded-[8px] shadow-lg text-sm">
      <span>{message}</span>
      <button
        onClick={onUndo}
        className="font-semibold underline hover:no-underline focus-visible:outline-none"
      >
        Undo
      </button>
    </div>
  );
}

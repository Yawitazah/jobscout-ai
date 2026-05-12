"use client";

import { Bookmark, Check, X } from "lucide-react";

interface Props {
  onReject: () => void;
  onSave: () => void;
  onApprove: () => void;
  disabled?: boolean;
}

export function ActionBar({ onReject, onSave, onApprove, disabled }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      <button
        onClick={onReject}
        disabled={disabled}
        aria-label="Reject"
        className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-[#A52A2A] text-[#A52A2A] hover:bg-[#A52A2A] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <X size={24} />
      </button>
      <button
        onClick={onSave}
        disabled={disabled}
        aria-label="Save"
        className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-gray-400 text-gray-500 hover:border-[#1A2B4C] hover:text-[#1A2B4C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Bookmark size={24} />
      </button>
      <button
        onClick={onApprove}
        disabled={disabled}
        aria-label="Approve"
        className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-[#1F7A4D] text-[#1F7A4D] hover:bg-[#1F7A4D] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Check size={24} />
      </button>
    </div>
  );
}

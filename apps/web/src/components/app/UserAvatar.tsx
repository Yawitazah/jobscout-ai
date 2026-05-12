"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Settings, LogOut } from "lucide-react";
import { useUser, getInitials } from "./UserContext";

export function UserAvatar() {
  const { user } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fullName = user.user_metadata?.full_name as string | undefined;
  const initials = getInitials(fullName);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className="w-9 h-9 rounded-full bg-[#1A2B4C] text-white text-sm font-semibold flex items-center justify-center hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/50 focus-visible:ring-offset-1 cursor-pointer"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-44 bg-white border border-[#E1E6EE] rounded-[8px] shadow-lg py-1 z-50"
        >
          <div className="px-3 py-2 border-b border-[#E1E6EE]">
            <p className="text-xs font-medium text-[#1A1A1A] truncate">
              {fullName ?? user.email}
            </p>
            {fullName && (
              <p className="text-xs text-[#5A6478] truncate">{user.email}</p>
            )}
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F7F9FC] transition-colors"
          >
            <User size={15} className="text-[#5A6478]" />
            Profile
          </Link>

          <Link
            href="/preferences"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F7F9FC] transition-colors"
          >
            <Settings size={15} className="text-[#5A6478]" />
            Preferences
          </Link>

          <div className="border-t border-[#E1E6EE] mt-1 pt-1">
            <button
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#A52A2A] hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

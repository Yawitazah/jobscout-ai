"use client";

import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

interface UserContextValue {
  user: User;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  return (
    <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}

export function getInitials(fullName: string | undefined | null): string {
  if (!fullName?.trim()) return "?";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getFirstName(fullName: string | undefined | null): string {
  if (!fullName?.trim()) return "";
  return fullName.trim().split(/\s+/)[0];
}

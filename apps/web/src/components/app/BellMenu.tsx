"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  priority: string;
  read_at: string | null;
  created_at: string;
}

export function BellMenu({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function fetchNotifications() {
    const r = await fetch("/api/notifications");
    if (r.ok) {
      const data = await r.json();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread_count ?? 0);
    }
  }

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Realtime unread count
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-bell")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", id }),
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    setUnread((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-lg text-[#5A6478] hover:text-[#1A1A1A] hover:bg-[#F7F9FC] transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-[#1A2B4C] hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 ${!n.read_at ? "bg-blue-50/40" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-300">{new Date(n.created_at).toLocaleString()}</span>
                        {n.action_url && (
                          <Link href={n.action_url} onClick={() => { markRead(n.id); setOpen(false); }} className="text-xs text-[#1A2B4C] underline">
                            View
                          </Link>
                        )}
                        {!n.read_at && (
                          <button onClick={() => markRead(n.id)} className="text-xs text-gray-400 hover:text-gray-600">
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-50 px-4 py-2">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs text-[#1A2B4C] hover:underline">
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", id }),
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  }

  if (loading) return <div className="text-sm text-gray-400 py-20 text-center">Loading...</div>;

  if (notifications.length === 0) {
    return <EmptyState icon={Bell} title="No notifications yet." description="Important updates will appear here." />;
  }

  const PRIORITY_COLOR: Record<string, string> = {
    urgent: "border-l-4 border-red-400",
    high: "border-l-4 border-orange-300",
    normal: "",
    low: "",
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <Link href="/settings/notifications" className="text-xs text-[#1A2B4C] underline">Settings</Link>
      </div>

      {notifications.map((n) => (
        <div
          key={n.id}
          className={`border border-gray-100 rounded-xl p-4 ${PRIORITY_COLOR[n.priority] ?? ""} ${!n.read_at ? "bg-blue-50/30" : ""}`}
        >
          <div className="flex items-start gap-3">
            {!n.read_at && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{n.title}</p>
              {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs text-gray-300">{new Date(n.created_at).toLocaleString()}</span>
                {n.action_url && (
                  <Link href={n.action_url} onClick={() => markRead(n.id)} className="text-xs text-[#1A2B4C] underline">
                    View
                  </Link>
                )}
                {!n.read_at && (
                  <button onClick={() => markRead(n.id)} className="text-xs text-gray-400 hover:text-gray-600">
                    Mark read
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

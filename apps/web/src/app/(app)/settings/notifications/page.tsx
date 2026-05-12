"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

interface Prefs {
  email_enabled: boolean;
  email_digest_time: string;
  email_timezone: string;
  push_enabled: boolean;
}

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>({
    email_enabled: true,
    email_digest_time: "08:00",
    email_timezone: "America/New_York",
    push_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((d) => {
        setPrefs({
          email_enabled: d.email_enabled ?? true,
          email_digest_time: d.email_digest_time ?? "08:00",
          email_timezone: d.email_timezone ?? "America/New_York",
          push_enabled: d.push_enabled ?? false,
        });
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div className="text-sm text-gray-400">Loading...</div>;

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification preferences</h1>
        <p className="text-sm text-gray-400 mt-1">Control how and when JobScout AI notifies you.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email digest</h2>

        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Email digest</p>
            <p className="text-xs text-gray-400">Daily summary of updates and new matches.</p>
          </div>
          <Toggle value={prefs.email_enabled} onChange={(v) => setPrefs((p) => ({ ...p, email_enabled: v }))} />
        </label>

        {prefs.email_enabled && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Delivery time</label>
              <input
                type="time"
                value={prefs.email_digest_time}
                onChange={(e) => setPrefs((p) => ({ ...p, email_digest_time: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Timezone</label>
              <select
                value={prefs.email_timezone}
                onChange={(e) => setPrefs((p) => ({ ...p, email_timezone: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
              >
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Push notifications</h2>
        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Browser push notifications</p>
            <p className="text-xs text-gray-400">Instant alerts for interview requests and offers.</p>
          </div>
          <Toggle value={prefs.push_enabled} onChange={(v) => setPrefs((p) => ({ ...p, push_enabled: v }))} />
        </label>
      </section>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 text-sm font-medium text-white bg-[#1A2B4C] px-4 py-2 rounded-[8px] hover:bg-[#243660] disabled:opacity-60"
      >
        <Save size={14} />
        {saving ? "Saving..." : saved ? "Saved!" : "Save preferences"}
      </button>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${value ? "bg-[#1A2B4C]" : "bg-gray-200"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

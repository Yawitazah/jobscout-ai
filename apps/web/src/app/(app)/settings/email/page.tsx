"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle, AlertCircle, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface EmailConnection {
  id: string;
  email_address: string;
  provider: string;
  last_synced_at: string | null;
  is_active: boolean;
}

export default function EmailSettingsPage() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected") === "true";
  const error = searchParams.get("error");

  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("email_connections")
      .select("id, email_address, provider, last_synced_at, is_active")
      .eq("is_active", true)
      .then(({ data }) => {
        setConnections(data ?? []);
        setLoading(false);
      });
  }, []);

  async function disconnect(id: string) {
    setDisconnecting(id);
    await fetch("/api/auth/gmail/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection_id: id }),
    });
    setConnections((prev) => prev.filter((c) => c.id !== id));
    setDisconnecting(null);
  }

  const activeConnections = connections.filter((c) => c.is_active);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email integration</h1>
        <p className="text-sm text-gray-400 mt-1">
          Connect your inbox to automatically track recruiter replies.
        </p>
      </div>

      {connected && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} />
          Gmail connected successfully.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {errorMessage(error)}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : activeConnections.length === 0 ? (
        <div className="border border-gray-100 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F7F9FC] rounded-full flex items-center justify-center">
              <Mail size={20} className="text-[#1A2B4C]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Connect your email</p>
              <p className="text-xs text-gray-400">
                We detect updates about your applications. We never send or modify emails.
              </p>
            </div>
          </div>
          <a
            href="/api/auth/gmail"
            className="inline-flex items-center gap-2 text-sm font-medium text-white bg-[#1A2B4C] px-4 py-2 rounded-[8px] hover:bg-[#243660]"
          >
            Connect Gmail
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {activeConnections.map((conn) => (
            <div key={conn.id} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center">
                    <CheckCircle size={16} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{conn.email_address}</p>
                    <p className="text-xs text-gray-400">
                      {conn.last_synced_at
                        ? `Last synced ${new Date(conn.last_synced_at).toLocaleString()}`
                        : "Not yet synced"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => disconnect(conn.id)}
                  disabled={disconnecting === conn.id}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2.5 py-1.5 rounded-[6px] disabled:opacity-50"
                >
                  {disconnecting === conn.id ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            </div>
          ))}
          <a
            href="/api/auth/gmail"
            className="inline-flex items-center gap-2 text-sm text-[#1A2B4C] border border-[#1A2B4C] px-3 py-2 rounded-[8px] hover:bg-[#F7F9FC]"
          >
            <Mail size={14} /> Connect another account
          </a>
        </div>
      )}

      <div className="flex items-start gap-2 bg-gray-50 rounded-xl p-4 text-xs text-gray-500">
        <Shield size={14} className="flex-shrink-0 mt-0.5" />
        <p>
          We request <strong>read-only</strong> access. JobScout AI reads emails to detect updates
          about your applications. We never send, delete, or modify any messages. Tokens are
          encrypted at rest using AES-256-GCM.
        </p>
      </div>
    </div>
  );
}

function errorMessage(code: string): string {
  const msgs: Record<string, string> = {
    denied: "You declined Gmail access. Connect whenever you're ready.",
    invalid: "Something went wrong during the OAuth flow.",
    state_mismatch: "OAuth state mismatch. Please try again.",
    token_exchange: "Failed to exchange OAuth code. Please try again.",
    userinfo: "Could not fetch your Gmail address. Please try again.",
    db: "Could not save your connection. Please try again.",
  };
  return msgs[code] ?? "An unknown error occurred.";
}

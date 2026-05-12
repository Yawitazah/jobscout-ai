"use client";

import { useState } from "react";
import { Link, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Status = "idle" | "loading" | "success" | "error";

interface UrlIngestionProps {
  onSuccess?: (fields: string[]) => void;
}

export function UrlIngestion({ onSuccess }: UrlIngestionProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/profile/ingest-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Failed to import profile");
        return;
      }
      setStatus("success");
      setMessage(`Imported ${data.fields_updated?.length ?? 0} field(s) from your profile`);
      onSuccess?.(data.fields_updated ?? []);
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Import from LinkedIn or GitHub
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="url"
            placeholder="https://linkedin.com/in/yourname"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={status === "loading" || !url.trim()}>
          {status === "loading" ? "Importing…" : "Import"}
        </Button>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            status === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}
        >
          {status === "error" ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          )}
          {message}
        </div>
      )}
    </form>
  );
}

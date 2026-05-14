"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, ExternalLink } from "lucide-react";

export default function ImportJobPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    application_id: string;
    title: string;
    company: string;
    platform: string;
    status: string;
  } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/jobs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim() || undefined,
          company: company.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }
      setResult(data);
      setUrl("");
      setTitle("");
      setCompany("");
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link2 size={22} className="text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900">Import job by URL</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-2">
        Paste a job posting URL and the agent will pick it up on its next poll.
        Title and company auto-detect from the page; override only if needed.
      </p>

      <form onSubmit={submit} className="space-y-4 bg-white border border-gray-100 rounded-xl p-5">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Job URL *</label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://boards.greenhouse.io/company/jobs/12345"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1A2B4C]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Job title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-detect"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1A2B4C]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Company (optional)</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Auto-detect"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1A2B4C]"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="inline-flex items-center gap-2 text-sm font-medium bg-[#1A2B4C] text-white px-4 py-2 rounded-lg hover:bg-[#243b63] disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Importing…
            </>
          ) : (
            <>
              <Link2 size={14} /> Import
            </>
          )}
        </button>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">⚠ {error}</p>
        )}
      </form>

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-2">
          <p className="text-sm font-semibold text-emerald-900">Created application</p>
          <dl className="text-xs text-emerald-900 space-y-0.5">
            <div className="flex gap-2">
              <dt className="w-20 font-medium text-emerald-700">Title:</dt>
              <dd>{result.title}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 font-medium text-emerald-700">Company:</dt>
              <dd>{result.company}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 font-medium text-emerald-700">Platform:</dt>
              <dd>{result.platform}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 font-medium text-emerald-700">Status:</dt>
              <dd>{result.status}</dd>
            </div>
          </dl>
          <p className="text-xs text-emerald-800 mt-2">
            The agent will pick this up on its next 30-second poll.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => router.push(`/applications/${result.application_id}`)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-700 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-800"
            >
              <ExternalLink size={11} /> View application
            </button>
            <button
              type="button"
              onClick={() => router.push("/applications")}
              className="text-xs font-medium text-emerald-700 hover:underline px-2 py-1.5"
            >
              Back to applications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

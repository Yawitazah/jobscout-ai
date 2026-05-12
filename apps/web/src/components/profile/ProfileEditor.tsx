"use client";

import { useState } from "react";
import { ResumeUpload } from "./ResumeUpload";
import { UrlIngestion } from "./UrlIngestion";
import { ClarifyingQuestions } from "./ClarifyingQuestions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
}

interface ExperienceEntry {
  title: string;
  company: string;
  start_date: string | null;
  end_date: string | null;
  description: string;
}

interface EducationEntry {
  degree: string;
  institution: string;
  graduation_year: string | null;
}

interface ResumeUploadRecord {
  id: string;
  created_at: string;
  status: string;
  original_filename: string | null;
  mime_type: string | null;
}

interface Props {
  initial: Profile;
  uploads?: ResumeUploadRecord[];
}

type Tab = "profile" | "resume" | "import";

const STATUS_STYLES: Record<string, string> = {
  processed: "bg-green-100 text-green-700",
  processing: "bg-yellow-100 text-yellow-700",
  uploaded: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProfileEditor({ initial, uploads = [] }: Props) {
  const [tab, setTab] = useState<Tab>("resume");
  const [profile, setProfile] = useState<Profile>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [questions, setQuestions] = useState<{ id: string; question: string; hint: string }[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Live list of uploads — starts with server-fetched, updated after new upload
  const [uploadList, setUploadList] = useState<ResumeUploadRecord[]>(uploads);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteUpload(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/upload/resume/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUploadList((prev) => prev.filter((u) => u.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleResumeSuccess(uploadId: string) {
    setQuestionsLoading(true);
    setIngestError(null);
    try {
      const res = await fetch("/api/profile/ingest-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: uploadId }),
      });
      const data = await res.json();
      if (res.ok) {
        // Merge AI-parsed fields into the form
        if (data.profile) {
          setProfile((prev) => ({
            ...prev,
            full_name: data.profile.full_name ?? prev.full_name,
            location: data.profile.location ?? prev.location,
            phone: data.profile.phone ?? prev.phone,
            summary: data.profile.summary ?? prev.summary,
            skills: data.profile.skills?.length ? data.profile.skills : prev.skills,
            experience: data.profile.experience?.length ? data.profile.experience : prev.experience,
            education: data.profile.education?.length ? data.profile.education : prev.education,
          }));
        }
        setQuestions(data.questions ?? []);
        // Mark this upload as processed in the local list
        setUploadList((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: "processed" } : u))
        );
        setTab("profile");
      } else {
        setIngestError(data.error ?? `Failed to analyse resume (${res.status})`);
        // Mark failed
        setUploadList((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: "failed" } : u))
        );
      }
    } catch (err) {
      setIngestError("Network error — could not analyse resume.");
      console.error(err);
    } finally {
      setQuestionsLoading(false);
    }
  }

  // Called by ResumeUpload immediately after the file is stored (before AI parse)
  async function handleUploadRecorded(uploadId: string, filename: string, mimeType: string) {
    const newRecord: ResumeUploadRecord = {
      id: uploadId,
      created_at: new Date().toISOString(),
      status: "processing",
      original_filename: filename,
      mime_type: mimeType,
    };
    setUploadList((prev) => [newRecord, ...prev]);
    await handleResumeSuccess(uploadId);
  }

  async function handleClarifySubmit(answers: Record<string, string>) {
    const summaryAddition = Object.values(answers).filter(Boolean).join(". ");
    if (summaryAddition) {
      setProfile((p) => ({
        ...p,
        summary: p.summary ? `${p.summary}\n${summaryAddition}` : summaryAddition,
      }));
    }
    setQuestions([]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "resume", label: "Upload Resume" },
    { id: "import", label: "Import URL" },
    { id: "profile", label: "Edit Profile" },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          Build your profile so JobScout can find the best matches.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#1A2B4C] text-[#1A2B4C]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {ingestError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <strong>Resume analysis failed:</strong> {ingestError}
        </div>
      )}

      {tab === "resume" && (
        <div className="space-y-6">
          <ResumeUpload onSuccess={handleUploadRecorded} />

          {questionsLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4 text-[#1A2B4C]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analysing resume with AI…
            </div>
          )}

          {questions.length > 0 && (
            <ClarifyingQuestions questions={questions} onSubmit={handleClarifySubmit} />
          )}

          {/* Resume upload history */}
          {uploadList.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Previously uploaded resumes</h3>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                {uploadList.map((u) => (
                  <div key={u.id} className="flex items-center justify-between px-4 py-3 bg-white">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* File icon */}
                      <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {u.original_filename ?? "Resume"}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(u.created_at)}</p>
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-3 shrink-0">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_STYLES[u.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {u.status}
                      </span>
                      <button
                        onClick={() => handleDeleteUpload(u.id)}
                        disabled={deletingId === u.id}
                        className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                        title="Delete upload"
                      >
                        {deletingId === u.id ? (
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "import" && (
        <UrlIngestion
          onSuccess={() => {
            setTab("profile");
          }}
        />
      )}

      {tab === "profile" && (
        <div className="space-y-6">
          {/* Basic info */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Basic info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Full name</label>
                <Input
                  value={profile.full_name ?? ""}
                  onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Location</label>
                <Input
                  value={profile.location ?? ""}
                  onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))}
                  placeholder="San Francisco, CA"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <Input
                  value={profile.phone ?? ""}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Professional summary</label>
              <textarea
                value={profile.summary ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))}
                rows={4}
                placeholder="Brief overview of your background and career goals…"
                className="w-full rounded-[8px] border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]/30 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Skills{" "}
                <span className="font-normal text-gray-400">(comma-separated)</span>
              </label>
              <Input
                value={(profile.skills ?? []).join(", ")}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="React, TypeScript, Node.js"
              />
            </div>
          </div>

          {/* Experience */}
          {(profile.experience ?? []).length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Experience</h2>
              <div className="space-y-3">
                {(profile.experience ?? []).map((exp, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{exp.title}</p>
                        <p className="text-sm text-gray-600">{exp.company}</p>
                      </div>
                      <p className="text-xs text-gray-400 shrink-0">
                        {exp.start_date ?? "?"} – {exp.end_date ?? "Present"}
                      </p>
                    </div>
                    {exp.description && (
                      <p className="text-sm text-gray-600">{exp.description}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Experience is extracted from your resume — re-upload to update.
              </p>
            </div>
          )}

          {/* Education */}
          {(profile.education ?? []).length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Education</h2>
              <div className="space-y-2">
                {(profile.education ?? []).map((edu, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="font-medium text-gray-900 text-sm">{edu.degree}</p>
                    <p className="text-sm text-gray-600">
                      {edu.institution}
                      {edu.graduation_year ? ` · ${edu.graduation_year}` : ""}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Education is extracted from your resume — re-upload to update.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} loading={saving}>
              {saved ? "Saved!" : "Save profile"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

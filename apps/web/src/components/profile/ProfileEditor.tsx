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

const BLANK_EXP: ExperienceEntry = {
  title: "",
  company: "",
  start_date: null,
  end_date: null,
  description: "",
};

const BLANK_EDU: EducationEntry = {
  degree: "",
  institution: "",
  graduation_year: null,
};

// ─── Small field wrapper ─────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

// ─── Experience card (view + inline edit) ────────────────────────────────────
function ExperienceCard({
  entry,
  onSave,
  onDelete,
}: {
  entry: ExperienceEntry;
  onSave: (updated: ExperienceEntry) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExperienceEntry>(entry);

  if (!editing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-1 group">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 text-sm truncate">{entry.title || "Untitled role"}</p>
            <p className="text-sm text-gray-600 truncate">{entry.company}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => { setDraft(entry); setEditing(true); }}
              className="p-1 text-gray-400 hover:text-[#1A2B4C] rounded"
              title="Edit"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-1.414.944l-3.414.586.586-3.414A4 4 0 019 12.414V13z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1 text-gray-400 hover:text-red-500 rounded"
              title="Delete"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
        {(entry.start_date || entry.end_date) && (
          <p className="text-xs text-gray-400">
            {entry.start_date ?? "?"} – {entry.end_date ?? "Present"}
          </p>
        )}
        {entry.description && <p className="text-sm text-gray-600 mt-1">{entry.description}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#1A2B4C]/30 bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Job title">
          <Input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Software Engineer"
          />
        </Field>
        <Field label="Company">
          <Input
            value={draft.company}
            onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}
            placeholder="Acme Corp"
          />
        </Field>
        <Field label="Start (YYYY-MM)">
          <Input
            value={draft.start_date ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value || null }))}
            placeholder="2022-03"
          />
        </Field>
        <Field label="End (YYYY-MM or leave blank)">
          <Input
            value={draft.end_date ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value || null }))}
            placeholder="Present"
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          rows={2}
          placeholder="What you did and achieved…"
          className="w-full rounded-[8px] border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]/30 resize-none"
        />
      </Field>
      <div className="flex gap-2">
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          className="text-xs font-medium bg-[#1A2B4C] text-white px-3 py-1.5 rounded-[6px] hover:bg-[#243d6b]"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-[6px] hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Education card (view + inline edit) ─────────────────────────────────────
function EducationCard({
  entry,
  onSave,
  onDelete,
}: {
  entry: EducationEntry;
  onSave: (updated: EducationEntry) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EducationEntry>(entry);

  if (!editing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 group">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 text-sm truncate">{entry.degree || "Degree"}</p>
            <p className="text-sm text-gray-600 truncate">
              {entry.institution}{entry.graduation_year ? ` · ${entry.graduation_year}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => { setDraft(entry); setEditing(true); }}
              className="p-1 text-gray-400 hover:text-[#1A2B4C] rounded"
              title="Edit"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-1.414.944l-3.414.586.586-3.414A4 4 0 019 12.414V13z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1 text-gray-400 hover:text-red-500 rounded"
              title="Delete"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#1A2B4C]/30 bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Degree / certification">
          <Input
            value={draft.degree}
            onChange={(e) => setDraft((d) => ({ ...d, degree: e.target.value }))}
            placeholder="B.S. Computer Science"
          />
        </Field>
        <Field label="Institution">
          <Input
            value={draft.institution}
            onChange={(e) => setDraft((d) => ({ ...d, institution: e.target.value }))}
            placeholder="State University"
          />
        </Field>
        <Field label="Graduation year">
          <Input
            value={draft.graduation_year ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, graduation_year: e.target.value || null }))}
            placeholder="2021"
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          className="text-xs font-medium bg-[#1A2B4C] text-white px-3 py-1.5 rounded-[6px] hover:bg-[#243d6b]"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-[6px] hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────
export function ProfileEditor({ initial, uploads = [] }: Props) {
  const [tab, setTab] = useState<Tab>("resume");
  const [profile, setProfile] = useState<Profile>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [questions, setQuestions] = useState<{ id: string; question: string; hint: string }[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const [uploadList, setUploadList] = useState<ResumeUploadRecord[]>(uploads);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Experience helpers ──
  const updateExp = (i: number, updated: ExperienceEntry) =>
    setProfile((p) => {
      const arr = [...p.experience];
      arr[i] = updated;
      return { ...p, experience: arr };
    });

  const deleteExp = (i: number) =>
    setProfile((p) => ({ ...p, experience: p.experience.filter((_, idx) => idx !== i) }));

  const addExp = () =>
    setProfile((p) => ({ ...p, experience: [...p.experience, { ...BLANK_EXP }] }));

  // ── Education helpers ──
  const updateEdu = (i: number, updated: EducationEntry) =>
    setProfile((p) => {
      const arr = [...p.education];
      arr[i] = updated;
      return { ...p, education: arr };
    });

  const deleteEdu = (i: number) =>
    setProfile((p) => ({ ...p, education: p.education.filter((_, idx) => idx !== i) }));

  const addEdu = () =>
    setProfile((p) => ({ ...p, education: [...p.education, { ...BLANK_EDU }] }));

  // ── Resume upload flow ──
  async function handleUploadRecorded(uploadId: string, filename: string, mimeType: string) {
    const newRecord: ResumeUploadRecord = {
      id: uploadId,
      created_at: new Date().toISOString(),
      status: "processing",
      original_filename: filename,
      mime_type: mimeType,
    };
    setUploadList((prev) => [newRecord, ...prev]);
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
        setUploadList((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: "processed" } : u))
        );
        setTab("profile");
      } else {
        setIngestError(data.error ?? `Failed to analyse resume (${res.status})`);
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

  async function handleDeleteUpload(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/upload/resume/${id}`, { method: "DELETE" });
      if (res.ok) setUploadList((prev) => prev.filter((u) => u.id !== id));
    } finally {
      setDeletingId(null);
    }
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

      {/* ── Upload Resume tab ── */}
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

          {uploadList.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Previously uploaded resumes</h3>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                {uploadList.map((u) => (
                  <div key={u.id} className="flex items-center justify-between px-4 py-3 bg-white">
                    <div className="flex items-center gap-3 min-w-0">
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
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[u.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {u.status}
                      </span>
                      <button
                        onClick={() => handleDeleteUpload(u.id)}
                        disabled={deletingId === u.id}
                        className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                        title="Delete"
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

      {/* ── Import URL tab ── */}
      {tab === "import" && (
        <UrlIngestion onSuccess={() => setTab("profile")} />
      )}

      {/* ── Edit Profile tab ── */}
      {tab === "profile" && (
        <div className="space-y-8">

          {/* Basic info */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Basic info</h2>
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
          </section>

          {/* Experience */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Experience</h2>
              <button
                onClick={addExp}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1A2B4C] hover:underline"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add role
              </button>
            </div>

            {profile.experience.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                No experience added yet.{" "}
                <button onClick={addExp} className="text-[#1A2B4C] underline">Add one</button> or upload a resume to auto-fill.
              </p>
            ) : (
              <div className="space-y-2">
                {profile.experience.map((exp, i) => (
                  <ExperienceCard
                    key={i}
                    entry={exp}
                    onSave={(updated) => updateExp(i, updated)}
                    onDelete={() => deleteExp(i)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Education */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Education</h2>
              <button
                onClick={addEdu}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1A2B4C] hover:underline"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add education
              </button>
            </div>

            {profile.education.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                No education added yet.{" "}
                <button onClick={addEdu} className="text-[#1A2B4C] underline">Add one</button> or upload a resume to auto-fill.
              </p>
            ) : (
              <div className="space-y-2">
                {profile.education.map((edu, i) => (
                  <EducationCard
                    key={i}
                    entry={edu}
                    onSave={(updated) => updateEdu(i, updated)}
                    onDelete={() => deleteEdu(i)}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <Button onClick={handleSave} loading={saving}>
              {saved ? "Saved!" : "Save profile"}
            </Button>
            {saved && <span className="text-sm text-green-600">Profile saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}

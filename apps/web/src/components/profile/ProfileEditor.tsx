"use client";

import { useState } from "react";
import { ResumeUpload } from "./ResumeUpload";
import { UrlIngestion } from "./UrlIngestion";
import { ClarifyingQuestions } from "./ClarifyingQuestions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface CertEntry {
  name: string;
  issuer: string;
  year: string | null;
}

interface ProjectEntry {
  name: string;
  description: string;
  technologies: string[];
}

interface Memory {
  id: string;
  source: string;
  content: string;
  created_at: string;
}

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
  // Details tab fields
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  additional_context: string | null;
  certifications: CertEntry[];
  projects: ProjectEntry[];
  languages: string[];
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
  initialMemories?: Memory[];
}

type Tab = "profile" | "details" | "documents" | "memories";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  processed: "bg-green-100 text-green-700",
  processing: "bg-yellow-100 text-yellow-700",
  uploaded: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
};

const BLANK_EXP: ExperienceEntry = { title: "", company: "", start_date: null, end_date: null, description: "" };
const BLANK_EDU: EducationEntry = { degree: "", institution: "", graduation_year: null };
const BLANK_CERT: CertEntry = { name: "", issuer: "", year: null };
const BLANK_PROJECT: ProjectEntry = { name: "", description: "", technologies: [] };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {hint && <span className="font-normal text-gray-400 ml-1">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      {action}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-[#1A2B4C] hover:underline"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      {label}
    </button>
  );
}

function Textarea({ value, onChange, rows = 3, placeholder }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number; placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-[8px] border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A2B4C]/30 resize-none"
    />
  );
}

// ─── Inline edit cards ───────────────────────────────────────────────────────

function CardActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={onEdit} className="p-1 text-gray-400 hover:text-[#1A2B4C] rounded" title="Edit">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-1.414.944l-3.414.586.586-3.414A4 4 0 019 12.414V13z" />
        </svg>
      </button>
      <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

function SaveCancelRow({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <button onClick={onSave} className="text-xs font-medium bg-[#1A2B4C] text-white px-3 py-1.5 rounded-[6px] hover:bg-[#243d6b]">
        Save
      </button>
      <button onClick={onCancel} className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-[6px] hover:bg-gray-100">
        Cancel
      </button>
    </div>
  );
}

function ExperienceCard({ entry, onSave, onDelete }: {
  entry: ExperienceEntry; onSave: (u: ExperienceEntry) => void; onDelete: () => void;
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
          <CardActions onEdit={() => { setDraft(entry); setEditing(true); }} onDelete={onDelete} />
        </div>
        {(entry.start_date || entry.end_date) && (
          <p className="text-xs text-gray-400">{entry.start_date ?? "?"} – {entry.end_date ?? "Present"}</p>
        )}
        {entry.description && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{entry.description}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#1A2B4C]/30 bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Job title">
          <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Software Engineer" />
        </Field>
        <Field label="Company">
          <Input value={draft.company} onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))} placeholder="Acme Corp" />
        </Field>
        <Field label="Start (YYYY-MM)">
          <Input value={draft.start_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value || null }))} placeholder="2022-03" />
        </Field>
        <Field label="End (YYYY-MM or leave blank)">
          <Input value={draft.end_date ?? ""} onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value || null }))} placeholder="Present" />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={3} placeholder="What you did and the impact you had — be specific with numbers and outcomes." />
      </Field>
      <SaveCancelRow onSave={() => { onSave(draft); setEditing(false); }} onCancel={() => setEditing(false)} />
    </div>
  );
}

function EducationCard({ entry, onSave, onDelete }: {
  entry: EducationEntry; onSave: (u: EducationEntry) => void; onDelete: () => void;
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
          <CardActions onEdit={() => { setDraft(entry); setEditing(true); }} onDelete={onDelete} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#1A2B4C]/30 bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Degree">
          <Input value={draft.degree} onChange={(e) => setDraft((d) => ({ ...d, degree: e.target.value }))} placeholder="B.S. Computer Science" />
        </Field>
        <Field label="Institution">
          <Input value={draft.institution} onChange={(e) => setDraft((d) => ({ ...d, institution: e.target.value }))} placeholder="State University" />
        </Field>
        <Field label="Graduation year">
          <Input value={draft.graduation_year ?? ""} onChange={(e) => setDraft((d) => ({ ...d, graduation_year: e.target.value || null }))} placeholder="2021" />
        </Field>
      </div>
      <SaveCancelRow onSave={() => { onSave(draft); setEditing(false); }} onCancel={() => setEditing(false)} />
    </div>
  );
}

function CertCard({ entry, onSave, onDelete }: {
  entry: CertEntry; onSave: (u: CertEntry) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CertEntry>(entry);

  if (!editing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 group">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 text-sm truncate">{entry.name || "Certification"}</p>
            <p className="text-xs text-gray-500">
              {entry.issuer}{entry.year ? ` · ${entry.year}` : ""}
            </p>
          </div>
          <CardActions onEdit={() => { setDraft(entry); setEditing(true); }} onDelete={onDelete} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#1A2B4C]/30 bg-white p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Certification name">
          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="AWS Solutions Architect" />
        </Field>
        <Field label="Issuer">
          <Input value={draft.issuer} onChange={(e) => setDraft((d) => ({ ...d, issuer: e.target.value }))} placeholder="Amazon Web Services" />
        </Field>
        <Field label="Year">
          <Input value={draft.year ?? ""} onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value || null }))} placeholder="2023" />
        </Field>
      </div>
      <SaveCancelRow onSave={() => { onSave(draft); setEditing(false); }} onCancel={() => setEditing(false)} />
    </div>
  );
}

function ProjectCard({ entry, onSave, onDelete }: {
  entry: ProjectEntry; onSave: (u: ProjectEntry) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProjectEntry>(entry);

  if (!editing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 group">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 text-sm truncate">{entry.name || "Project"}</p>
            {entry.description && <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{entry.description}</p>}
            {entry.technologies.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {entry.technologies.map((t) => (
                  <span key={t} className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded">{t}</span>
                ))}
              </div>
            )}
          </div>
          <CardActions onEdit={() => { setDraft(entry); setEditing(true); }} onDelete={onDelete} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#1A2B4C]/30 bg-white p-4 space-y-3">
      <Field label="Project name">
        <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="E-commerce Platform" />
      </Field>
      <Field label="Description">
        <Textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={2} placeholder="What it does and its impact — include metrics if possible." />
      </Field>
      <Field label="Technologies" hint="(comma-separated)">
        <Input
          value={draft.technologies.join(", ")}
          onChange={(e) => setDraft((d) => ({ ...d, technologies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
          placeholder="React, PostgreSQL, Stripe"
        />
      </Field>
      <SaveCancelRow onSave={() => { onSave(draft); setEditing(false); }} onCancel={() => setEditing(false)} />
    </div>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export function ProfileEditor({ initial, uploads = [], initialMemories = [] }: Props) {
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<Profile>({
    ...initial,
    certifications: initial.certifications ?? [],
    projects: initial.projects ?? [],
    languages: initial.languages ?? [],
    linkedin_url: initial.linkedin_url ?? null,
    github_url: initial.github_url ?? null,
    portfolio_url: initial.portfolio_url ?? null,
    additional_context: initial.additional_context ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Documents tab state
  const [questions, setQuestions] = useState<{ id: string; question: string; hint: string }[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [uploadList, setUploadList] = useState<ResumeUploadRecord[]>(uploads);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);

  // Memories tab state
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  // ── Profile helpers ──────────────────────────────────────────────────────

  const updateExp = (i: number, v: ExperienceEntry) =>
    setProfile((p) => { const arr = [...p.experience]; arr[i] = v; return { ...p, experience: arr }; });
  const deleteExp = (i: number) =>
    setProfile((p) => ({ ...p, experience: p.experience.filter((_, idx) => idx !== i) }));
  const addExp = () =>
    setProfile((p) => ({ ...p, experience: [...p.experience, { ...BLANK_EXP }] }));

  const updateEdu = (i: number, v: EducationEntry) =>
    setProfile((p) => { const arr = [...p.education]; arr[i] = v; return { ...p, education: arr }; });
  const deleteEdu = (i: number) =>
    setProfile((p) => ({ ...p, education: p.education.filter((_, idx) => idx !== i) }));
  const addEdu = () =>
    setProfile((p) => ({ ...p, education: [...p.education, { ...BLANK_EDU }] }));

  const updateCert = (i: number, v: CertEntry) =>
    setProfile((p) => { const arr = [...p.certifications]; arr[i] = v; return { ...p, certifications: arr }; });
  const deleteCert = (i: number) =>
    setProfile((p) => ({ ...p, certifications: p.certifications.filter((_, idx) => idx !== i) }));
  const addCert = () =>
    setProfile((p) => ({ ...p, certifications: [...p.certifications, { ...BLANK_CERT }] }));

  const updateProject = (i: number, v: ProjectEntry) =>
    setProfile((p) => { const arr = [...p.projects]; arr[i] = v; return { ...p, projects: arr }; });
  const deleteProject = (i: number) =>
    setProfile((p) => ({ ...p, projects: p.projects.filter((_, idx) => idx !== i) }));
  const addProject = () =>
    setProfile((p) => ({ ...p, projects: [...p.projects, { ...BLANK_PROJECT }] }));

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const data = await res.json();
        setSaveError(data.error ?? "Save failed");
      }
    } catch {
      setSaveError("Network error — could not save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Resume upload flow ────────────────────────────────────────────────────

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
            certifications: data.profile.certifications?.length ? data.profile.certifications : prev.certifications,
            projects: data.profile.projects?.length ? data.profile.projects : prev.projects,
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
    const addition = Object.values(answers).filter(Boolean).join(". ");
    if (addition) {
      setProfile((p) => ({
        ...p,
        summary: p.summary ? `${p.summary}\n${addition}` : addition,
      }));
    }
    setQuestions([]);
  }

  async function handleDeleteUpload(id: string) {
    setDeletingUploadId(id);
    try {
      const res = await fetch(`/api/upload/resume/${id}`, { method: "DELETE" });
      if (res.ok) setUploadList((prev) => prev.filter((u) => u.id !== id));
    } finally {
      setDeletingUploadId(null);
    }
  }

  // ── Memories ──────────────────────────────────────────────────────────────

  async function handleDeleteMemory(id: string) {
    setDeletingMemoryId(id);
    try {
      const res = await fetch("/api/profile/memories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setMemories((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setDeletingMemoryId(null);
    }
  }

  // ── Tab config ────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "details", label: "Details & Links" },
    { id: "documents", label: "Documents" },
    { id: "memories", label: `Memories${memories.length > 0 ? ` (${memories.length})` : ""}` },
  ];

  // ── Shared save footer ────────────────────────────────────────────────────

  const SaveFooter = () => (
    <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
      <Button onClick={handleSave} loading={saving}>
        {saved ? "Saved!" : "Save changes"}
      </Button>
      {saved && <span className="text-sm text-green-600">Changes saved ✓</span>}
      {saveError && <span className="text-sm text-red-600">{saveError}</span>}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          The more complete your profile, the better Scout can tailor your resumes.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

      {/* ── PROFILE TAB ──────────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="space-y-8">
          {questions.length > 0 && (
            <ClarifyingQuestions questions={questions} onSubmit={handleClarifySubmit} />
          )}

          {/* Basic info */}
          <section className="space-y-4">
            <SectionHeader title="Basic info" />
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
              <Textarea
                value={profile.summary ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))}
                rows={4}
                placeholder="Brief overview of your background and career goals…"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Skills <span className="font-normal text-gray-400">(comma-separated)</span>
              </label>
              <Input
                value={(profile.skills ?? []).join(", ")}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="React, TypeScript, Node.js, PostgreSQL"
              />
            </div>
          </section>

          {/* Experience */}
          <section className="space-y-3">
            <SectionHeader title="Experience" action={<AddButton label="Add role" onClick={addExp} />} />
            {profile.experience.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                No experience added yet.{" "}
                <button onClick={addExp} className="text-[#1A2B4C] underline">Add one</button> or upload a resume to auto-fill.
              </p>
            ) : (
              <div className="space-y-2">
                {profile.experience.map((exp, i) => (
                  <ExperienceCard key={i} entry={exp} onSave={(u) => updateExp(i, u)} onDelete={() => deleteExp(i)} />
                ))}
              </div>
            )}
          </section>

          {/* Education */}
          <section className="space-y-3">
            <SectionHeader title="Education" action={<AddButton label="Add education" onClick={addEdu} />} />
            {profile.education.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                No education added yet.{" "}
                <button onClick={addEdu} className="text-[#1A2B4C] underline">Add one</button> or upload a resume to auto-fill.
              </p>
            ) : (
              <div className="space-y-2">
                {profile.education.map((edu, i) => (
                  <EducationCard key={i} entry={edu} onSave={(u) => updateEdu(i, u)} onDelete={() => deleteEdu(i)} />
                ))}
              </div>
            )}
          </section>

          <SaveFooter />
        </div>
      )}

      {/* ── DETAILS TAB ──────────────────────────────────────────────────────── */}
      {tab === "details" && (
        <div className="space-y-8">

          {/* Online presence */}
          <section className="space-y-4">
            <SectionHeader title="Online profiles" />
            <div className="space-y-3">
              <Field label="LinkedIn URL">
                <Input
                  value={profile.linkedin_url ?? ""}
                  onChange={(e) => setProfile((p) => ({ ...p, linkedin_url: e.target.value || null }))}
                  placeholder="https://linkedin.com/in/yourname"
                />
              </Field>
              <Field label="GitHub URL">
                <Input
                  value={profile.github_url ?? ""}
                  onChange={(e) => setProfile((p) => ({ ...p, github_url: e.target.value || null }))}
                  placeholder="https://github.com/yourname"
                />
              </Field>
              <Field label="Portfolio / Website">
                <Input
                  value={profile.portfolio_url ?? ""}
                  onChange={(e) => setProfile((p) => ({ ...p, portfolio_url: e.target.value || null }))}
                  placeholder="https://yoursite.com"
                />
              </Field>
            </div>
          </section>

          {/* Languages */}
          <section className="space-y-3">
            <SectionHeader title="Languages" />
            <Field label="Languages spoken" hint="(comma-separated)">
              <Input
                value={(profile.languages ?? []).join(", ")}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="English (native), Spanish (conversational)"
              />
            </Field>
          </section>

          {/* Certifications */}
          <section className="space-y-3">
            <SectionHeader title="Certifications" action={<AddButton label="Add certification" onClick={addCert} />} />
            {profile.certifications.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                No certifications added.{" "}
                <button onClick={addCert} className="text-[#1A2B4C] underline">Add one</button>.
              </p>
            ) : (
              <div className="space-y-2">
                {profile.certifications.map((cert, i) => (
                  <CertCard key={i} entry={cert} onSave={(u) => updateCert(i, u)} onDelete={() => deleteCert(i)} />
                ))}
              </div>
            )}
          </section>

          {/* Projects */}
          <section className="space-y-3">
            <SectionHeader title="Projects" action={<AddButton label="Add project" onClick={addProject} />} />
            {profile.projects.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                No projects added.{" "}
                <button onClick={addProject} className="text-[#1A2B4C] underline">Add one</button>.
              </p>
            ) : (
              <div className="space-y-2">
                {profile.projects.map((proj, i) => (
                  <ProjectCard key={i} entry={proj} onSave={(u) => updateProject(i, u)} onDelete={() => deleteProject(i)} />
                ))}
              </div>
            )}
          </section>

          {/* Additional context */}
          <section className="space-y-3">
            <SectionHeader title="Additional context" />
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
              <p className="font-medium mb-1">Write freely about yourself here.</p>
              <p className="text-xs text-blue-600">
                Include anything that doesn&apos;t fit the structured fields — key achievements with numbers, awards,
                side projects, notable clients, career pivots, what you&apos;re proud of, or why you&apos;re transitioning.
                Scout and the resume AI will mine this for your best proof points.
              </p>
            </div>
            <Textarea
              value={profile.additional_context ?? ""}
              onChange={(e) => setProfile((p) => ({ ...p, additional_context: e.target.value || null }))}
              rows={8}
              placeholder={`Example: At Acme I led a team of 6 engineers and shipped a payments feature that generated $2M in the first quarter. Before that I was a solo founder — built and sold a SaaS with 3,000 paying users. I'm transitioning from fintech to climate tech because I want to apply my engineering skills to problems that matter to me...`}
            />
          </section>

          <SaveFooter />
        </div>
      )}

      {/* ── DOCUMENTS TAB ────────────────────────────────────────────────────── */}
      {tab === "documents" && (
        <div className="space-y-6">
          {ingestError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <strong>Resume analysis failed:</strong> {ingestError}
            </div>
          )}

          <section className="space-y-4">
            <SectionHeader title="Upload resume or document" />
            <p className="text-sm text-gray-500">
              Upload a PDF or document about yourself. The AI will extract your experience and add it to your profile.
              You can upload multiple documents.
            </p>
            <ResumeUpload onSuccess={handleUploadRecorded} />
            {questionsLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="animate-spin h-4 w-4 text-[#1A2B4C]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Analysing document with AI…
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader title="Import from URL" />
            <UrlIngestion onSuccess={() => setTab("profile")} />
          </section>

          {uploadList.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Uploaded documents" />
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
                          {u.original_filename ?? "Document"}
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
                        disabled={deletingUploadId === u.id}
                        className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        {deletingUploadId === u.id ? (
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
            </section>
          )}
        </div>
      )}

      {/* ── MEMORIES TAB ─────────────────────────────────────────────────────── */}
      {tab === "memories" && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
            <p className="font-medium text-gray-700 mb-1">What are memories?</p>
            <p className="text-xs">
              When you tell Scout things about your work history, achievements, or goals, it automatically saves
              them here. These facts are fed into every resume and cover letter to make them more personal and accurate.
              Delete any that are outdated or incorrect.
            </p>
          </div>

          {memories.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="mt-3 text-sm text-gray-500">No memories yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Chat with Scout and tell it about your career — it will save the important details here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{m.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">{formatDate(m.created_at)}</span>
                      {m.source && m.source !== "scout" && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{m.source}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteMemory(m.id)}
                    disabled={deletingMemoryId === m.id}
                    className="shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                    title="Delete memory"
                  >
                    {deletingMemoryId === m.id ? (
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

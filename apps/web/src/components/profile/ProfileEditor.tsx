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

interface Props {
  initial: Profile;
}

type Tab = "profile" | "resume" | "import";

export function ProfileEditor({ initial }: Props) {
  const [tab, setTab] = useState<Tab>("resume");
  const [profile, setProfile] = useState<Profile>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [lastUploadId, setLastUploadId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<{ id: string; question: string; hint: string }[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  async function handleResumeSuccess(uploadId: string) {
    setLastUploadId(uploadId);
    setQuestionsLoading(true);
    try {
      const [extractRes, clarifyRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/resumes/${uploadId}/extract`, {
          method: "POST",
          headers: { Authorization: `Bearer ${await getToken()}` },
        }),
        Promise.resolve(null),
      ]);
      if (extractRes.ok) {
        const clarifyResponse = await fetch("/api/profile/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upload_id: uploadId }),
        });
        if (clarifyResponse.ok) {
          const data = await clarifyResponse.json();
          setQuestions(data.questions ?? []);
        }
      }
    } finally {
      setQuestionsLoading(false);
      setTab("profile");
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

      {tab === "resume" && (
        <div className="space-y-6">
          <ResumeUpload onSuccess={handleResumeSuccess} />
          {questionsLoading && (
            <p className="text-sm text-gray-500 animate-pulse">Analysing resume…</p>
          )}
          {questions.length > 0 && (
            <ClarifyingQuestions questions={questions} onSubmit={handleClarifySubmit} />
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
        <div className="space-y-5">
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

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} loading={saving}>
              {saved ? "Saved!" : "Save profile"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

async function getToken(): Promise<string> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

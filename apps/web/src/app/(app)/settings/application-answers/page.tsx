"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";

interface Answer {
  question_key: string;
  question_text: string | null;
  answer: string;
  updated_at: string;
}

const COMMON_QUESTIONS: { key: string; label: string }[] = [
  { key: "work_authorization", label: "Are you authorized to work in this country?" },
  { key: "requires_sponsorship", label: "Do you require visa sponsorship?" },
  { key: "years_of_experience", label: "Years of relevant experience" },
  { key: "earliest_start_date", label: "Earliest available start date" },
  { key: "salary_expectation", label: "Desired salary / compensation" },
  { key: "linkedin_url", label: "LinkedIn profile URL" },
  { key: "github_url", label: "GitHub profile URL" },
  { key: "portfolio_url", label: "Portfolio / personal website URL" },
  { key: "willing_to_relocate", label: "Are you willing to relocate?" },
];

export default function ApplicationAnswersPage() {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newText, setNewText] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  useEffect(() => {
    fetch("/api/application-answers")
      .then((r) => r.json())
      .then((d) => setAnswers(d.answers ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function save(key: string, text: string, value: string) {
    setSaving(key);
    try {
      await fetch("/api/application-answers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_key: key, question_text: text, answer: value }),
      });
      setAnswers((prev) => {
        const existing = prev.find((a) => a.question_key === key);
        if (existing) {
          return prev.map((a) => a.question_key === key ? { ...a, answer: value } : a);
        }
        return [...prev, { question_key: key, question_text: text, answer: value, updated_at: new Date().toISOString() }];
      });
    } finally {
      setSaving(null);
    }
  }

  async function remove(key: string) {
    await fetch(`/api/application-answers?question_key=${encodeURIComponent(key)}`, { method: "DELETE" });
    setAnswers((prev) => prev.filter((a) => a.question_key !== key));
  }

  async function addCustom() {
    if (!newKey.trim() || !newAnswer.trim()) return;
    await save(newKey.trim(), newText.trim() || newKey.trim(), newAnswer.trim());
    setNewKey("");
    setNewText("");
    setNewAnswer("");
    setAddingCustom(false);
  }

  const answerMap = Object.fromEntries(answers.map((a) => [a.question_key, a]));
  const customAnswers = answers.filter(
    (a) => !COMMON_QUESTIONS.some((q) => q.key === a.question_key)
  );

  if (loading) {
    return <div className="text-center text-gray-400 py-20 text-sm">Loading...</div>;
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Application answers</h1>
        <p className="text-sm text-gray-400 mt-1">
          Pre-fill answers to common application questions. The browser agent uses these when filling forms.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Common questions</h2>
        {COMMON_QUESTIONS.map((q) => {
          const saved = answerMap[q.key];
          return (
            <AnswerRow
              key={q.key}
              questionKey={q.key}
              label={q.label}
              initialValue={saved?.answer ?? ""}
              saving={saving === q.key}
              onSave={(v) => save(q.key, q.label, v)}
            />
          );
        })}
      </section>

      {customAnswers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom answers</h2>
          {customAnswers.map((a) => (
            <div key={a.question_key} className="flex items-start gap-3">
              <div className="flex-1">
                <AnswerRow
                  questionKey={a.question_key}
                  label={a.question_text || a.question_key}
                  initialValue={a.answer}
                  saving={saving === a.question_key}
                  onSave={(v) => save(a.question_key, a.question_text || a.question_key, v)}
                />
              </div>
              <button
                onClick={() => remove(a.question_key)}
                className="mt-6 text-gray-300 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </section>
      )}

      <section>
        {addingCustom ? (
          <div className="space-y-3 border border-gray-100 rounded-xl p-4">
            <h3 className="text-sm font-medium text-gray-700">Add custom answer</h3>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
              placeholder="Question label (e.g. 'Do you have a driving license?')"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
            />
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
              placeholder="Question key (e.g. 'driving_license')"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
              placeholder="Your answer"
              value={newAnswer}
              onChange={(e) => setNewAnswer(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={addCustom}
                className="flex items-center gap-1.5 text-sm font-medium text-white bg-[#1A2B4C] px-3 py-1.5 rounded-[6px] hover:bg-[#243660]"
              >
                <Save size={13} /> Save
              </button>
              <button
                onClick={() => setAddingCustom(false)}
                className="text-sm text-gray-400 px-3 py-1.5 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingCustom(true)}
            className="flex items-center gap-1.5 text-sm text-[#1A2B4C] border border-[#1A2B4C] px-3 py-2 rounded-[8px] hover:bg-[#F7F9FC]"
          >
            <Plus size={14} /> Add custom answer
          </button>
        )}
      </section>
    </div>
  );
}

function AnswerRow({
  questionKey,
  label,
  initialValue,
  saving,
  onSave,
}: {
  questionKey: string;
  label: string;
  initialValue: string;
  saving: boolean;
  onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [dirty, setDirty] = useState(false);

  function handleChange(v: string) {
    setValue(v);
    setDirty(v !== initialValue);
  }

  function handleSave() {
    onSave(value);
    setDirty(false);
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
          placeholder="Your answer..."
          value={value}
          onChange={(e) => handleChange(e.target.value)}
        />
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 text-xs font-medium text-white bg-[#1A2B4C] px-2.5 py-1.5 rounded-[6px] hover:bg-[#243660] disabled:opacity-60"
          >
            {saving ? "..." : <><Save size={11} /> Save</>}
          </button>
        )}
      </div>
    </div>
  );
}

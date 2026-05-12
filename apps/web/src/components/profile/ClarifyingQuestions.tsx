"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Question {
  id: string;
  question: string;
  hint: string;
}

interface ClarifyingQuestionsProps {
  questions: Question[];
  onSubmit: (answers: Record<string, string>) => Promise<void>;
}

export function ClarifyingQuestions({ questions, onSubmit }: ClarifyingQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (questions.length === 0) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(answers);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">A few quick questions</h3>
        <p className="text-sm text-gray-500 mt-1">
          Help us fill in the gaps to strengthen your profile.
        </p>
      </div>

      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.id} className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{q.question}</label>
            <Input
              placeholder={q.hint}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save answers"}
      </Button>
    </form>
  );
}

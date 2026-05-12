"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckCircle } from "lucide-react";
import { AutoRules, AutoRule } from "./AutoRules";

interface Prefs {
  target_titles: string[];
  work_modes: string[];
  salary_min: number | null;
  salary_max: number | null;
  target_locations: string[];
  industries: string[];
  deal_breakers: string[];
  auto_approve_rules?: AutoRule[];
  auto_reject_rules?: AutoRule[];
}

interface Props {
  initial: Prefs;
}

const WORK_MODES = ["Remote", "Hybrid", "On-site"];
const STEPS = ["Roles", "Work style", "Compensation", "Location", "Industries", "Deal-breakers", "Automation"];

export function PreferencesWizard({ initial }: Props) {
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>({
    ...initial,
    auto_approve_rules: initial.auto_approve_rules ?? [],
    auto_reject_rules: initial.auto_reject_rules ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleMode(mode: string) {
    setPrefs((p) => ({
      ...p,
      work_modes: p.work_modes.includes(mode)
        ? p.work_modes.filter((m) => m !== mode)
        : [...p.work_modes, mode],
    }));
  }

  function listField(
    key: "target_titles" | "target_locations" | "industries" | "deal_breakers",
    placeholder: string,
    label: string
  ) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <Input
          value={prefs[key].join(", ")}
          onChange={(e) =>
            setPrefs((p) => ({
              ...p,
              [key]: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            }))
          }
          placeholder={placeholder}
        />
        <p className="text-xs text-gray-400">Comma-separated</p>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/preferences/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Job Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tell us what you are looking for so we can match you with the right opportunities.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              i <= step ? "bg-[#1A2B4C]" : "bg-gray-200"
            }`}
            title={s}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </p>

      <div className="min-h-[180px]">
        {step === 0 &&
          listField(
            "target_titles",
            "Software Engineer, Product Manager, Designer",
            "Target job titles"
          )}

        {step === 1 && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">Preferred work modes</label>
            <div className="flex gap-3">
              {WORK_MODES.map((mode) => {
                const active = prefs.work_modes.includes(mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => toggleMode(mode)}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-[#1A2B4C] bg-[#1A2B4C] text-white"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <label className="text-sm font-medium text-gray-700">Salary range (USD / year)</label>
            <div className="flex gap-4 items-center">
              <div className="flex-1 space-y-1">
                <span className="text-xs text-gray-400">Minimum</span>
                <Input
                  type="number"
                  placeholder="80000"
                  value={prefs.salary_min ?? ""}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      salary_min: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </div>
              <span className="text-gray-300 mt-5">—</span>
              <div className="flex-1 space-y-1">
                <span className="text-xs text-gray-400">Maximum</span>
                <Input
                  type="number"
                  placeholder="150000"
                  value={prefs.salary_max ?? ""}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      salary_max: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 &&
          listField(
            "target_locations",
            "San Francisco CA, New York NY, Remote",
            "Preferred locations"
          )}

        {step === 4 &&
          listField(
            "industries",
            "Technology, Healthcare, Finance",
            "Industries you are interested in"
          )}

        {step === 5 &&
          listField(
            "deal_breakers",
            "No equity, Requires relocation, No remote",
            "Deal-breakers (we will filter these out)"
          )}

        {step === 6 && (
          <AutoRules
            approveRules={prefs.auto_approve_rules ?? []}
            rejectRules={prefs.auto_reject_rules ?? []}
            onChange={(approve, reject) =>
              setPrefs((p) => ({
                ...p,
                auto_approve_rules: approve,
                auto_reject_rules: reject,
              }))
            }
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleSave} loading={saving}>
            {saved ? (
              <span className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Saved
              </span>
            ) : (
              "Save"
            )}
          </Button>
          {!isLast && (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          )}
          {isLast && (
            <Button onClick={handleSave} loading={saving}>
              Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

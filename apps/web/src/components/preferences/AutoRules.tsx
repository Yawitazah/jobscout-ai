"use client";

import { useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface RuleClause {
  field: string;
  op: string;
  value: string | number;
}

export interface AutoRule {
  name: string;
  active: boolean;
  all_of: RuleClause[];
}

interface Props {
  approveRules: AutoRule[];
  rejectRules: AutoRule[];
  onChange: (approve: AutoRule[], reject: AutoRule[]) => void;
}

const FIELDS = [
  { value: "score", label: "Score" },
  { value: "work_mode", label: "Work mode" },
  { value: "has_deal_breaker", label: "Has deal-breaker" },
  { value: "salary_min", label: "Salary min" },
  { value: "salary_max", label: "Salary max" },
  { value: "company_in_greenlist", label: "Company in greenlist" },
  { value: "company_in_blocklist", label: "Company in blocklist" },
];

const OPS = [">=", "<=", "equals", "in", "contains"];

function RuleEditor({
  rule,
  onChange,
  onDelete,
}: {
  rule: AutoRule;
  onChange: (r: AutoRule) => void;
  onDelete: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 text-sm border border-gray-200 rounded-[6px] px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
          value={rule.name}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
          placeholder="Rule name"
        />
        <button
          onClick={() => onChange({ ...rule, active: !rule.active })}
          className="text-gray-400 hover:text-[#1A2B4C]"
          title={rule.active ? "Disable" : "Enable"}
        >
          {rule.active ? (
            <ToggleRight size={22} className="text-[#1A2B4C]" />
          ) : (
            <ToggleLeft size={22} />
          )}
        </button>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500">
          <Trash2 size={16} />
        </button>
      </div>

      {rule.all_of.map((clause, ci) => (
        <div key={ci} className="flex gap-2 items-center">
          <select
            className="text-xs border border-gray-200 rounded-[6px] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
            value={clause.field}
            onChange={(e) => {
              const updated = [...rule.all_of];
              updated[ci] = { ...clause, field: e.target.value };
              onChange({ ...rule, all_of: updated });
            }}
          >
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="text-xs border border-gray-200 rounded-[6px] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
            value={clause.op}
            onChange={(e) => {
              const updated = [...rule.all_of];
              updated[ci] = { ...clause, op: e.target.value };
              onChange({ ...rule, all_of: updated });
            }}
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            className="flex-1 text-xs border border-gray-200 rounded-[6px] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A2B4C]"
            value={String(clause.value)}
            onChange={(e) => {
              const updated = [...rule.all_of];
              updated[ci] = { ...clause, value: e.target.value };
              onChange({ ...rule, all_of: updated });
            }}
            placeholder="value"
          />
          <button
            onClick={() => {
              const updated = rule.all_of.filter((_, i) => i !== ci);
              onChange({ ...rule, all_of: updated });
            }}
            className="text-gray-400 hover:text-red-500"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      <button
        onClick={() =>
          onChange({
            ...rule,
            all_of: [...rule.all_of, { field: "score", op: ">=", value: 80 }],
          })
        }
        className="text-xs text-[#1A2B4C] hover:underline flex items-center gap-1"
      >
        <Plus size={12} /> Add condition
      </button>
    </div>
  );
}

function RuleList({
  title,
  rules,
  onChange,
}: {
  title: string;
  rules: AutoRule[];
  onChange: (rules: AutoRule[]) => void;
}) {
  const addRule = () => {
    onChange([
      ...rules,
      {
        name: "New rule",
        active: true,
        all_of: [{ field: "score", op: ">=", value: 80 }],
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <button
          onClick={addRule}
          className="text-xs text-[#1A2B4C] hover:underline flex items-center gap-1"
        >
          <Plus size={12} /> Add rule
        </button>
      </div>
      {rules.length === 0 && (
        <p className="text-xs text-gray-400">No rules yet.</p>
      )}
      {rules.map((rule, i) => (
        <RuleEditor
          key={i}
          rule={rule}
          onChange={(updated) => {
            const next = [...rules];
            next[i] = updated;
            onChange(next);
          }}
          onDelete={() => onChange(rules.filter((_, j) => j !== i))}
        />
      ))}
    </div>
  );
}

export function AutoRules({ approveRules, rejectRules, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-gray-500 mb-4">
          Rules are evaluated after each job is scored. Auto-reject takes precedence over auto-approve.
        </p>
      </div>
      <RuleList
        title="Auto-approve rules"
        rules={approveRules}
        onChange={(r) => onChange(r, rejectRules)}
      />
      <RuleList
        title="Auto-reject rules"
        rules={rejectRules}
        onChange={(r) => onChange(approveRules, r)}
      />
    </div>
  );
}

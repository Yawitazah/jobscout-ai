"use client";

import { JobCard, QueueItem } from "./JobCard";

interface Props {
  items: QueueItem[];
  onDecision: (id: string, decision: "approve" | "reject" | "save") => void;
}

export function CardStack({ items, onDecision }: Props) {
  const visible = items.slice(0, 3);

  return (
    <div className="relative w-full" style={{ height: 520 }}>
      {visible.map((item, i) => (
        <JobCard
          key={item.id}
          item={item}
          onDecision={(d) => onDecision(item.id, d)}
          isActive={i === 0}
          stackIndex={i}
        />
      ))}
    </div>
  );
}

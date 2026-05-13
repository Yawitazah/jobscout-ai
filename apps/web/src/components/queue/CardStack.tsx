"use client";

import { useRef, useCallback } from "react";
import { JobCard, QueueItem } from "./JobCard";

// How far the user must drag before a decision triggers
const THRESHOLD_X = 80;   // px horizontal → approve / reject
const THRESHOLD_Y = -70;  // px upward      → save

function getDecision(
  dx: number,
  dy: number
): "approve" | "reject" | "save" | null {
  if (dy < THRESHOLD_Y && Math.abs(dy) > Math.abs(dx) * 0.6) return "save";
  if (dx > THRESHOLD_X) return "approve";
  if (dx < -THRESHOLD_X) return "reject";
  return null;
}

const STAMP: Record<string, { label: string; color: string; bg: string }> = {
  approve: { label: "APPLY",  color: "#15803d", bg: "rgba(22,163,74,.13)" },
  reject:  { label: "PASS",   color: "#dc2626", bg: "rgba(220,38,38,.13)" },
  save:    { label: "SAVE",   color: "#1d4ed8", bg: "rgba(37,99,235,.13)" },
};

interface Props {
  items: QueueItem[];
  onDecision: (id: string, decision: "approve" | "reject" | "save") => void;
}

export function CardStack({ items, onDecision }: Props) {
  // Refs to DOM nodes for imperative animation (no re-render during drag)
  const wrapRef   = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stampRef   = useRef<HTMLSpanElement>(null);

  // Drag state stored in a ref — no re-renders while panning
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastDx: 0,
    lastDy: 0,
  });

  // ── Visual helpers ────────────────────────────────────────────────── //

  const applyTransform = (dx: number, dy: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rot = Math.max(-20, Math.min(20, dx * 0.06));
    el.style.transform = `translateX(${dx}px) translateY(${dy}px) rotate(${rot}deg)`;
  };

  const showStamp = (decision: "approve" | "reject" | "save" | null, ratio: number) => {
    const ov = overlayRef.current;
    const st = stampRef.current;
    if (!ov || !st) return;

    if (!decision || ratio < 0.1) {
      ov.style.display = "none";
      return;
    }

    const meta = STAMP[decision];
    ov.style.cssText = `
      display: flex;
      background: ${meta.bg};
      opacity: ${Math.min(ratio, 1)};
    `;
    st.textContent = meta.label;
    st.style.color = meta.color;
    st.style.borderColor = meta.color;
    st.style.opacity = String(Math.min(ratio * 1.5, 1));
  };

  const snapBack = () => {
    const el = wrapRef.current;
    if (!el) return;
    el.style.transition = "transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)";
    el.style.transform = "none";
    if (overlayRef.current) overlayRef.current.style.display = "none";
    setTimeout(() => { if (wrapRef.current) wrapRef.current.style.transition = "none"; }, 340);
  };

  const flyAway = (decision: "approve" | "reject" | "save") => {
    const el = wrapRef.current;
    if (!el) return;
    const tx = decision === "approve" ? 900 : decision === "reject" ? -900 : 0;
    const ty = decision === "save" ? -800 : 40;
    const rot = decision === "approve" ? 28 : decision === "reject" ? -28 : 0;
    el.style.transition = "transform 0.38s cubic-bezier(0.4,0,1,1)";
    el.style.transform = `translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg)`;
  };

  // ── Pointer handlers (desktop mouse + mobile touch via Pointer API) ── //

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start a drag if the user tapped a button or link
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, lastDx: 0, lastDy: 0 };
    const el = wrapRef.current;
    if (el) { el.style.transition = "none"; el.style.cursor = "grabbing"; }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    drag.current.lastDx = dx;
    drag.current.lastDy = dy;

    applyTransform(dx, dy);

    const decision = getDecision(dx, dy);
    const ratio = decision === "save"
      ? Math.abs(dy) / Math.abs(THRESHOLD_Y)
      : decision === "approve"
        ? dx / THRESHOLD_X
        : decision === "reject"
          ? -dx / THRESHOLD_X
          : 0;
    showStamp(decision, ratio);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const el = wrapRef.current;
    if (el) el.style.cursor = "grab";

    const { lastDx, lastDy } = drag.current;
    const decision = getDecision(lastDx, lastDy);

    if (decision && items.length > 0) {
      const id = items[0].id;
      flyAway(decision);
      // Trigger decision after the card flies off screen
      setTimeout(() => onDecision(id, decision), 380);
    } else {
      snapBack();
    }
  }, [items, onDecision]);

  const visible = items.slice(0, 3);

  return (
    <div className="relative w-full select-none" style={{ height: 560 }}>
      {visible.map((item, i) => {
        if (i === 0) {
          return (
            <div
              key={item.id}
              className="absolute inset-0 touch-none"
              style={{ zIndex: 10, cursor: "grab" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {/* Animating wrapper */}
              <div
                ref={wrapRef}
                className="absolute inset-0"
                style={{ willChange: "transform" }}
              >
                {/* Decision stamp overlay */}
                <div
                  ref={overlayRef}
                  className="absolute inset-0 rounded-2xl pointer-events-none z-20 items-center justify-center"
                  style={{ display: "none" }}
                >
                  <span
                    ref={stampRef}
                    className="text-3xl sm:text-4xl font-black border-[3px] rounded-xl px-4 py-2 tracking-widest uppercase"
                    style={{ transform: "rotate(-12deg)" }}
                  />
                </div>

                <JobCard
                  item={item}
                  onDecision={(d) => onDecision(item.id, d)}
                  isActive={true}
                  stackIndex={0}
                />
              </div>
            </div>
          );
        }

        return (
          <div
            key={item.id}
            className="absolute inset-0"
            style={{
              transform: `translateY(${i * 8}px) scale(${1 - i * 0.03})`,
              zIndex: 10 - i,
              pointerEvents: "none",
            }}
          >
            <JobCard
              item={item}
              onDecision={() => {}}
              isActive={false}
              stackIndex={i}
            />
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const variantClasses: Record<ToastVariant, string> = {
  success: "bg-[#1F7A4D] text-white",
  error: "bg-[#A52A2A] text-white",
  info: "bg-[#1A2B4C] text-white",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-[8px] shadow-lg text-sm min-w-[280px] max-w-sm",
        variantClasses[toast.variant]
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-label="Notifications"
        className={cn(
          "fixed z-50 flex flex-col gap-2",
          "top-4 left-1/2 -translate-x-1/2 items-center",
          "sm:top-auto sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 sm:items-end"
        )}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

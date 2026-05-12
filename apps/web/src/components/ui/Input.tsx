"use client";

import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export function Input({
  label,
  helperText,
  error,
  id,
  className,
  ...props
}: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const errorId = error && inputId ? `${inputId}-error` : undefined;
  const helperId = helperText && inputId ? `${inputId}-helper` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-[#1A1A1A]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [errorId, helperId].filter(Boolean).join(" ") || undefined
        }
        className={cn(
          "w-full px-3 py-2 text-sm border rounded-lg bg-white text-[#1A1A1A] placeholder-[#5A6478] transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/20 focus-visible:border-[#1A2B4C]",
          error
            ? "border-[#A52A2A] focus-visible:ring-red-200"
            : "border-[#E1E6EE]",
          className
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" aria-live="polite" className="text-xs text-[#A52A2A]">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-[#5A6478]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

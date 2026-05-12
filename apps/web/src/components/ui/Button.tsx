"use client";

import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "tertiary" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[#1A2B4C] text-white hover:opacity-90 disabled:opacity-60 border border-transparent",
  secondary:
    "bg-white text-[#1A2B4C] border border-[#1A2B4C] hover:bg-[#F7F9FC] disabled:opacity-60",
  tertiary:
    "bg-transparent text-[#1A2B4C] border border-transparent hover:bg-[#F7F9FC] disabled:opacity-60",
  danger:
    "bg-[#A52A2A] text-white hover:opacity-90 disabled:opacity-60 border border-transparent",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium rounded-[8px] transition-opacity cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/50 focus-visible:ring-offset-1",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  );
}

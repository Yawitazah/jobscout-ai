import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-[#E1E6EE] text-[#1A1A1A]",
  success: "bg-green-100 text-[#1F7A4D]",
  warning: "bg-yellow-100 text-[#B07502]",
  danger: "bg-red-100 text-[#A52A2A]",
  info: "bg-blue-100 text-[#0A66C2]",
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

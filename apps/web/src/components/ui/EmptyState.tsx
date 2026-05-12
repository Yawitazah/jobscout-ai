import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-[#1A2B4C]/10 flex items-center justify-center mb-4">
          <Icon size={24} className="text-[#1A2B4C]" strokeWidth={1.5} />
        </div>
      )}
      <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">{title}</h2>
      {description && (
        <p className="text-sm text-[#5A6478] max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

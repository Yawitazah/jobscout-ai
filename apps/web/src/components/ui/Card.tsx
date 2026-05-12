import { cn } from "@/lib/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-[12px] border border-[#E1E6EE] shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return (
    <div className={cn("px-6 py-4 border-b border-[#E1E6EE]", className)}>
      {children}
    </div>
  );
}

export function CardBody({ className, children }: CardProps) {
  return (
    <div className={cn("px-6 py-4", className)}>{children}</div>
  );
}

export function CardFooter({ className, children }: CardProps) {
  return (
    <div className={cn("px-6 py-4 border-t border-[#E1E6EE]", className)}>
      {children}
    </div>
  );
}

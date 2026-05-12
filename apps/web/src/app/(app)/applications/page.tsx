import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ApplicationsPage() {
  return (
    <EmptyState
      icon={FileText}
      title="No applications yet."
      description="Jobs you apply to will be tracked here."
    />
  );
}

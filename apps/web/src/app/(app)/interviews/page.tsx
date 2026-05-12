import { Calendar } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export default function InterviewsPage() {
  return (
    <EmptyState
      icon={Calendar}
      title="No upcoming interviews."
      description="Scheduled interviews will appear here."
    />
  );
}

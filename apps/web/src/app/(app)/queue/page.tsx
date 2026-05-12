import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export default function QueuePage() {
  return (
    <EmptyState
      icon={Inbox}
      title="No jobs in queue yet."
      description="Matched jobs will appear here once your profile is set up."
    />
  );
}

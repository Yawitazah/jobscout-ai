import { Settings } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export default function PreferencesPage() {
  return (
    <EmptyState
      icon={Settings}
      title="Preferences coming in Phase 2."
      description="Notification and search preferences will be configurable here."
    />
  );
}

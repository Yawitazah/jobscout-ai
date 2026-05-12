import { User } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ProfilePage() {
  return (
    <EmptyState
      icon={User}
      title="Profile setup coming in Phase 2."
      description="You will be able to configure your resume, skills, and job preferences here."
    />
  );
}

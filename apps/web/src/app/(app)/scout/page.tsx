import { ScoutShell } from "@/components/scout/ScoutShell";

export default function ScoutPage() {
  return (
    // Pull out of the AppShell p-8 padding and fill the full content area
    <div className="-m-8 h-[calc(100vh-3.5rem)] flex">
      <ScoutShell />
    </div>
  );
}

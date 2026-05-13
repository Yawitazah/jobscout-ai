import { ScoutShell } from "@/components/scout/ScoutShell";

export default function ScoutPage() {
  return (
    /*
     * Pull out of the AppShell p-8 padding and fill the available content area.
     * On mobile the bottom tab bar is h-16 (4rem), so subtract it too.
     * On lg+ there is no bottom bar.
     */
    <div className="-m-8 h-[calc(100vh-3.5rem-4rem)] lg:h-[calc(100vh-3.5rem)] flex overflow-hidden">
      <ScoutShell />
    </div>
  );
}

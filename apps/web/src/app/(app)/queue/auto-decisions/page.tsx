import { createClient } from "@/lib/supabase/server";
import { AutoDecisionsList } from "./AutoDecisionsList";

export default async function AutoDecisionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("user_jobs")
    .select(
      `
      id, score, status, decision_source, scored_at, reviewed_at,
      job:jobs (
        id, title, source_url,
        company:companies ( name )
      )
    `
    )
    .eq("user_id", user.id)
    .eq("decision_source", "auto")
    .gte("reviewed_at", since)
    .order("reviewed_at", { ascending: false });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Auto-decisions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Jobs automatically approved or rejected in the last 24 hours.
        </p>
      </div>
      <AutoDecisionsList items={(data ?? []) as any} />
    </div>
  );
}

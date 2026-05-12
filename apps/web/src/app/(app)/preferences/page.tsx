import { createClient } from "@/lib/supabase/server";
import { PreferencesWizard } from "@/components/preferences/PreferencesWizard";

export default async function PreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: prefs } = await supabase
    .from("preferences")
    .select(
      "target_titles, work_modes, salary_min, salary_max, target_locations, industries, deal_breakers"
    )
    .eq("user_id", user!.id)
    .single();

  const initial = {
    target_titles: prefs?.target_titles ?? [],
    work_modes: prefs?.work_modes ?? [],
    salary_min: prefs?.salary_min ?? null,
    salary_max: prefs?.salary_max ?? null,
    target_locations: prefs?.target_locations ?? [],
    industries: prefs?.industries ?? [],
    deal_breakers: prefs?.deal_breakers ?? [],
  };

  return <PreferencesWizard initial={initial} />;
}

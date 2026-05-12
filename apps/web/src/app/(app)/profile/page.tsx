import { createClient } from "@/lib/supabase/server";
import { ProfileEditor } from "@/components/profile/ProfileEditor";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, location, summary, skills, experience, education")
    .eq("id", user!.id)
    .single();

  const initial = profile ?? {
    id: user!.id,
    full_name: null,
    email: user!.email ?? null,
    phone: null,
    location: null,
    summary: null,
    skills: [],
    experience: [],
    education: [],
  };

  return <ProfileEditor initial={initial} />;
}

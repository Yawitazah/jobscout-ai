import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: events, error } = await supabase
    .from("application_events")
    .select(`
      id,
      event_type,
      event_data,
      occurred_at,
      created_by
    `)
    .eq("application_id", id)
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich email_received events with message data
  const enriched = await Promise.all(
    (events ?? []).map(async (ev) => {
      if (ev.event_type === "email_received" && ev.event_data?.message_id) {
        const { data: msg } = await supabase
          .from("inbox_messages")
          .select("id, subject, from_address, from_name, received_at, classification, classification_confidence, extracted_data, body_text, snippet")
          .eq("id", ev.event_data.message_id)
          .single();
        return { ...ev, message: msg ?? null };
      }
      if ((ev.event_type === "interview_scheduled" || ev.event_type === "interview_proposed") && ev.event_data?.interview_id) {
        const { data: interview } = await supabase
          .from("interviews")
          .select("id, round_name, scheduled_at, format, meeting_link, status")
          .eq("id", ev.event_data.interview_id)
          .single();
        return { ...ev, interview: interview ?? null };
      }
      return ev;
    })
  );

  return NextResponse.json({ events: enriched });
}

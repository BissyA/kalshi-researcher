import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getServerSupabase();

  // Only return events that have at least one research run —
  // corpus-imported events (no research) belong on the Corpus page, not here.
  const { data: eventIds, error: runError } = await supabase
    .from("research_runs")
    .select("event_id");

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  const uniqueEventIds = [...new Set((eventIds ?? []).map((r) => r.event_id))];

  if (uniqueEventIds.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, speaker, event_date, status, kalshi_event_ticker")
    .in("id", uniqueEventIds)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: events ?? [] });
}

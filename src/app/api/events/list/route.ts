import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getServerSupabase();

  // Return events that have at least one research run OR logged trades.
  // Corpus-imported events (no research, no trades) belong on the Corpus page, not here.
  const [{ data: researchEventIds, error: runError }, { data: tradeEventIds, error: tradeError }] =
    await Promise.all([
      supabase.from("research_runs").select("event_id"),
      supabase.from("trades").select("event_id"),
    ]);

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }
  if (tradeError) {
    return NextResponse.json({ error: tradeError.message }, { status: 500 });
  }

  const uniqueEventIds = [
    ...new Set([
      ...(researchEventIds ?? []).map((r) => r.event_id),
      ...(tradeEventIds ?? []).map((t) => t.event_id),
    ]),
  ];

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

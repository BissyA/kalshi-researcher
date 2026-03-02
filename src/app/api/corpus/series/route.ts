import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET: List series for a speaker
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get("speakerId");

  const supabase = getServerSupabase();

  let query = supabase
    .from("series")
    .select("id, speaker_id, series_ticker, display_name, events_count, words_count, last_imported_at, created_at")
    .order("created_at", { ascending: false });

  if (speakerId) {
    query = query.eq("speaker_id", speakerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ series: data ?? [] });
}

// POST: Create a new series linked to a speaker
export async function POST(request: Request) {
  const body = await request.json();
  const { speakerId, seriesTicker, displayName } = body as {
    speakerId?: string;
    seriesTicker?: string;
    displayName?: string;
  };

  if (!speakerId || !seriesTicker?.trim()) {
    return NextResponse.json(
      { error: "speakerId and seriesTicker are required" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("series")
    .insert({
      speaker_id: speakerId,
      series_ticker: seriesTicker.trim().toUpperCase(),
      display_name: displayName?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Series "${seriesTicker.trim().toUpperCase()}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ series: data });
}

// DELETE: Delete a series and all its linked events/words/results
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Series id is required" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  // First, delete all events linked to this series (cascades to words, event_results, etc.)
  const { data: events } = await supabase
    .from("events")
    .select("id")
    .eq("series_id", id);

  if (events && events.length > 0) {
    const eventIds = events.map((e) => e.id);
    // Delete in proper order to respect FK constraints
    await supabase.from("event_results").delete().in("event_id", eventIds);
    await supabase.from("word_scores").delete().in("event_id", eventIds);
    await supabase.from("trades").delete().in("event_id", eventIds);
    await supabase.from("words").delete().in("event_id", eventIds);
    await supabase.from("word_clusters").delete().in("event_id", eventIds);
    await supabase.from("research_runs").delete().in("event_id", eventIds);
    await supabase.from("events").delete().in("id", eventIds);
  }

  // Then delete the series record itself
  const { error } = await supabase.from("series").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, eventsDeleted: events?.length ?? 0 });
}

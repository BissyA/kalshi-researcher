import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET: Fetch events for a series, with word results nested
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const seriesId = searchParams.get("seriesId");

  if (!seriesId) {
    return NextResponse.json(
      { error: "seriesId is required" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  // Fetch events for this series, ordered by most recent first
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, event_date, status")
    .eq("series_id", seriesId)
    .order("event_date", { ascending: false, nullsFirst: false });

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ events: [] });
  }

  // Fetch all event_results + word names for these events
  // Supabase has a default 1000 row limit, so we paginate
  const eventIds = events.map((e) => e.id);
  const allResults: { event_id: string; was_mentioned: boolean; words: unknown }[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let resultsError = null;

  while (true) {
    const { data: page, error: pageError } = await supabase
      .from("event_results")
      .select(`
        event_id,
        was_mentioned,
        words!inner ( word )
      `)
      .in("event_id", eventIds)
      .range(offset, offset + PAGE_SIZE - 1);

    if (pageError) {
      resultsError = pageError;
      break;
    }

    if (!page || page.length === 0) break;
    allResults.push(...(page as typeof allResults));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const results = allResults;

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  // Group word results by event_id
  const resultsByEvent = new Map<string, { word: string; wasMentioned: boolean }[]>();
  for (const r of results ?? []) {
    const wordData = r.words as unknown as { word: string };
    const list = resultsByEvent.get(r.event_id) ?? [];
    list.push({ word: wordData.word, wasMentioned: r.was_mentioned });
    resultsByEvent.set(r.event_id, list);
  }

  // Build response
  const enrichedEvents = events.map((e) => {
    const words = resultsByEvent.get(e.id) ?? [];
    // Sort words alphabetically
    words.sort((a, b) => a.word.localeCompare(b.word));
    return {
      id: e.id,
      title: e.title,
      eventDate: e.event_date,
      status: e.status,
      words,
    };
  });

  return NextResponse.json({ events: enrichedEvents });
}

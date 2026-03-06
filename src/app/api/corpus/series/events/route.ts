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
    .select("id, title, kalshi_event_ticker, event_date, status, category")
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
      eventTicker: e.kalshi_event_ticker,
      eventDate: e.event_date,
      status: e.status,
      category: e.category ?? null,
      words,
    };
  });

  return NextResponse.json({ events: enrichedEvents });
}

// DELETE: Remove a single event from a series and add its ticker to excluded_tickers
// so it won't be re-imported on refresh
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  const seriesId = searchParams.get("seriesId");

  if (!eventId || !seriesId) {
    return NextResponse.json(
      { error: "eventId and seriesId are required" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  // Look up the event to get its ticker and verify it belongs to this series
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, kalshi_event_ticker, series_id")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json(
      { error: `Event not found: ${eventError?.message ?? "no record"}` },
      { status: 404 }
    );
  }

  if (event.series_id !== seriesId) {
    return NextResponse.json(
      { error: "Event does not belong to this series" },
      { status: 400 }
    );
  }

  // Cascade-delete the event's dependent records (same FK order as series DELETE)
  await supabase.from("event_results").delete().eq("event_id", eventId);
  await supabase.from("word_scores").delete().eq("event_id", eventId);
  await supabase.from("trades").delete().eq("event_id", eventId);
  await supabase.from("words").delete().eq("event_id", eventId);
  await supabase.from("word_clusters").delete().eq("event_id", eventId);
  await supabase.from("research_runs").delete().eq("event_id", eventId);
  await supabase.from("events").delete().eq("id", eventId);

  // Add the ticker to the series excluded_tickers array
  const { data: series } = await supabase
    .from("series")
    .select("excluded_tickers")
    .eq("id", seriesId)
    .single();

  const currentExcluded: string[] = (series?.excluded_tickers as string[] | null) ?? [];
  if (!currentExcluded.includes(event.kalshi_event_ticker)) {
    currentExcluded.push(event.kalshi_event_ticker);
  }

  // Re-count events and words for this series
  const { count: remainingEvents } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("series_id", seriesId);

  const { data: remainingEventIds } = await supabase
    .from("events")
    .select("id")
    .eq("series_id", seriesId);

  let remainingWords = 0;
  if (remainingEventIds && remainingEventIds.length > 0) {
    const { count } = await supabase
      .from("words")
      .select("*", { count: "exact", head: true })
      .in("event_id", remainingEventIds.map((e) => e.id));
    remainingWords = count ?? 0;
  }

  await supabase
    .from("series")
    .update({
      excluded_tickers: currentExcluded,
      events_count: remainingEvents ?? 0,
      words_count: remainingWords,
    })
    .eq("id", seriesId);

  return NextResponse.json({
    success: true,
    excludedTicker: event.kalshi_event_ticker,
  });
}

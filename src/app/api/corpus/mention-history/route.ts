import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import type { MentionHistoryRow, MentionEventDetail } from "@/types/corpus";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get("speakerId");

  const supabase = getServerSupabase();

  // Fetch all event_results joined with words and events
  // Filter by speaker through: events.series_id → series.speaker_id
  // Paginate to avoid Supabase default 1000 row limit
  interface ResultRow {
    word_id: string;
    was_mentioned: boolean;
    settled_at: string | null;
    words: { word: string; kalshi_market_ticker: string };
    events: { id: string; title: string; kalshi_event_ticker: string; event_date: string | null; speaker: string; series_id: string | null };
  }

  const PAGE_SIZE = 1000;
  let offset = 0;
  const allData: ResultRow[] = [];

  while (true) {
    const { data: page, error: pageError } = await supabase
      .from("event_results")
      .select(`
        word_id,
        was_mentioned,
        settled_at,
        words!inner (
          word,
          kalshi_market_ticker
        ),
        events!inner (
          id,
          title,
          kalshi_event_ticker,
          event_date,
          speaker,
          series_id
        )
      `)
      .range(offset, offset + PAGE_SIZE - 1);

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    if (!page || page.length === 0) break;
    allData.push(...(page as unknown as ResultRow[]));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const data = allData;

  if (data.length === 0) {
    return NextResponse.json({ rows: [], totalSettledEvents: 0 });
  }

  // If speakerId is provided, filter by looking up which series belong to that speaker
  let allowedSeriesIds: Set<string> | null = null;
  if (speakerId) {
    const { data: seriesData } = await supabase
      .from("series")
      .select("id")
      .eq("speaker_id", speakerId);

    allowedSeriesIds = new Set((seriesData ?? []).map((s) => s.id));
  }

  // Group by normalized word (case-insensitive)
  const wordMap = new Map<
    string,
    { displayWord: string; events: MentionEventDetail[]; yesCount: number; noCount: number }
  >();

  const settledEventIds = new Set<string>();

  for (const row of data) {
    const wordData = row.words;
    const eventData = row.events;

    // Filter by speaker through series linkage
    if (allowedSeriesIds !== null) {
      if (!eventData.series_id || !allowedSeriesIds.has(eventData.series_id)) {
        continue;
      }
    }

    const normalizedWord = wordData.word.toLowerCase();
    settledEventIds.add(eventData.id);

    if (!wordMap.has(normalizedWord)) {
      wordMap.set(normalizedWord, {
        displayWord: wordData.word,
        events: [],
        yesCount: 0,
        noCount: 0,
      });
    }

    const entry = wordMap.get(normalizedWord)!;
    if (row.was_mentioned) {
      entry.yesCount++;
    } else {
      entry.noCount++;
    }

    entry.events.push({
      eventId: eventData.id,
      eventTitle: eventData.title,
      eventDate: eventData.event_date,
      eventTicker: eventData.kalshi_event_ticker,
      wasMentioned: row.was_mentioned,
      settledAt: row.settled_at,
    });
  }

  // Build response rows sorted by total events desc
  const rows: MentionHistoryRow[] = Array.from(wordMap.values())
    .map((entry) => ({
      word: entry.displayWord,
      yesCount: entry.yesCount,
      noCount: entry.noCount,
      totalEvents: entry.yesCount + entry.noCount,
      mentionRate: (entry.yesCount + entry.noCount) > 0
        ? entry.yesCount / (entry.yesCount + entry.noCount)
        : 0,
      events: entry.events.sort(
        (a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? "")
      ),
    }))
    .sort((a, b) => b.totalEvents - a.totalEvents || b.mentionRate - a.mentionRate);

  return NextResponse.json({
    rows,
    totalSettledEvents: settledEventIds.size,
  });
}

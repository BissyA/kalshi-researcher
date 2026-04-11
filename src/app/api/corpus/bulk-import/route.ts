import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { kalshiFetch } from "@/lib/kalshi-client";
import { inferEventType, extractWord } from "@/lib/url-parser";

export const maxDuration = 300;

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  yes_sub_title: string;
  result: string;
  status: string;
  close_time: string;
  volume: number;
}

interface KalshiEvent {
  event_ticker: string;
  title: string;
  sub_title?: string;
  strike_date?: string | null;
  markets?: KalshiMarket[];
}

export async function POST() {
  const supabase = getServerSupabase();

  const { data: allSeries, error: seriesError } = await supabase
    .from("series")
    .select("id, series_ticker, speaker_id, excluded_tickers, speakers!inner(name)")
    .order("series_ticker");

  if (seriesError || !allSeries?.length) {
    return NextResponse.json({ error: seriesError?.message ?? "No series found" }, { status: 500 });
  }

  let totalEvents = 0;
  let totalWords = 0;
  let totalResults = 0;
  const errors: string[] = [];

  for (const series of allSeries) {
    const seriesTicker = series.series_ticker;
    const speakerName = (series.speakers as unknown as { name: string }).name;
    const excludedTickers = new Set<string>((series.excluded_tickers as string[] | null) ?? []);

    try {
      // Fetch all settled events for this series
      const allEvents: KalshiEvent[] = [];
      let cursor: string | undefined;
      do {
        const params = new URLSearchParams({
          series_ticker: seriesTicker,
          status: "settled",
          with_nested_markets: "true",
          limit: "200",
        });
        if (cursor) params.set("cursor", cursor);
        const res = await kalshiFetch("GET", `/events?${params.toString()}`);
        if (!res.ok) { errors.push(`${seriesTicker}: Kalshi API ${res.status}`); break; }
        const data = await res.json();
        allEvents.push(...(data.events ?? []));
        cursor = data.cursor || undefined;
      } while (cursor);

      for (const ev of allEvents) {
        if (excludedTickers.has(ev.event_ticker)) continue;
        let markets = ev.markets ?? [];
        if (markets.length === 0) {
          const hr = await kalshiFetch("GET", `/historical/markets?event_ticker=${ev.event_ticker}&limit=200`);
          if (hr.ok) markets = (await hr.json()).markets ?? [];
          else continue;
        }
        const settled = markets.filter((m) => m.result === "yes" || m.result === "no");
        if (!settled.length) continue;

        let eventDate: string | null = null;
        if (ev.sub_title) {
          const parsed = new Date(ev.sub_title.replace(/^On\s+/i, ""));
          if (!isNaN(parsed.getTime())) eventDate = parsed.toISOString();
        }
        if (!eventDate) eventDate = ev.strike_date ?? settled[0]?.close_time ?? null;

        const { data: existing } = await supabase
          .from("events").select("id, series_id").eq("kalshi_event_ticker", ev.event_ticker).maybeSingle();
        if (existing?.series_id && existing.series_id !== series.id) continue;

        const { data: dbEvent, error: eErr } = await supabase
          .from("events")
          .upsert({
            kalshi_event_ticker: ev.event_ticker, title: ev.title, speaker: speakerName,
            event_type: inferEventType(ev.title), event_date: eventDate,
            series_id: existing?.series_id ?? series.id, status: "completed",
            updated_at: new Date().toISOString(),
          }, { onConflict: "kalshi_event_ticker" })
          .select().single();
        if (eErr || !dbEvent) continue;
        totalEvents++;

        const seenWords = new Set<string>();
        const wordRows = settled.flatMap((m) => {
          const word = extractWord(m.ticker, ev.event_ticker, m.yes_sub_title);
          if (seenWords.has(word.toLowerCase())) return [];
          seenWords.add(word.toLowerCase());
          return [{ event_id: dbEvent.id, kalshi_market_ticker: m.ticker, word }];
        });
        if (wordRows.length) {
          await supabase.from("words").upsert(wordRows, { onConflict: "kalshi_market_ticker", ignoreDuplicates: true });
          totalWords += wordRows.length;
        }

        const { data: dbWords } = await supabase.from("words").select("id, kalshi_market_ticker").eq("event_id", dbEvent.id);
        if (!dbWords) continue;
        const tickerToId = new Map(dbWords.map((w) => [w.kalshi_market_ticker, w.id]));
        const resultRows = settled.filter((m) => tickerToId.has(m.ticker)).map((m) => ({
          event_id: dbEvent.id, word_id: tickerToId.get(m.ticker)!, was_mentioned: m.result === "yes", settled_at: new Date().toISOString(),
        }));
        if (resultRows.length) {
          await supabase.from("event_results").upsert(resultRows, { onConflict: "event_id,word_id" });
          totalResults += resultRows.length;
        }
      }

      // Update series stats
      const { count: evCount } = await supabase.from("events").select("*", { count: "exact", head: true }).eq("series_id", series.id);
      const { data: evIds } = await supabase.from("events").select("id").eq("series_id", series.id);
      let wCount = 0;
      if (evIds?.length) {
        const { count } = await supabase.from("words").select("*", { count: "exact", head: true }).in("event_id", evIds.map((e) => e.id));
        wCount = count ?? 0;
      }
      await supabase.from("series").update({ events_count: evCount ?? 0, words_count: wCount, last_imported_at: new Date().toISOString() }).eq("id", series.id);
    } catch (err) {
      errors.push(`${seriesTicker}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    message: `${totalEvents} events, ${totalWords} words, ${totalResults} results across ${allSeries.length} series`,
    totalEvents, totalWords, totalResults, totalSeries: allSeries.length, errors,
  });
}

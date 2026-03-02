import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";
import { inferEventType, extractWord } from "@/lib/url-parser";
import { getServerSupabase } from "@/lib/supabase";

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
  markets?: KalshiMarket[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { seriesId } = body as { seriesId?: string };

    if (!seriesId) {
      return NextResponse.json(
        { error: "seriesId is required" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Look up the series record to get the ticker and speaker
    const { data: series, error: seriesError } = await supabase
      .from("series")
      .select("id, series_ticker, speaker_id, speakers!inner(name)")
      .eq("id", seriesId)
      .single();

    if (seriesError || !series) {
      return NextResponse.json(
        { error: `Series not found: ${seriesError?.message ?? "no record"}` },
        { status: 404 }
      );
    }

    const seriesTicker = series.series_ticker;
    const speakerName = (series.speakers as unknown as { name: string }).name;

    const errors: string[] = [];
    let eventsImported = 0;
    let wordsImported = 0;
    let resultsImported = 0;

    // Fetch all settled events for this series (paginated)
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

      const response = await kalshiFetch("GET", `/events?${params.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        return NextResponse.json(
          { error: `Kalshi API error fetching events: ${response.status} ${text}` },
          { status: 500 }
        );
      }

      const data = await response.json();
      const events: KalshiEvent[] = data.events ?? [];
      allEvents.push(...events);
      cursor = data.cursor || undefined;
    } while (cursor);

    if (allEvents.length === 0) {
      return NextResponse.json({
        message: `No settled events found for series ${seriesTicker}`,
        eventsImported: 0,
        wordsImported: 0,
        resultsImported: 0,
        errors: [],
      });
    }

    for (const kalshiEvent of allEvents) {
      try {
        let markets = kalshiEvent.markets ?? [];

        // If no nested markets (past historical cutoff), fetch from historical endpoint
        if (markets.length === 0) {
          const histResponse = await kalshiFetch(
            "GET",
            `/historical/markets?event_ticker=${kalshiEvent.event_ticker}&limit=200`
          );
          if (histResponse.ok) {
            const histData = await histResponse.json();
            markets = histData.markets ?? [];
          } else {
            errors.push(
              `Failed to fetch historical markets for ${kalshiEvent.event_ticker}: HTTP ${histResponse.status}`
            );
            continue;
          }
        }

        // Filter to markets with results
        const settledMarkets = markets.filter(
          (m) => m.result === "yes" || m.result === "no"
        );

        if (settledMarkets.length === 0) {
          continue;
        }

        const eventType = inferEventType(kalshiEvent.title);
        const eventDate = settledMarkets[0]?.close_time ?? null;

        // Upsert event — speaker comes from the series record, NOT inferred
        const { data: dbEvent, error: eventError } = await supabase
          .from("events")
          .upsert(
            {
              kalshi_event_ticker: kalshiEvent.event_ticker,
              title: kalshiEvent.title,
              speaker: speakerName,
              event_type: eventType,
              event_date: eventDate,
              series_id: seriesId,
              status: "completed",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "kalshi_event_ticker" }
          )
          .select()
          .single();

        if (eventError || !dbEvent) {
          errors.push(
            `Failed to upsert event ${kalshiEvent.event_ticker}: ${eventError?.message}`
          );
          continue;
        }

        eventsImported++;

        // Upsert words — deduplicate by (event_id, word) to avoid constraint violations
        const seenWords = new Set<string>();
        const wordRows: { event_id: string; kalshi_market_ticker: string; word: string }[] = [];

        for (const m of settledMarkets) {
          const word = extractWord(m.ticker, kalshiEvent.event_ticker, m.yes_sub_title);
          const normalizedWord = word.toLowerCase();

          if (seenWords.has(normalizedWord)) {
            // Skip duplicate words within the same event (different tickers resolving to same word)
            continue;
          }
          seenWords.add(normalizedWord);

          wordRows.push({
            event_id: dbEvent.id,
            kalshi_market_ticker: m.ticker,
            word,
          });
        }

        if (wordRows.length > 0) {
          const { error: wordsError } = await supabase
            .from("words")
            .upsert(wordRows, { onConflict: "kalshi_market_ticker", ignoreDuplicates: true });

          if (wordsError) {
            errors.push(
              `Failed to upsert words for ${kalshiEvent.event_ticker}: ${wordsError.message}`
            );
            continue;
          }

          wordsImported += wordRows.length;
        }

        // Fetch word IDs for event_results
        const { data: dbWords } = await supabase
          .from("words")
          .select("id, kalshi_market_ticker")
          .eq("event_id", dbEvent.id);

        if (!dbWords) continue;

        const tickerToId = new Map(
          dbWords.map((w) => [w.kalshi_market_ticker, w.id])
        );

        // Upsert event_results
        const resultRows = settledMarkets
          .filter((m) => tickerToId.has(m.ticker))
          .map((m) => ({
            event_id: dbEvent.id,
            word_id: tickerToId.get(m.ticker)!,
            was_mentioned: m.result === "yes",
            settled_at: new Date().toISOString(),
          }));

        if (resultRows.length > 0) {
          const { error: resultsError } = await supabase
            .from("event_results")
            .upsert(resultRows, { onConflict: "event_id,word_id" });

          if (resultsError) {
            errors.push(
              `Failed to upsert results for ${kalshiEvent.event_ticker}: ${resultsError.message}`
            );
          } else {
            resultsImported += resultRows.length;
          }
        }
      } catch (err) {
        errors.push(
          `Error processing ${kalshiEvent.event_ticker}: ${(err as Error).message}`
        );
      }
    }

    // Update series stats
    await supabase
      .from("series")
      .update({
        events_count: eventsImported,
        words_count: wordsImported,
        last_imported_at: new Date().toISOString(),
      })
      .eq("id", seriesId);

    return NextResponse.json({
      message: `Imported ${eventsImported} events, ${wordsImported} words, ${resultsImported} results`,
      eventsImported,
      wordsImported,
      resultsImported,
      totalEventsFound: allEvents.length,
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { kalshiFetch } from "@/lib/kalshi-client";
import { settleEvent, type WordResult } from "@/lib/settlement";

interface MarketResult {
  wordId: string;
  ticker: string;
  word: string;
  result: "yes" | "no" | null;
  status: string;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { eventId } = body as { eventId?: string };

    const supabase = getServerSupabase();

    // Find events to check — skip completed unless a specific eventId is given
    let eventsQuery = supabase
      .from("events")
      .select("id, title, kalshi_event_ticker, status");

    if (eventId) {
      eventsQuery = eventsQuery.eq("id", eventId);
    } else {
      eventsQuery = eventsQuery.neq("status", "completed");
    }

    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      return NextResponse.json(
        { error: `Database error: ${eventsError.message}` },
        { status: 500 }
      );
    }

    if (!events || events.length === 0) {
      return NextResponse.json({
        message: "No unsettled events found",
        results: [],
      });
    }

    const allResults = [];

    for (const event of events) {
      // Refresh event_date from Kalshi sub_title (recurring events update this)
      try {
        const eventRes = await kalshiFetch("GET", `/events/${event.kalshi_event_ticker}`);
        if (eventRes.ok) {
          const eventData = await eventRes.json();
          const subTitle = eventData.event?.sub_title;
          if (subTitle) {
            const cleaned = subTitle.replace(/^On\s+/i, "");
            const parsed = new Date(cleaned);
            if (!isNaN(parsed.getTime())) {
              await supabase
                .from("events")
                .update({ event_date: parsed.toISOString() })
                .eq("id", event.id);
            }
          }
        }
      } catch {
        // non-critical, continue with settlement
      }

      const { data: words } = await supabase
        .from("words")
        .select("id, word, kalshi_market_ticker")
        .eq("event_id", event.id);

      if (!words || words.length === 0) continue;

      // Check for already-settled words
      const { data: existingResults } = await supabase
        .from("event_results")
        .select("word_id, was_mentioned")
        .eq("event_id", event.id);

      const alreadySettled = new Map(
        (existingResults ?? []).map((r) => [r.word_id, r.was_mentioned])
      );

      const marketResults: MarketResult[] = [];
      let settledCount = alreadySettled.size;
      let failedCount = 0;

      for (const word of words) {
        // Skip words already resolved
        if (alreadySettled.has(word.id)) {
          marketResults.push({
            wordId: word.id,
            ticker: word.kalshi_market_ticker,
            word: word.word,
            result: alreadySettled.get(word.id) ? "yes" : "no",
            status: "already_settled",
          });
          continue;
        }

        try {
          const response = await kalshiFetch(
            "GET",
            `/markets/${word.kalshi_market_ticker}`
          );

          if (!response.ok) {
            failedCount++;
            marketResults.push({
              wordId: word.id,
              ticker: word.kalshi_market_ticker,
              word: word.word,
              result: null,
              status: "api_error",
              error: `HTTP ${response.status}`,
            });
            continue;
          }

          const data = await response.json();
          const market = data.market;
          const marketResult = market?.result ?? "";
          const marketStatus = market?.status ?? "";

          if (marketResult === "yes" || marketResult === "no") {
            settledCount++;
            marketResults.push({
              wordId: word.id,
              ticker: word.kalshi_market_ticker,
              word: word.word,
              result: marketResult,
              status: marketStatus,
            });
          } else {
            marketResults.push({
              wordId: word.id,
              ticker: word.kalshi_market_ticker,
              word: word.word,
              result: null,
              status: marketStatus || "unknown",
            });
          }
        } catch (err) {
          failedCount++;
          marketResults.push({
            wordId: word.id,
            ticker: word.kalshi_market_ticker,
            word: word.word,
            result: null,
            status: "fetch_error",
            error: (err as Error).message,
          });
        }
      }

      const eventCheck = {
        eventId: event.id,
        eventTitle: event.title,
        totalWords: words.length,
        settledWords: settledCount,
        unsettledWords: words.length - settledCount,
        failedChecks: failedCount,
        settled: false as boolean,
        marketResults,
        settlement: null as {
          resultsRecorded: number;
          tradesSettled: number;
          totalPnlCents: number;
        } | null,
      };

      // Auto-resolve if ALL words have results and no errors
      if (settledCount === words.length && failedCount === 0) {
        // Only include words that have a definitive result
        const wordResults: WordResult[] = marketResults
          .filter((mr) => mr.result === "yes" || mr.result === "no")
          .map((mr) => ({
            wordId: mr.wordId,
            wasMentioned: mr.result === "yes",
          }));

        const settlement = await settleEvent(event.id, wordResults);
        eventCheck.settled = true;
        eventCheck.settlement = {
          resultsRecorded: settlement.resultsRecorded,
          tradesSettled: settlement.tradesSettled,
          totalPnlCents: settlement.totalPnlCents,
        };
      }

      allResults.push(eventCheck);
    }

    const settledEvents = allResults.filter((r) => r.settled);

    return NextResponse.json({
      message: `Checked ${allResults.length} event(s), ${settledEvents.length} fully settled`,
      results: allResults,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

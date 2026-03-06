import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";
import { extractWord } from "@/lib/url-parser";
import { getServerSupabase } from "@/lib/supabase";

// POST /api/events/refresh-markets
// Re-fetches markets from Kalshi for an existing event and upserts any new words.
// Body: { eventId: string }
// Returns: { newWords: number, totalWords: number }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId } = body as { eventId?: string };

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Look up the event to get the Kalshi event ticker
    const { data: dbEvent, error: eventError } = await supabase
      .from("events")
      .select("id, kalshi_event_ticker")
      .eq("id", eventId)
      .single();

    if (eventError || !dbEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const eventTicker = dbEvent.kalshi_event_ticker;

    // Fetch current markets from Kalshi
    const kalshiResponse = await kalshiFetch("GET", `/events/${eventTicker}`);
    if (!kalshiResponse.ok) {
      const text = await kalshiResponse.text();
      return NextResponse.json(
        { error: `Kalshi API error: ${kalshiResponse.status} ${text}` },
        { status: kalshiResponse.status }
      );
    }

    const data = await kalshiResponse.json();
    const kalshiMarkets = data.markets ?? data.event?.markets ?? [];

    // Get existing words for this event
    const { data: existingWords } = await supabase
      .from("words")
      .select("kalshi_market_ticker")
      .eq("event_id", eventId);

    const existingTickers = new Set(
      (existingWords ?? []).map((w) => w.kalshi_market_ticker)
    );

    // Build new words to upsert (active/open markets not already in DB)
    interface KalshiMarket {
      ticker: string;
      event_ticker: string;
      yes_sub_title: string;
      status: string;
    }

    const newWords = (kalshiMarkets as KalshiMarket[])
      .filter(
        (m) =>
          (m.status === "active" || m.status === "open") &&
          !existingTickers.has(m.ticker)
      )
      .map((m) => ({
        event_id: eventId,
        kalshi_market_ticker: m.ticker,
        word: extractWord(m.ticker, eventTicker, m.yes_sub_title),
      }));

    if (newWords.length > 0) {
      const { error: upsertError } = await supabase
        .from("words")
        .upsert(newWords, { onConflict: "kalshi_market_ticker" });

      if (upsertError) {
        return NextResponse.json(
          { error: `Failed to upsert words: ${upsertError.message}` },
          { status: 500 }
        );
      }
    }

    // Fetch the full updated word list
    const { data: allWords } = await supabase
      .from("words")
      .select("*")
      .eq("event_id", eventId)
      .order("word");

    return NextResponse.json({
      newWords: newWords.length,
      totalWords: (allWords ?? []).length,
      words: allWords ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

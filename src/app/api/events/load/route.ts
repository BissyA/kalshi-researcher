import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";
import { extractEventTicker, inferSpeaker, inferEventType, extractWord } from "@/lib/url-parser";
import { getServerSupabase } from "@/lib/supabase";

interface KalshiMarketResponse {
  ticker: string;
  event_ticker: string;
  title: string;
  yes_sub_title: string;
  status: string;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  no_bid_dollars: string;
  no_ask_dollars: string;
  last_price_dollars: string;
  volume_fp: string;
  open_interest_fp: string;
  close_time: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, speaker: manualSpeaker, eventType: manualEventType } = body;

    if (!url) {
      return NextResponse.json({ error: "URL or event ticker is required" }, { status: 400 });
    }

    const eventTicker = extractEventTicker(url);

    // Fetch event data from Kalshi
    const kalshiResponse = await kalshiFetch("GET", `/events/${eventTicker}`);

    if (!kalshiResponse.ok) {
      const text = await kalshiResponse.text();
      return NextResponse.json(
        { error: `Kalshi API error: ${kalshiResponse.status} ${text}` },
        { status: kalshiResponse.status }
      );
    }

    const data = await kalshiResponse.json();
    const event = data.event;
    const kalshiMarkets: KalshiMarketResponse[] = data.markets ?? event.markets ?? [];

    const speaker = manualSpeaker || inferSpeaker(event.title);
    const eventType = manualEventType || inferEventType(event.title);

    // Find event date from the first market's close_time
    const eventDate = kalshiMarkets[0]?.close_time ?? null;

    const supabase = getServerSupabase();

    // Upsert event
    const { data: dbEvent, error: eventError } = await supabase
      .from("events")
      .upsert(
        {
          kalshi_event_ticker: eventTicker,
          title: event.title,
          speaker,
          event_type: eventType,
          event_date: eventDate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "kalshi_event_ticker" }
      )
      .select()
      .single();

    if (eventError) {
      return NextResponse.json({ error: `Database error: ${eventError.message}` }, { status: 500 });
    }

    // Upsert words
    const words = kalshiMarkets
      .filter((m) => m.status === "active" || m.status === "open")
      .map((m) => ({
        event_id: dbEvent.id,
        kalshi_market_ticker: m.ticker,
        word: extractWord(m.ticker, eventTicker, m.yes_sub_title),
      }));

    if (words.length > 0) {
      await supabase.from("words").upsert(words, {
        onConflict: "kalshi_market_ticker",
      });
    }

    // Fetch the full word list with IDs
    const { data: dbWords } = await supabase
      .from("words")
      .select("*")
      .eq("event_id", dbEvent.id)
      .order("word");

    // Build response with current prices
    const wordsWithPrices = (dbWords ?? []).map((w) => {
      const market = kalshiMarkets.find((m) => m.ticker === w.kalshi_market_ticker);
      return {
        id: w.id,
        ticker: w.kalshi_market_ticker,
        word: w.word,
        yesPrice: market ? parseFloat(market.yes_bid_dollars) : 0,
        noPrice: market ? parseFloat(market.no_bid_dollars) : 0,
        yesAsk: market ? parseFloat(market.yes_ask_dollars) : 0,
        lastPrice: market ? parseFloat(market.last_price_dollars) : 0,
        volume: market ? market.volume_fp : "0",
      };
    });

    return NextResponse.json({
      event: dbEvent,
      words: wordsWithPrices,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

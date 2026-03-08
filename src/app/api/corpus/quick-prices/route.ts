import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";
import { extractEventTicker, extractWord } from "@/lib/url-parser";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get("url");

  if (!input) {
    return NextResponse.json({ error: "url parameter is required" }, { status: 400 });
  }

  try {
    let eventTicker = extractEventTicker(input);

    let kalshiResponse = await kalshiFetch("GET", `/events/${eventTicker}`);

    // If 404, the ticker might be a market-level ticker — look up the event via the market
    if (kalshiResponse.status === 404) {
      const marketResponse = await kalshiFetch("GET", `/markets/${eventTicker}`);
      if (marketResponse.ok) {
        const marketData = await marketResponse.json();
        const actualEventTicker = marketData.market?.event_ticker;
        if (actualEventTicker) {
          eventTicker = actualEventTicker;
          kalshiResponse = await kalshiFetch("GET", `/events/${eventTicker}`);
        }
      }
    }

    if (!kalshiResponse.ok) {
      const text = await kalshiResponse.text();
      return NextResponse.json(
        { error: `Kalshi API error: ${kalshiResponse.status} ${text}` },
        { status: kalshiResponse.status }
      );
    }

    const data = await kalshiResponse.json();
    const event = data.event;
    const markets: {
      ticker: string;
      event_ticker: string;
      yes_sub_title: string;
      status: string;
      yes_bid_dollars: string;
      yes_ask_dollars: string;
      no_ask_dollars: string;
      last_price_dollars: string;
      volume_fp: string;
    }[] = data.markets ?? event.markets ?? [];

    const words = markets
      .filter((m) => m.status === "active" || m.status === "open")
      .map((m) => ({
        marketTicker: m.ticker,
        word: extractWord(m.ticker, eventTicker, m.yes_sub_title),
        yesBid: parseFloat(m.yes_bid_dollars) || 0,
        yesAsk: parseFloat(m.yes_ask_dollars) || 0,
        noAsk: parseFloat(m.no_ask_dollars) || 0,
        lastPrice: parseFloat(m.last_price_dollars) || 0,
        volume: m.volume_fp ?? "0",
      }));

    return NextResponse.json({
      eventTicker,
      eventTitle: event.title ?? eventTicker,
      words,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

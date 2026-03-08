import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";
import { getServerSupabase } from "@/lib/supabase";

interface KalshiFill {
  fill_id: string;
  ticker: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  count: number;
  yes_price: number;
  no_price: number;
  fee_cost: string;
  created_time: string;
  is_taker: boolean;
}

interface KalshiSettlement {
  ticker: string;
  event_ticker?: string;
  market_result: "yes" | "no" | "void";
  yes_count: number;
  no_count: number;
  yes_total_cost: number;
  no_total_cost: number;
  revenue: number;
  settled_time: string;
  fee_cost: string;
}

interface ProcessedTrade {
  ticker: string;
  side: "yes" | "no";
  quantity: number;
  entryPriceCents: number;
  exitPriceCents: number;
  feeCents: number;
  pnlCents: number;
  pnlAfterFeesCents: number;
  openTimestamp: string;
  closeTimestamp: string;
  closedVia: "sell" | "settlement";
}

interface DailyPnl {
  date: string;
  pnlCents: number;
  feesCents: number;
  pnlAfterFeesCents: number;
  tradeCount: number;
}

interface PositionMismatch {
  ticker: string;
  ourYes: number;
  settlementYes: number;
  ourNo: number;
  settlementNo: number;
}

async function fetchAllPaginated<T>(endpoint: string, key: string): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);

    const res = await kalshiFetch("GET", `${endpoint}?${params}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kalshi API error (${res.status}): ${text}`);
    }

    const data = await res.json();
    const items = data[key] ?? [];
    all.push(...items);

    if (!data.cursor || items.length === 0) break;
    cursor = data.cursor;
  }

  return all;
}

interface PositionEntry {
  fill: KalshiFill;
  remaining: number;
  remainingFeeCents: number;
}

/**
 * Kalshi fill matching logic:
 *
 * On Kalshi, ALL fills create positions. The `side` field determines the position type
 * (YES or NO), and the `action` field (buy/sell) indicates order book side, NOT whether
 * the position is opening or closing.
 *
 * Exiting a position is done by acquiring the opposite side:
 *   - To exit YES: acquire NO contracts (fill side=no)
 *   - To exit NO: acquire YES contracts (fill side=yes)
 *
 * At settlement, offsetting YES+NO positions net out (one side pays 100, the other 0).
 * The P&L for an offset pair: 100 - yes_entry - no_entry per contract.
 *
 * We match offsetting positions FIFO, then settle any remaining single-side positions.
 */
function matchFillsAndSettlements(
  fills: KalshiFill[],
  settlements: KalshiSettlement[]
): { trades: ProcessedTrade[]; diagnostics: { positionMismatches: PositionMismatch[] } } {
  const settlementMap = new Map<string, KalshiSettlement>();
  for (const s of settlements) {
    settlementMap.set(s.ticker, s);
  }

  const byTicker = new Map<string, KalshiFill[]>();
  for (const fill of fills) {
    const existing = byTicker.get(fill.ticker) ?? [];
    existing.push(fill);
    byTicker.set(fill.ticker, existing);
  }

  const trades: ProcessedTrade[] = [];
  const positionMismatches: PositionMismatch[] = [];

  for (const [ticker, tickerFills] of byTicker) {
    tickerFills.sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());

    // ALL fills create positions — side determines the queue, action is irrelevant
    const yesQueue: PositionEntry[] = [];
    const noQueue: PositionEntry[] = [];

    for (const fill of tickerFills) {
      const feeCents = Math.round(parseFloat(fill.fee_cost || "0") * 100);
      const queue = fill.side === "yes" ? yesQueue : noQueue;
      queue.push({ fill, remaining: fill.count, remainingFeeCents: feeCents });
    }

    // Validate against settlement
    const settlement = settlementMap.get(ticker);
    const ourYes = yesQueue.reduce((s, e) => s + e.remaining, 0);
    const ourNo = noQueue.reduce((s, e) => s + e.remaining, 0);
    if (settlement && (ourYes !== settlement.yes_count || ourNo !== settlement.no_count)) {
      positionMismatches.push({
        ticker,
        ourYes,
        settlementYes: settlement.yes_count,
        ourNo,
        settlementNo: settlement.no_count,
      });
    }

    // Phase 1: Match offsetting YES vs NO positions (FIFO)
    // This represents "exits" — user acquired opposite side to lock in P&L
    while (yesQueue.length > 0 && noQueue.length > 0 &&
           yesQueue[0].remaining > 0 && noQueue[0].remaining > 0) {
      const yesEntry = yesQueue[0];
      const noEntry = noQueue[0];
      const matched = Math.min(yesEntry.remaining, noEntry.remaining);

      const yesPrice = yesEntry.fill.yes_price;
      const noPrice = noEntry.fill.no_price;

      // P&L = 100 (guaranteed payout from one side) - yes_cost - no_cost
      const pnlPerContract = 100 - yesPrice - noPrice;
      const pnl = pnlPerContract * matched;

      // Present as a YES trade: entry=yes_price, exit=(100-no_price)
      // This matches Kalshi's CSV format where exit is the YES price at time of exit
      const exitPriceCents = 100 - noPrice;

      // Fees from both sides
      const isLastYes = matched === yesEntry.remaining;
      const isLastNo = matched === noEntry.remaining;
      const yesFee = isLastYes
        ? yesEntry.remainingFeeCents
        : Math.round(yesEntry.remainingFeeCents * matched / yesEntry.remaining);
      const noFee = isLastNo
        ? noEntry.remainingFeeCents
        : Math.round(noEntry.remainingFeeCents * matched / noEntry.remaining);
      const totalFee = yesFee + noFee;

      // Determine which came first (the open) and which came second (the close)
      const yesTime = new Date(yesEntry.fill.created_time).getTime();
      const noTime = new Date(noEntry.fill.created_time).getTime();
      const openTimestamp = yesTime <= noTime ? yesEntry.fill.created_time : noEntry.fill.created_time;
      const closeTimestamp = yesTime <= noTime ? noEntry.fill.created_time : yesEntry.fill.created_time;
      const side = yesTime <= noTime ? "yes" as const : "no" as const;
      const entryPrice = side === "yes" ? yesPrice : noPrice;

      trades.push({
        ticker,
        side,
        quantity: matched,
        entryPriceCents: entryPrice,
        exitPriceCents: side === "yes" ? exitPriceCents : (100 - yesPrice),
        feeCents: totalFee,
        pnlCents: pnl,
        pnlAfterFeesCents: pnl - totalFee,
        openTimestamp,
        closeTimestamp,
        closedVia: "sell",
      });

      yesEntry.remaining -= matched;
      yesEntry.remainingFeeCents -= yesFee;
      noEntry.remaining -= matched;
      noEntry.remainingFeeCents -= noFee;
      if (yesEntry.remaining <= 0) yesQueue.shift();
      if (noEntry.remaining <= 0) noQueue.shift();
    }

    // Phase 2: Settle remaining unmatched positions via settlement
    if (!settlement) continue;
    const resultIsYes = settlement.market_result === "yes";

    for (const entry of yesQueue) {
      if (entry.remaining <= 0) continue;
      const exitPrice = resultIsYes ? 100 : 0;
      const entryPrice = entry.fill.yes_price;
      const pnl = (exitPrice - entryPrice) * entry.remaining;

      trades.push({
        ticker,
        side: "yes",
        quantity: entry.remaining,
        entryPriceCents: entryPrice,
        exitPriceCents: exitPrice,
        feeCents: entry.remainingFeeCents,
        pnlCents: pnl,
        pnlAfterFeesCents: pnl - entry.remainingFeeCents,
        openTimestamp: entry.fill.created_time,
        closeTimestamp: settlement.settled_time,
        closedVia: "settlement",
      });
      entry.remaining = 0;
    }

    for (const entry of noQueue) {
      if (entry.remaining <= 0) continue;
      const exitPrice = resultIsYes ? 0 : 100;
      const entryPrice = entry.fill.no_price;
      const pnl = (exitPrice - entryPrice) * entry.remaining;

      trades.push({
        ticker,
        side: "no",
        quantity: entry.remaining,
        entryPriceCents: entryPrice,
        exitPriceCents: exitPrice,
        feeCents: entry.remainingFeeCents,
        pnlCents: pnl,
        pnlAfterFeesCents: pnl - entry.remainingFeeCents,
        openTimestamp: entry.fill.created_time,
        closeTimestamp: settlement.settled_time,
        closedVia: "settlement",
      });
      entry.remaining = 0;
    }
  }

  return { trades, diagnostics: { positionMismatches } };
}

function buildDailyPnl(trades: ProcessedTrade[]): DailyPnl[] {
  const dailyMap = new Map<string, DailyPnl>();

  for (const trade of trades) {
    const date = trade.closeTimestamp.slice(0, 10);
    const existing = dailyMap.get(date) ?? {
      date,
      pnlCents: 0,
      feesCents: 0,
      pnlAfterFeesCents: 0,
      tradeCount: 0,
    };
    existing.pnlCents += trade.pnlCents;
    existing.feesCents += trade.feeCents;
    existing.pnlAfterFeesCents += trade.pnlAfterFeesCents;
    existing.tradeCount += 1;
    dailyMap.set(date, existing);
  }

  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Simple in-memory cache
let cachedResult: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bustCache = url.searchParams.has("refresh");

    // Check cache
    if (!bustCache && cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cachedResult.data);
    }

    // Fetch fills + settlements in parallel
    const [portfolioFills, historicalFills, settlements] = await Promise.all([
      fetchAllPaginated<KalshiFill>("/portfolio/fills", "fills"),
      fetchAllPaginated<KalshiFill>("/historical/fills", "fills"),
      fetchAllPaginated<KalshiSettlement>("/portfolio/settlements", "settlements"),
    ]);

    // Deduplicate fills by fill_id
    const fillMap = new Map<string, KalshiFill>();
    for (const fill of [...historicalFills, ...portfolioFills]) {
      fillMap.set(fill.fill_id, fill);
    }
    const allFills = Array.from(fillMap.values());

    // Match fills + settlements into trades
    const { trades, diagnostics } = matchFillsAndSettlements(allFills, settlements);

    // Sort trades by close time
    trades.sort((a, b) => new Date(a.closeTimestamp).getTime() - new Date(b.closeTimestamp).getTime());

    // Calculate totals
    const totalPnlCents = trades.reduce((sum, t) => sum + t.pnlCents, 0);
    const totalFeesCents = trades.reduce((sum, t) => sum + t.feeCents, 0);
    const totalPnlAfterFeesCents = trades.reduce((sum, t) => sum + t.pnlAfterFeesCents, 0);

    // Build daily P&L
    const dailyPnl = buildDailyPnl(trades);

    // Build cumulative P&L for chart
    let cumulative = 0;
    const cumulativePnl = dailyPnl.map((d) => {
      cumulative += d.pnlAfterFeesCents;
      return { date: d.date, cumulativeCents: cumulative, dailyCents: d.pnlAfterFeesCents };
    });

    // Group by event ticker for per-event table
    const eventMap = new Map<string, {
      eventTicker: string;
      trades: ProcessedTrade[];
      pnlCents: number;
      feesCents: number;
      pnlAfterFeesCents: number;
      firstDate: string;
      lastDate: string;
    }>();

    for (const trade of trades) {
      const parts = trade.ticker.split("-");
      const eventTicker = parts.length >= 2 ? parts.slice(0, -1).join("-") : trade.ticker;

      const existing = eventMap.get(eventTicker) ?? {
        eventTicker,
        trades: [],
        pnlCents: 0,
        feesCents: 0,
        pnlAfterFeesCents: 0,
        firstDate: trade.closeTimestamp,
        lastDate: trade.closeTimestamp,
      };
      existing.trades.push(trade);
      existing.pnlCents += trade.pnlCents;
      existing.feesCents += trade.feeCents;
      existing.pnlAfterFeesCents += trade.pnlAfterFeesCents;
      if (trade.closeTimestamp < existing.firstDate) existing.firstDate = trade.closeTimestamp;
      if (trade.closeTimestamp > existing.lastDate) existing.lastDate = trade.closeTimestamp;
      eventMap.set(eventTicker, existing);
    }

    const eventsRaw = Array.from(eventMap.values()).sort(
      (a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
    );

    // Look up event titles from Supabase
    const eventTickers = eventsRaw.map((e) => e.eventTicker);
    const supabase = getServerSupabase();
    const { data: dbEvents } = await supabase
      .from("events")
      .select("kalshi_event_ticker, title")
      .in("kalshi_event_ticker", eventTickers);

    const titleMap = new Map<string, string>();
    for (const ev of dbEvents ?? []) {
      titleMap.set(ev.kalshi_event_ticker, ev.title);
    }

    // Fallback: fetch titles from Kalshi API for events not in Supabase
    const missingTickers = eventTickers.filter((t) => !titleMap.has(t));
    if (missingTickers.length > 0) {
      const kalshiFetches = missingTickers.map(async (ticker) => {
        try {
          const res = await kalshiFetch("GET", `/events/${ticker}`);
          if (res.ok) {
            const data = await res.json();
            const title = data.event?.title;
            if (title) titleMap.set(ticker, title);
          }
        } catch {
          // skip — will fall back to ticker
        }
      });
      await Promise.all(kalshiFetches);
    }

    const events = eventsRaw.map((e) => ({
      ...e,
      title: titleMap.get(e.eventTicker) ?? null,
    }));

    const result = {
      summary: {
        totalTrades: trades.length,
        totalPnlCents,
        totalFeesCents,
        totalPnlAfterFeesCents,
        totalFills: allFills.length,
        totalSettlements: settlements.length,
      },
      diagnostics,
      dailyPnl,
      cumulativePnl,
      events,
      trades,
    };

    // Cache result
    cachedResult = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";
import { getServerSupabase } from "@/lib/supabase";

// Raw fill shape from Kalshi API (supports both pre- and post-maintenance formats)
type RawFill = Record<string, unknown>;
type RawSettlement = Record<string, unknown>;

interface KalshiFill {
  fill_id: string;
  ticker: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  count: number;       // contracts (normalized to number)
  yes_price: number;   // cents (normalized from dollars string if needed)
  no_price: number;    // cents (normalized from dollars string if needed)
  fee_cost: string;
  created_time: string;
  is_taker: boolean;
}

interface KalshiSettlement {
  ticker: string;
  event_ticker?: string;
  market_result: "yes" | "no" | "void";
  yes_count: number;   // normalized to number
  no_count: number;    // normalized to number
  yes_total_cost: number;
  no_total_cost: number;
  revenue: number;
  settled_time: string;
  fee_cost: string;
}

// Normalize a raw fill from the API into our internal KalshiFill format.
// Kalshi renamed fields after their 2026-03-12 maintenance:
//   count → count_fp (string)
//   yes_price (cents int) → yes_price_dollars (dollar string)
//   no_price  (cents int) → no_price_dollars  (dollar string)
function normalizeFill(raw: RawFill): KalshiFill {
  const count =
    raw.count !== undefined
      ? Number(raw.count)
      : parseFloat((raw.count_fp as string) || "0");
  const yes_price =
    raw.yes_price !== undefined
      ? Number(raw.yes_price)
      : Math.round(parseFloat((raw.yes_price_dollars as string) || "0") * 100);
  const no_price =
    raw.no_price !== undefined
      ? Number(raw.no_price)
      : Math.round(parseFloat((raw.no_price_dollars as string) || "0") * 100);

  return {
    fill_id: raw.fill_id as string,
    ticker: ((raw.ticker ?? raw.market_ticker) as string),
    side: raw.side as "yes" | "no",
    action: raw.action as "buy" | "sell",
    count,
    yes_price,
    no_price,
    fee_cost: (raw.fee_cost as string) || "0",
    created_time: raw.created_time as string,
    is_taker: raw.is_taker as boolean,
  };
}

// Normalize a raw settlement from the API.
// After the 2026-03-12 maintenance:
//   yes_count (int) → yes_count_fp (string)
//   no_count  (int) → no_count_fp  (string)
function normalizeSettlement(raw: RawSettlement): KalshiSettlement {
  const yes_count =
    raw.yes_count !== undefined
      ? Number(raw.yes_count)
      : parseFloat((raw.yes_count_fp as string) || "0");
  const no_count =
    raw.no_count !== undefined
      ? Number(raw.no_count)
      : parseFloat((raw.no_count_fp as string) || "0");

  return {
    ticker: raw.ticker as string,
    event_ticker: raw.event_ticker as string | undefined,
    market_result: raw.market_result as "yes" | "no" | "void",
    yes_count,
    no_count,
    yes_total_cost: Number(raw.yes_total_cost ?? 0),
    no_total_cost: Number(raw.no_total_cost ?? 0),
    revenue: Number(raw.revenue ?? 0),
    settled_time: raw.settled_time as string,
    fee_cost: (raw.fee_cost as string) || "0",
  };
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
    const [rawPortfolioFills, rawHistoricalFills, rawSettlements] = await Promise.all([
      fetchAllPaginated<RawFill>("/portfolio/fills", "fills"),
      fetchAllPaginated<RawFill>("/historical/fills", "fills"),
      fetchAllPaginated<RawSettlement>("/portfolio/settlements", "settlements"),
    ]);

    // Normalize to internal format (handles pre- and post-maintenance API field names)
    const portfolioFills = rawPortfolioFills.map(normalizeFill);
    const historicalFills = rawHistoricalFills.map(normalizeFill);
    const settlements = rawSettlements.map(normalizeSettlement);

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

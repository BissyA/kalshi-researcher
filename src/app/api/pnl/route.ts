import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";

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

function matchFillsAndSettlements(
  fills: KalshiFill[],
  settlements: KalshiSettlement[]
): ProcessedTrade[] {
  // Build settlement lookup: ticker -> settlement
  const settlementMap = new Map<string, KalshiSettlement>();
  for (const s of settlements) {
    settlementMap.set(s.ticker, s);
  }

  // Group fills by ticker
  const byTicker = new Map<string, KalshiFill[]>();
  for (const fill of fills) {
    const existing = byTicker.get(fill.ticker) ?? [];
    existing.push(fill);
    byTicker.set(fill.ticker, existing);
  }

  const trades: ProcessedTrade[] = [];

  for (const [ticker, tickerFills] of byTicker) {
    tickerFills.sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());

    // Track open buy positions per side (FIFO queues)
    const openPositions: { side: "yes" | "no"; fills: { fill: KalshiFill; remaining: number; feeCents: number }[] }[] = [
      { side: "yes", fills: [] },
      { side: "no", fills: [] },
    ];

    const getQueue = (side: "yes" | "no") => openPositions.find(p => p.side === side)!.fills;

    for (const fill of tickerFills) {
      const feeCents = Math.round(parseFloat(fill.fee_cost || "0") * 100);
      const queue = getQueue(fill.side);

      if (fill.action === "buy") {
        queue.push({ fill, remaining: fill.count, feeCents });
      } else if (fill.action === "sell") {
        // Match sells against open buys (FIFO)
        let remaining = fill.count;
        while (remaining > 0 && queue.length > 0) {
          const entry = queue[0];
          const matched = Math.min(remaining, entry.remaining);

          const entryPrice = fill.side === "yes" ? entry.fill.yes_price : entry.fill.no_price;
          const exitPrice = fill.side === "yes" ? fill.yes_price : fill.no_price;
          const pnl = (exitPrice - entryPrice) * matched;
          const entryFeeShare = entry.remaining > 0 ? Math.round(entry.feeCents * (matched / entry.remaining)) : 0;
          const exitFeeShare = fill.count > 0 ? Math.round(feeCents * (matched / fill.count)) : 0;
          const totalFee = entryFeeShare + exitFeeShare;

          trades.push({
            ticker,
            side: fill.side,
            quantity: matched,
            entryPriceCents: entryPrice,
            exitPriceCents: exitPrice,
            feeCents: totalFee,
            pnlCents: pnl,
            pnlAfterFeesCents: pnl - totalFee,
            openTimestamp: entry.fill.created_time,
            closeTimestamp: fill.created_time,
            closedVia: "sell",
          });

          remaining -= matched;
          entry.remaining -= matched;
          entry.feeCents -= entryFeeShare;
          if (entry.remaining <= 0) queue.shift();
        }
      }
    }

    // Now settle remaining open positions via settlement
    const settlement = settlementMap.get(ticker);
    if (!settlement) continue;

    const resultIsYes = settlement.market_result === "yes";
    const settlementFeeCents = Math.round(parseFloat(settlement.fee_cost || "0") * 100);

    // Settle remaining YES buys
    const yesQueue = getQueue("yes");
    let totalYesSettled = 0;
    const totalYesRemaining = yesQueue.reduce((s, e) => s + e.remaining, 0);
    for (const entry of [...yesQueue]) {
      if (entry.remaining <= 0) continue;
      const exitPrice = resultIsYes ? 100 : 0;
      const entryPrice = entry.fill.yes_price;
      const pnl = (exitPrice - entryPrice) * entry.remaining;
      // Distribute settlement fee proportionally
      const feeShare = totalYesRemaining > 0
        ? Math.round(settlementFeeCents * (entry.remaining / (totalYesRemaining + getQueue("no").reduce((s, e) => s + e.remaining, 0))))
        : 0;

      trades.push({
        ticker,
        side: "yes",
        quantity: entry.remaining,
        entryPriceCents: entryPrice,
        exitPriceCents: exitPrice,
        feeCents: entry.feeCents + feeShare,
        pnlCents: pnl,
        pnlAfterFeesCents: pnl - entry.feeCents - feeShare,
        openTimestamp: entry.fill.created_time,
        closeTimestamp: settlement.settled_time,
        closedVia: "settlement",
      });
      totalYesSettled += entry.remaining;
      entry.remaining = 0;
    }

    // Settle remaining NO buys
    const noQueue = getQueue("no");
    const totalNoRemaining = noQueue.reduce((s, e) => s + e.remaining, 0);
    for (const entry of [...noQueue]) {
      if (entry.remaining <= 0) continue;
      const exitPrice = resultIsYes ? 0 : 100;
      const entryPrice = entry.fill.no_price;
      const pnl = (exitPrice - entryPrice) * entry.remaining;
      const feeShare = totalNoRemaining > 0
        ? Math.round(settlementFeeCents * (entry.remaining / (totalNoRemaining + totalYesSettled)))
        : 0;

      trades.push({
        ticker,
        side: "no",
        quantity: entry.remaining,
        entryPriceCents: entryPrice,
        exitPriceCents: exitPrice,
        feeCents: entry.feeCents + feeShare,
        pnlCents: pnl,
        pnlAfterFeesCents: pnl - entry.feeCents - feeShare,
        openTimestamp: entry.fill.created_time,
        closeTimestamp: settlement.settled_time,
        closedVia: "settlement",
      });
      entry.remaining = 0;
    }
  }

  return trades;
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
    const trades = matchFillsAndSettlements(allFills, settlements);

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

    const events = Array.from(eventMap.values()).sort(
      (a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
    );

    const result = {
      summary: {
        totalTrades: trades.length,
        totalPnlCents,
        totalFeesCents,
        totalPnlAfterFeesCents,
        totalFills: allFills.length,
        totalSettlements: settlements.length,
      },
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

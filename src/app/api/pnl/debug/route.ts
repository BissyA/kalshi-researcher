import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";

async function fetchAllPaginated<T>(endpoint: string, key: string): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const res = await kalshiFetch("GET", `${endpoint}?${params}`);
    if (!res.ok) break;
    const data = await res.json();
    const items = data[key] ?? [];
    all.push(...items);
    if (!data.cursor || items.length === 0) break;
    cursor = data.cursor;
  }
  return all;
}

export async function GET() {
  try {
    // 1. Get historical cutoff
    const cutoffRes = await kalshiFetch("GET", "/historical/cutoff");
    const cutoff = await cutoffRes.json();

    // 2. Count fills from each source
    const portfolioFills = await fetchAllPaginated<Record<string, unknown>>("/portfolio/fills", "fills");
    const historicalFills = await fetchAllPaginated<Record<string, unknown>>("/historical/fills", "fills");

    // Dedup
    const fillMap = new Map<string, Record<string, unknown>>();
    for (const fill of [...historicalFills, ...portfolioFills]) {
      fillMap.set(fill.fill_id as string, fill);
    }

    const allFills = Array.from(fillMap.values());
    const buys = allFills.filter(f => f.action === "buy");
    const sells = allFills.filter(f => f.action === "sell");

    // Check fills for mismatched tickers
    const testTickers = [
      "KXNEWSOMMENTION-26FEB21-EDUC",
      "KXHEGSETHMENTION-26MAR05-OBLI",
      "KXNEWSOMMENTION-26FEB20-BRT",
    ];

    const tickerDetails: Record<string, unknown> = {};
    for (const ticker of testTickers) {
      const tf = allFills.filter(f => f.ticker === ticker);
      tickerDetails[ticker] = {
        fills: tf.map(f => ({
          side: f.side, action: f.action, count: f.count,
          yes_price: f.yes_price, no_price: f.no_price,
          created_time: f.created_time,
        })),
        buyYes: tf.filter(f => f.action === "buy" && f.side === "yes").reduce((s, f) => s + (f.count as number), 0),
        buyNo: tf.filter(f => f.action === "buy" && f.side === "no").reduce((s, f) => s + (f.count as number), 0),
        sellYes: tf.filter(f => f.action === "sell" && f.side === "yes").reduce((s, f) => s + (f.count as number), 0),
        sellNo: tf.filter(f => f.action === "sell" && f.side === "no").reduce((s, f) => s + (f.count as number), 0),
      };
    }

    // Verify theory: if ALL fills create positions (side determines queue, action ignored),
    // do the totals match settlement counts?
    const settlements = await fetchAllPaginated<Record<string, unknown>>("/portfolio/settlements", "settlements");
    const settlementMap = new Map<string, Record<string, unknown>>();
    for (const s of settlements) {
      settlementMap.set(s.ticker as string, s);
    }

    const theoryCheck: Record<string, unknown> = {};
    for (const ticker of testTickers) {
      const tf = allFills.filter(f => f.ticker === ticker);
      const totalYes = tf.filter(f => f.side === "yes").reduce((s, f) => s + (f.count as number), 0);
      const totalNo = tf.filter(f => f.side === "no").reduce((s, f) => s + (f.count as number), 0);
      const sett = settlementMap.get(ticker);
      theoryCheck[ticker] = {
        fillsYes: totalYes,
        fillsNo: totalNo,
        settlementYes: sett?.yes_count,
        settlementNo: sett?.no_count,
        match: totalYes === sett?.yes_count && totalNo === sett?.no_count,
      };
    }

    return NextResponse.json({
      cutoff,
      portfolioFillCount: portfolioFills.length,
      historicalFillCount: historicalFills.length,
      dedupedTotal: allFills.length,
      buyCount: buys.length,
      sellCount: sells.length,
      tickerDetails,
      theoryCheck,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, wordId, side, entryPrice, contracts, totalCostCents, action = "buy" } = body;

    if (!eventId || !wordId || !side || entryPrice == null || !contracts || totalCostCents == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (action !== "buy" && action !== "sell") {
      return NextResponse.json({ error: "action must be 'buy' or 'sell'" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    if (action === "sell") {
      return handleSell(supabase, { eventId, wordId, side, exitPrice: entryPrice, contracts, totalCostCents });
    }

    // ── Buy trade (original logic) ──
    const { data: latestScore } = await supabase
      .from("word_scores")
      .select("combined_probability, edge")
      .eq("word_id", wordId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const { data: trade, error } = await supabase
      .from("trades")
      .insert({
        event_id: eventId,
        word_id: wordId,
        side,
        action: "buy",
        entry_price: entryPrice,
        contracts,
        total_cost_cents: totalCostCents,
        matched_contracts: 0,
        agent_estimated_probability: latestScore?.combined_probability ?? null,
        agent_edge: latestScore?.edge ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `Failed to log trade: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ trade });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── FIFO sell matching ──

interface SellParams {
  eventId: string;
  wordId: string;
  side: string;
  exitPrice: number;
  contracts: number;
  totalCostCents: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSell(supabase: any, params: SellParams) {
  const { eventId, wordId, side, exitPrice, contracts: contractsToSell, totalCostCents } = params;

  // 1. Fetch open buy trades for this word+side, ordered FIFO
  const { data: openBuys, error: fetchError } = await supabase
    .from("trades")
    .select("*")
    .eq("event_id", eventId)
    .eq("word_id", wordId)
    .eq("side", side)
    .eq("action", "buy")
    .is("result", null)
    .order("created_at", { ascending: true });

  if (fetchError) {
    return NextResponse.json({ error: `Failed to fetch open buys: ${fetchError.message}` }, { status: 500 });
  }

  // Filter to buys with remaining open contracts
  const availableBuys = (openBuys ?? []).filter(
    (b: { contracts: number; matched_contracts: number }) => b.contracts - (b.matched_contracts ?? 0) > 0
  );

  const totalAvailable = availableBuys.reduce(
    (sum: number, b: { contracts: number; matched_contracts: number }) => sum + (b.contracts - (b.matched_contracts ?? 0)),
    0
  );

  if (totalAvailable < contractsToSell) {
    return NextResponse.json(
      { error: `Not enough open contracts to sell. Available: ${totalAvailable}, requested: ${contractsToSell}` },
      { status: 400 }
    );
  }

  // 2. Pre-calculate FIFO matches (no DB writes yet)
  let remainingToSell = contractsToSell;
  const matches: Array<{
    buyId: string;
    consuming: number;
    pnl: number;
    newMatchedContracts: number;
    fullyConsumed: boolean;
    prevRealizedPnl: number;
  }> = [];
  let totalRealizedPnl = 0;
  const matchedBuyIds: string[] = [];

  for (const buy of availableBuys) {
    if (remainingToSell <= 0) break;

    const available = buy.contracts - (buy.matched_contracts ?? 0);
    const consuming = Math.min(available, remainingToSell);
    const pnlForMatch = (exitPrice - buy.entry_price) * consuming * 100;
    const newMatchedContracts = (buy.matched_contracts ?? 0) + consuming;

    totalRealizedPnl += pnlForMatch;
    matchedBuyIds.push(buy.id);
    matches.push({
      buyId: buy.id,
      consuming,
      pnl: pnlForMatch,
      newMatchedContracts,
      fullyConsumed: newMatchedContracts >= buy.contracts,
      prevRealizedPnl: buy.realized_pnl_cents ?? 0,
    });

    remainingToSell -= consuming;
  }

  // 3. Insert the sell trade FIRST (so if this fails, no buys are modified)
  const { data: sellTrade, error: insertError } = await supabase
    .from("trades")
    .insert({
      event_id: eventId,
      word_id: wordId,
      side,
      action: "sell",
      entry_price: exitPrice,
      exit_price: exitPrice,
      contracts: contractsToSell,
      total_cost_cents: totalCostCents,
      matched_buy_ids: matchedBuyIds,
      matched_contracts: contractsToSell,
      result: "sold",
      pnl_cents: Math.round(totalRealizedPnl),
      realized_pnl_cents: totalRealizedPnl,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: `Failed to log sell trade: ${insertError.message}` }, { status: 500 });
  }

  // 4. Now update the matched buy trades
  for (const match of matches) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buyUpdates: Record<string, any> = {
      matched_contracts: match.newMatchedContracts,
      realized_pnl_cents: match.prevRealizedPnl + match.pnl,
    };

    if (match.fullyConsumed) {
      buyUpdates.result = "sold";
      buyUpdates.pnl_cents = Math.round(match.prevRealizedPnl + match.pnl);
    }

    await supabase.from("trades").update(buyUpdates).eq("id", match.buyId);
  }

  return NextResponse.json({ trade: sellTrade });
}

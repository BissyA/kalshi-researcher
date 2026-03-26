import { getServerSupabase } from "@/lib/supabase";

export interface WordResult {
  wordId: string;
  wasMentioned: boolean;
}

export interface SettlementSummary {
  eventId: string;
  resultsRecorded: number;
  tradesSettled: number;
  totalPnlCents: number;
}

/**
 * Resolves an event by recording word results and calculating trade P&L.
 * Used by both manual resolution and automatic settlement checking.
 *
 * Only settles buy trades that haven't been fully sold. For partially-sold
 * buys, settlement P&L applies only to the remaining open contracts, and
 * the final pnl_cents combines realized (from sells) + settlement.
 */
export async function settleEvent(
  eventId: string,
  results: WordResult[]
): Promise<SettlementSummary> {
  const supabase = getServerSupabase();
  let tradesSettled = 0;
  let totalPnlCents = 0;

  for (const result of results) {
    await supabase.from("event_results").upsert(
      {
        event_id: eventId,
        word_id: result.wordId,
        was_mentioned: result.wasMentioned,
        settled_at: new Date().toISOString(),
      },
      { onConflict: "event_id,word_id" }
    );

    // Only settle buy trades that are still open (not fully sold)
    const { data: trades } = await supabase
      .from("trades")
      .select("*")
      .eq("event_id", eventId)
      .eq("word_id", result.wordId)
      .eq("action", "buy")
      .is("result", null);

    if (trades) {
      for (const trade of trades) {
        const openContracts = trade.contracts - (trade.matched_contracts ?? 0);
        if (openContracts <= 0) continue; // fully sold, skip

        const isWin =
          (trade.side === "yes" && result.wasMentioned) ||
          (trade.side === "no" && !result.wasMentioned);

        // Settlement P&L on remaining open contracts only
        const costPerContract = trade.entry_price;
        const openCostCents = costPerContract * openContracts * 100;
        const settlementPnl = isWin
          ? openContracts * 100 - openCostCents
          : -openCostCents;

        // Total P&L = realized from partial sells + settlement on remaining
        const totalPnl = (trade.realized_pnl_cents ?? 0) + settlementPnl;

        await supabase
          .from("trades")
          .update({ result: isWin ? "win" : "loss", pnl_cents: Math.round(totalPnl) })
          .eq("id", trade.id);

        tradesSettled++;
        totalPnlCents += totalPnl;
      }
    }

    // Also count P&L from fully-sold buys (result = 'sold') for the total
    const { data: soldTrades } = await supabase
      .from("trades")
      .select("pnl_cents")
      .eq("event_id", eventId)
      .eq("word_id", result.wordId)
      .eq("action", "buy")
      .eq("result", "sold");

    if (soldTrades) {
      for (const t of soldTrades) {
        totalPnlCents += t.pnl_cents ?? 0;
      }
    }
  }

  await supabase
    .from("events")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", eventId);

  return { eventId, resultsRecorded: results.length, tradesSettled, totalPnlCents };
}

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

    const { data: trades } = await supabase
      .from("trades")
      .select("*")
      .eq("event_id", eventId)
      .eq("word_id", result.wordId);

    if (trades) {
      for (const trade of trades) {
        const isWin =
          (trade.side === "yes" && result.wasMentioned) ||
          (trade.side === "no" && !result.wasMentioned);

        const costCents = trade.total_cost_cents ?? trade.entry_price * trade.contracts * 100;
        const pnlCents = isWin
          ? trade.contracts * 100 - costCents
          : -costCents;

        await supabase
          .from("trades")
          .update({ result: isWin ? "win" : "loss", pnl_cents: pnlCents })
          .eq("id", trade.id);

        tradesSettled++;
        totalPnlCents += pnlCents;
      }
    }
  }

  await supabase
    .from("events")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", eventId);

  return { eventId, resultsRecorded: results.length, tradesSettled, totalPnlCents };
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, results } = body;

    if (!eventId || !results || !Array.isArray(results)) {
      return NextResponse.json({ error: "eventId and results array required" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Record event results
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

      // Update matching trades with win/loss and P&L
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

          // P&L: if win, profit = (1.00 - entry_price) * contracts * 100 cents
          // if loss, loss = entry_price * contracts * 100 cents (negative)
          const pnlCents = isWin
            ? Math.round((1.0 - trade.entry_price) * trade.contracts * 100)
            : -Math.round(trade.entry_price * trade.contracts * 100);

          await supabase
            .from("trades")
            .update({
              result: isWin ? "win" : "loss",
              pnl_cents: pnlCents,
            })
            .eq("id", trade.id);
        }
      }
    }

    // Update event status
    await supabase
      .from("events")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", eventId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

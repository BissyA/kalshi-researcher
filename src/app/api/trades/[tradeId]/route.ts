import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  try {
    const { tradeId } = await params;
    const supabase = getServerSupabase();

    // Fetch the trade to check its type
    const { data: trade, error: fetchError } = await supabase
      .from("trades")
      .select("*")
      .eq("id", tradeId)
      .single();

    if (fetchError || !trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    // If deleting a BUY that has matched sells, block deletion
    if (trade.action === "buy" && (trade.matched_contracts ?? 0) > 0) {
      return NextResponse.json(
        { error: "Cannot delete a buy trade that has sells matched against it. Delete the sell trade(s) first." },
        { status: 400 }
      );
    }

    // If deleting a SELL, unwind the FIFO match on the matched buys
    if (trade.action === "sell" && trade.matched_buy_ids?.length > 0) {
      // We need to reverse the match. Walk through matched buys and decrement.
      // Since we don't store per-buy consuming amounts, we re-derive using FIFO.
      let remainingToReverse = trade.contracts;

      // Fetch the matched buys in FIFO order
      const { data: matchedBuys } = await supabase
        .from("trades")
        .select("*")
        .in("id", trade.matched_buy_ids)
        .order("created_at", { ascending: true });

      for (const buy of matchedBuys ?? []) {
        if (remainingToReverse <= 0) break;

        // How many of this buy's matched_contracts came from this sell?
        // Since sells are matched FIFO, the earliest buys were consumed first.
        const buyAvailableToReverse = Math.min(buy.matched_contracts ?? 0, remainingToReverse);
        const pnlToReverse = (trade.entry_price - buy.entry_price) * buyAvailableToReverse * 100;

        const newMatchedContracts = (buy.matched_contracts ?? 0) - buyAvailableToReverse;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const buyUpdates: Record<string, any> = {
          matched_contracts: newMatchedContracts,
          realized_pnl_cents: (buy.realized_pnl_cents ?? 0) - pnlToReverse,
        };

        // If buy was marked as 'sold', revert to open
        if (buy.result === "sold") {
          buyUpdates.result = null;
          buyUpdates.pnl_cents = null;
        }

        await supabase.from("trades").update(buyUpdates).eq("id", buy.id);
        remainingToReverse -= buyAvailableToReverse;
      }
    }

    const { error } = await supabase
      .from("trades")
      .delete()
      .eq("id", tradeId);

    if (error) {
      return NextResponse.json(
        { error: `Failed to delete trade: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  try {
    const { tradeId } = await params;
    const body = await request.json();
    const { entryPrice, contracts } = body;

    if (entryPrice == null && contracts == null) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Fetch existing trade
    const { data: existing, error: fetchError } = await supabase
      .from("trades")
      .select("*")
      .eq("id", tradeId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Trade not found" },
        { status: 404 }
      );
    }

    // Block editing sell trades
    if (existing.action === "sell") {
      return NextResponse.json(
        { error: "Cannot edit sell trades. Delete and re-log instead." },
        { status: 400 }
      );
    }

    // Block editing buy trades that have matched sells
    if ((existing.matched_contracts ?? 0) > 0) {
      return NextResponse.json(
        { error: "Cannot edit a buy trade with sells matched against it. Delete the sell(s) first." },
        { status: 400 }
      );
    }

    const newEntryPrice = entryPrice ?? existing.entry_price;
    const newContracts = contracts ?? existing.contracts;
    const newTotalCostCents = Math.round(newEntryPrice * newContracts * 100);

    const updates: Record<string, unknown> = {
      entry_price: newEntryPrice,
      contracts: newContracts,
      total_cost_cents: newTotalCostCents,
    };

    // Recalculate P&L if trade is already settled
    if (existing.result === "win" || existing.result === "loss") {
      const isWin = existing.result === "win";
      updates.pnl_cents = isWin
        ? Math.round((1.0 - newEntryPrice) * newContracts * 100)
        : -Math.round(newEntryPrice * newContracts * 100);
    }

    const { data: updated, error: updateError } = await supabase
      .from("trades")
      .update(updates)
      .eq("id", tradeId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update trade: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ trade: updated });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

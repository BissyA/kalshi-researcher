import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  try {
    const { tradeId } = await params;
    const supabase = getServerSupabase();

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

    const newEntryPrice = entryPrice ?? existing.entry_price;
    const newContracts = contracts ?? existing.contracts;
    const newTotalCostCents = Math.round(newEntryPrice * newContracts * 100);

    const updates: Record<string, unknown> = {
      entry_price: newEntryPrice,
      contracts: newContracts,
      total_cost_cents: newTotalCostCents,
    };

    // Recalculate P&L if trade is already settled
    if (existing.result != null) {
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

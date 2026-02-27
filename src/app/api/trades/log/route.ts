import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, wordId, side, entryPrice, contracts, totalCostCents } = body;

    if (!eventId || !wordId || !side || entryPrice == null || !contracts || totalCostCents == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Get the latest word score for this word to record the agent's estimate
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
        entry_price: entryPrice,
        contracts,
        total_cost_cents: totalCostCents,
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

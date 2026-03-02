import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = getServerSupabase();

  // Load event
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Load all research runs for this event
  const { data: runs } = await supabase
    .from("research_runs")
    .select("*")
    .eq("event_id", eventId)
    .order("triggered_at", { ascending: false });

  // Load latest completed word scores
  const latestCompletedRun = runs?.find((r) => r.status === "completed");
  let wordScores = null;
  if (latestCompletedRun) {
    const { data: scores } = await supabase
      .from("word_scores")
      .select("*, words(word, kalshi_market_ticker, cluster_id)")
      .eq("research_run_id", latestCompletedRun.id)
      .order("edge", { ascending: false });

    wordScores = scores;
  }

  // Load word clusters
  const { data: clusters } = await supabase
    .from("word_clusters")
    .select("*, words(id, word, kalshi_market_ticker)")
    .eq("event_id", eventId);

  // Load words
  const { data: words } = await supabase
    .from("words")
    .select("*")
    .eq("event_id", eventId)
    .order("word");

  // Load trades
  const { data: trades } = await supabase
    .from("trades")
    .select("*")
    .eq("event_id", eventId);

  // Load event results (resolution data)
  const { data: eventResults } = await supabase
    .from("event_results")
    .select("*")
    .eq("event_id", eventId);

  return NextResponse.json({
    event,
    runs: runs ?? [],
    latestRun: latestCompletedRun ?? null,
    wordScores,
    clusters: clusters ?? [],
    words: words ?? [],
    trades: trades ?? [],
    eventResults: eventResults ?? [],
    researchSummary: latestCompletedRun
      ? {
          historical: latestCompletedRun.historical_result,
          agenda: latestCompletedRun.agenda_result,
          newsCycle: latestCompletedRun.news_cycle_result,
          eventFormat: latestCompletedRun.event_format_result,
          marketAnalysis: latestCompletedRun.market_analysis_result,
          clusters: latestCompletedRun.cluster_result,
          synthesis: latestCompletedRun.synthesis_result,
        }
      : null,
  });
}

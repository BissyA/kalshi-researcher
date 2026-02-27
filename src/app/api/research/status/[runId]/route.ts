import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = getServerSupabase();

  const { data: run, error } = await supabase
    .from("research_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: "Research run not found" }, { status: 404 });
  }

  // Determine which agents have completed based on non-null result columns
  const completedAgents: string[] = [];
  if (run.historical_result) completedAgents.push("historical");
  if (run.agenda_result) completedAgents.push("agenda");
  if (run.news_cycle_result) completedAgents.push("news_cycle");
  if (run.event_format_result) completedAgents.push("event_format");
  if (run.market_analysis_result) completedAgents.push("market_analysis");
  if (run.cluster_result) completedAgents.push("clustering");
  if (run.synthesis_result) completedAgents.push("synthesizer");

  const allAgents = run.layer === "current"
    ? ["historical", "agenda", "news_cycle", "event_format", "market_analysis", "clustering", "synthesizer"]
    : ["historical", "agenda", "event_format", "market_analysis", "clustering", "synthesizer"];

  const pendingAgents = allAgents.filter((a) => !completedAgents.includes(a));

  // Load word scores if completed
  let wordScores = null;
  if (run.status === "completed") {
    const { data: scores } = await supabase
      .from("word_scores")
      .select("*, words(word, kalshi_market_ticker)")
      .eq("research_run_id", runId)
      .order("edge", { ascending: false });

    wordScores = scores;
  }

  return NextResponse.json({
    id: run.id,
    status: run.status,
    layer: run.layer,
    completedAgents,
    pendingAgents,
    wordScores,
    tokenUsage: run.status === "completed"
      ? {
          totalInputTokens: run.total_input_tokens,
          totalOutputTokens: run.total_output_tokens,
          estimatedCostCents: run.total_cost_cents,
        }
      : null,
    error: run.error_message,
    triggeredAt: run.triggered_at,
    completedAt: run.completed_at,
  });
}

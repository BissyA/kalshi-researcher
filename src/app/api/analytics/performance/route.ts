import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getServerSupabase();

  // Overall trade stats
  const { data: trades } = await supabase
    .from("trades")
    .select("*")
    .not("result", "is", null);

  const totalTrades = trades?.length ?? 0;
  const wins = trades?.filter((t) => t.result === "win").length ?? 0;
  const losses = trades?.filter((t) => t.result === "loss").length ?? 0;
  const totalPnlCents = trades?.reduce((sum, t) => sum + (t.pnl_cents ?? 0), 0) ?? 0;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;

  // Per-event breakdown
  const { data: events } = await supabase
    .from("events")
    .select("id, title, event_date, status")
    .order("event_date", { ascending: false });

  const eventPerformance = [];
  for (const event of events ?? []) {
    const eventTrades = trades?.filter((t) => t.event_id === event.id) ?? [];
    const eventWins = eventTrades.filter((t) => t.result === "win").length;
    const eventLosses = eventTrades.filter((t) => t.result === "loss").length;
    const eventPnl = eventTrades.reduce((sum, t) => sum + (t.pnl_cents ?? 0), 0);

    eventPerformance.push({
      eventId: event.id,
      title: event.title,
      eventDate: event.event_date,
      status: event.status,
      totalTrades: eventTrades.length,
      wins: eventWins,
      losses: eventLosses,
      winRate: eventTrades.length > 0 ? eventWins / eventTrades.length : 0,
      pnlCents: eventPnl,
    });
  }

  // Calibration data: agent probability buckets vs actual outcomes
  const { data: calibrationRows } = await supabase
    .from("word_scores")
    .select("combined_probability, confidence, word_id, event_id")
    .not("combined_probability", "is", null);

  const { data: eventResults } = await supabase
    .from("event_results")
    .select("word_id, event_id, was_mentioned");

  const calibrationBuckets: Record<string, { total: number; mentioned: number }> = {};
  for (let i = 0; i < 10; i++) {
    const label = `${i * 10}-${(i + 1) * 10}%`;
    calibrationBuckets[label] = { total: 0, mentioned: 0 };
  }

  for (const score of calibrationRows ?? []) {
    const result = eventResults?.find(
      (r) => r.word_id === score.word_id && r.event_id === score.event_id
    );
    if (result) {
      const bucket = Math.min(Math.floor((score.combined_probability ?? 0) * 10), 9);
      const label = `${bucket * 10}-${(bucket + 1) * 10}%`;
      calibrationBuckets[label].total++;
      if (result.was_mentioned) {
        calibrationBuckets[label].mentioned++;
      }
    }
  }

  const calibrationData = Object.entries(calibrationBuckets).map(
    ([bucket, data]) => ({
      bucket,
      total: data.total,
      mentioned: data.mentioned,
      actualRate: data.total > 0 ? data.mentioned / data.total : null,
    })
  );

  // Edge analysis: average P&L by edge bucket
  const edgeBuckets: Record<string, { trades: number; totalPnl: number }> = {
    "<-0.20": { trades: 0, totalPnl: 0 },
    "-0.20 to -0.10": { trades: 0, totalPnl: 0 },
    "-0.10 to 0": { trades: 0, totalPnl: 0 },
    "0 to 0.10": { trades: 0, totalPnl: 0 },
    "0.10 to 0.20": { trades: 0, totalPnl: 0 },
    ">0.20": { trades: 0, totalPnl: 0 },
  };

  for (const trade of trades ?? []) {
    const edge = trade.agent_edge ?? 0;
    let bucket: string;
    if (edge < -0.2) bucket = "<-0.20";
    else if (edge < -0.1) bucket = "-0.20 to -0.10";
    else if (edge < 0) bucket = "-0.10 to 0";
    else if (edge < 0.1) bucket = "0 to 0.10";
    else if (edge < 0.2) bucket = "0.10 to 0.20";
    else bucket = ">0.20";

    edgeBuckets[bucket].trades++;
    edgeBuckets[bucket].totalPnl += trade.pnl_cents ?? 0;
  }

  const edgeAnalysis = Object.entries(edgeBuckets).map(([bucket, data]) => ({
    bucket,
    trades: data.trades,
    totalPnlCents: data.totalPnl,
    avgPnlCents: data.trades > 0 ? Math.round(data.totalPnl / data.trades) : 0,
  }));

  return NextResponse.json({
    overall: {
      totalTrades,
      wins,
      losses,
      winRate: Math.round(winRate * 1000) / 1000,
      totalPnlCents,
      totalPnlDollars: (totalPnlCents / 100).toFixed(2),
    },
    eventPerformance,
    calibrationData,
    edgeAnalysis,
  });
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const strategy = searchParams.get("strategy") ?? "v2";

  const supabase = getServerSupabase();

  // All trades (for per-event counts), filtered by strategy
  const { data: allTrades } = await supabase
    .from("trades")
    .select("*")
    .eq("strategy", strategy);

  // Resolved BUY trades only (sells are informational — their P&L is on the matched buy)
  const resolvedTrades = allTrades?.filter(
    (t) => (t.action ?? "buy") === "buy" && t.result !== null
  ) ?? [];

  const totalTrades = resolvedTrades.length;
  const wins = resolvedTrades.filter((t) => t.result === "win").length;
  const losses = resolvedTrades.length - wins;
  const totalPnlCents = resolvedTrades.reduce((sum, t) => sum + (t.pnl_cents ?? 0), 0);
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;

  // Per-event breakdown — only events with at least one trade
  const tradedEventIds = [...new Set((allTrades ?? []).map((t) => t.event_id))];

  const { data: events } = tradedEventIds.length > 0
    ? await supabase
        .from("events")
        .select("id, title, event_date, status, speaker_id")
        .in("id", tradedEventIds)
        .order("event_date", { ascending: false })
    : { data: [] };

  // Fetch words for trade display names
  const { data: words } = tradedEventIds.length > 0
    ? await supabase
        .from("words")
        .select("id, word, event_id")
        .in("event_id", tradedEventIds)
    : { data: [] };

  const wordMap = new Map((words ?? []).map((w) => [w.id, w.word]));

  // ── Build historical mention rate maps per speaker ──
  // Collect unique speaker_ids from traded events
  const speakerIds = [
    ...new Set(
      (events ?? [])
        .map((e) => e.speaker_id)
        .filter((id): id is string => id != null)
    ),
  ];

  // For each speaker, find their series, then query event_results + words to compute mention rates
  // Map: speakerId → Map<normalizedWord, mentionRate>
  const speakerMentionRates = new Map<string, Map<string, { rate: number; yes: number; total: number }>>();

  for (const speakerId of speakerIds) {
    const { data: seriesData } = await supabase
      .from("series")
      .select("id")
      .eq("speaker_id", speakerId);

    const seriesIds = (seriesData ?? []).map((s) => s.id);
    if (seriesIds.length === 0) continue;

    // Get all corpus events for this speaker's series
    const { data: corpusEvents } = await supabase
      .from("events")
      .select("id")
      .in("series_id", seriesIds);

    const corpusEventIds = (corpusEvents ?? []).map((e) => e.id);
    if (corpusEventIds.length === 0) continue;

    // Fetch event_results with word names (paginated to avoid 1000 row limit)
    const PAGE_SIZE = 1000;
    let offset = 0;
    const allResults: Array<{ was_mentioned: boolean; words: { word: string } }> = [];

    while (true) {
      const { data: page } = await supabase
        .from("event_results")
        .select("was_mentioned, words!inner(word)")
        .in("event_id", corpusEventIds)
        .range(offset, offset + PAGE_SIZE - 1);

      if (!page || page.length === 0) break;
      allResults.push(...(page as unknown as typeof allResults));
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Group by normalized word → { yes, total }
    const wordStats = new Map<string, { yes: number; total: number }>();
    for (const r of allResults) {
      const norm = r.words.word.toLowerCase();
      const entry = wordStats.get(norm) ?? { yes: 0, total: 0 };
      entry.total++;
      if (r.was_mentioned) entry.yes++;
      wordStats.set(norm, entry);
    }

    // Convert to mention rate map (with sample counts)
    const rateMap = new Map<string, { rate: number; yes: number; total: number }>();
    for (const [word, stats] of wordStats) {
      rateMap.set(word, { rate: stats.total > 0 ? stats.yes / stats.total : 0, yes: stats.yes, total: stats.total });
    }
    speakerMentionRates.set(speakerId, rateMap);
  }

  const eventPerformance = [];
  for (const event of events ?? []) {
    const eventAllTrades = allTrades?.filter((t) => t.event_id === event.id && (t.action ?? "buy") === "buy") ?? [];
    const eventResolved = eventAllTrades.filter((t) => t.result !== null);
    const eventWins = eventResolved.filter((t) => t.result === "win").length;
    const eventLosses = eventResolved.length - eventWins;
    const eventPnl = eventResolved.reduce((sum, t) => sum + (t.pnl_cents ?? 0), 0);

    // Look up mention rates for this event's speaker
    const rateMap = event.speaker_id
      ? speakerMentionRates.get(event.speaker_id)
      : undefined;

    const trades = eventAllTrades.map((t) => {
      const wordName = wordMap.get(t.word_id) ?? "Unknown";
      const mention = rateMap?.get(wordName.toLowerCase()) ?? null;
      const entryPrice = t.entry_price as number;

      return {
        word: wordName,
        side: t.side as string,
        entryPrice,
        contracts: t.contracts as number,
        totalCostCents: t.total_cost_cents as number | null,
        result: t.result as string | null,
        pnlCents: (t.pnl_cents ?? 0) as number,
        agentEdge: t.agent_edge as number | null,
        agentProbability: t.agent_estimated_probability as number | null,
        historicalRate: mention?.rate ?? null,
        mentionYes: mention?.yes ?? null,
        mentionTotal: mention?.total ?? null,
        historicalEdge: mention != null ? mention.rate - entryPrice : null,
      };
    });

    eventPerformance.push({
      eventId: event.id,
      title: event.title,
      eventDate: event.event_date,
      status: event.status,
      totalTrades: eventAllTrades.length,
      wins: eventWins,
      losses: eventLosses,
      winRate: eventResolved.length > 0 ? eventWins / eventResolved.length : 0,
      pnlCents: eventPnl,
      trades,
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

  for (const trade of resolvedTrades) {
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

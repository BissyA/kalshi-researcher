import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getServerSupabase();

  // Fetch all trades
  const { data: allTrades } = await supabase.from("trades").select("*");
  if (!allTrades || allTrades.length === 0) {
    return NextResponse.json({ speakers: [], all: null });
  }

  // Fetch words for trade display names
  const wordIds = [...new Set(allTrades.map((t) => t.word_id).filter(Boolean))];
  const { data: words } = await supabase
    .from("words")
    .select("id, word")
    .in("id", wordIds);
  const wordMap = new Map((words ?? []).map((w) => [w.id, w.word]));

  // Fetch events to get speaker info
  const eventIds = [...new Set(allTrades.map((t) => t.event_id).filter(Boolean))];
  const { data: events } = await supabase
    .from("events")
    .select("id, speaker_id, title, event_date")
    .in("id", eventIds);
  const eventSpeakerMap = new Map((events ?? []).map((e) => [e.id, e.speaker_id]));
  const eventInfoMap = new Map(
    (events ?? []).map((e) => [e.id, { title: e.title, eventDate: e.event_date }])
  );

  // Fetch speaker names
  const speakerIds = [
    ...new Set(
      (events ?? [])
        .map((e) => e.speaker_id)
        .filter((id): id is string => id != null)
    ),
  ];
  const { data: speakers } = speakerIds.length > 0
    ? await supabase.from("speakers").select("id, name").in("id", speakerIds)
    : { data: [] };
  const speakerNameMap = new Map((speakers ?? []).map((s) => [s.id, s.name]));

  // Only use resolved trades for analytics
  const resolvedTrades = allTrades.filter((t) => t.result !== null);

  // Group resolved trades by speaker → word
  // Key: speakerId|wordNormalized
  interface WordAgg {
    word: string;
    speakerId: string;
    speakerName: string;
    trades: number;
    wins: number;
    losses: number;
    totalEntry: number;
    totalPnlCents: number;
    entries: number[];
    sides: Set<string>;
    tradeDetails: { eventTitle: string; eventDate: string | null; entry: number; side: string; result: string; pnlCents: number }[];
  }

  const wordAggs = new Map<string, WordAgg>();

  // Sort most recent first so entries array is chronologically descending
  resolvedTrades.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  for (const trade of resolvedTrades) {
    const speakerId = eventSpeakerMap.get(trade.event_id) ?? "unknown";
    const speakerName = speakerNameMap.get(speakerId) ?? "Unknown";
    const wordName = wordMap.get(trade.word_id) ?? "Unknown";
    const key = `${speakerId}|${wordName.toLowerCase()}`;

    const agg = wordAggs.get(key) ?? {
      word: wordName,
      speakerId,
      speakerName,
      trades: 0,
      wins: 0,
      losses: 0,
      totalEntry: 0,
      totalPnlCents: 0,
      entries: [] as number[],
      sides: new Set<string>(),
      tradeDetails: [] as WordAgg["tradeDetails"],
    };

    agg.trades++;
    if (trade.result === "win") agg.wins++;
    else agg.losses++;
    agg.totalEntry += trade.entry_price;
    agg.totalPnlCents += trade.pnl_cents ?? 0;
    agg.entries.push(trade.entry_price);
    agg.sides.add(trade.side);
    const info = eventInfoMap.get(trade.event_id);
    agg.tradeDetails.push({
      eventTitle: info?.title ?? "Unknown",
      eventDate: info?.eventDate ?? null,
      entry: trade.entry_price,
      side: trade.side as string,
      result: trade.result as string,
      pnlCents: trade.pnl_cents ?? 0,
    });

    wordAggs.set(key, agg);
  }

  // Build per-speaker results
  const speakerGrouped = new Map<
    string,
    { speakerId: string; speakerName: string; words: WordAgg[] }
  >();

  for (const agg of wordAggs.values()) {
    const existing = speakerGrouped.get(agg.speakerId) ?? {
      speakerId: agg.speakerId,
      speakerName: agg.speakerName,
      words: [],
    };
    existing.words.push(agg);
    speakerGrouped.set(agg.speakerId, existing);
  }

  // Format response
  const formatSpeaker = (
    speakerId: string,
    speakerName: string,
    wordAggList: WordAgg[]
  ) => {
    const totalTrades = wordAggList.reduce((s, w) => s + w.trades, 0);
    const totalWins = wordAggList.reduce((s, w) => s + w.wins, 0);
    const totalLosses = wordAggList.reduce((s, w) => s + w.losses, 0);
    const totalPnlCents = wordAggList.reduce((s, w) => s + w.totalPnlCents, 0);
    const winRate = totalTrades > 0 ? totalWins / totalTrades : 0;

    const words = wordAggList
      .map((w) => {
        const avgEntry = w.trades > 0 ? w.totalEntry / w.trades : 0;
        const wr = w.trades > 0 ? w.wins / w.trades : 0;
        const edge = wr - avgEntry;

        return {
          word: w.word,
          speakerName: w.speakerName,
          side: w.sides.size === 1 ? [...w.sides][0] : "mixed",
          trades: w.trades,
          avgEntry: Math.round(avgEntry * 1000) / 1000,
          winRate: Math.round(wr * 1000) / 1000,
          edge: Math.round(edge * 1000) / 1000,
          wins: w.wins,
          losses: w.losses,
          pnlCents: w.totalPnlCents,
          entries: w.entries,
          tradeDetails: w.tradeDetails,
        };
      })
      .sort((a, b) => b.pnlCents - a.pnlCents);

    return {
      speakerId,
      speakerName,
      summary: {
        totalTrades,
        wins: totalWins,
        losses: totalLosses,
        winRate: Math.round(winRate * 1000) / 1000,
        totalPnlCents,
        totalPnlDollars: (totalPnlCents / 100).toFixed(2),
        ev:
          totalTrades > 0
            ? (totalPnlCents / 100 / totalTrades).toFixed(2)
            : "0.00",
      },
      words,
    };
  };

  const speakerResults = [];
  for (const group of speakerGrouped.values()) {
    speakerResults.push(
      formatSpeaker(group.speakerId, group.speakerName, group.words)
    );
  }
  speakerResults.sort((a, b) => a.speakerName.localeCompare(b.speakerName));

  // "All" aggregate — keep per-speaker word rows so each row retains its speakerName
  const allWordAggs = [...wordAggs.values()];
  const allAggregate = formatSpeaker("all", "All", allWordAggs);

  return NextResponse.json({
    speakers: speakerResults,
    all: allAggregate,
  });
}

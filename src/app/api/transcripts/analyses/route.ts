import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET /api/transcripts/analyses?transcriptIds=id1,id2,...
// Returns analyses for the given transcripts, grouped by transcript_id, with event metadata
// and summary detection counts per analysis.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("transcriptIds");

  if (!idsParam) {
    return NextResponse.json({ analyses: {} });
  }

  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ analyses: {} });
  }

  const supabase = getServerSupabase();

  const { data: analyses, error } = await supabase
    .from("transcript_analyses")
    .select("id, transcript_id, event_id, created_at, events(id, title, kalshi_event_ticker, event_date, status)")
    .in("transcript_id", ids)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const analysisIds = (analyses ?? []).map((a) => a.id);
  const countsByAnalysis: Record<string, { wordsFound: number; totalMentions: number }> = {};
  if (analysisIds.length > 0) {
    const { data: totals } = await supabase
      .from("transcript_word_detections")
      .select("analysis_id, total_count")
      .in("analysis_id", analysisIds);
    for (const row of totals ?? []) {
      const entry = countsByAnalysis[row.analysis_id] ??= { wordsFound: 0, totalMentions: 0 };
      entry.wordsFound += 1;
      entry.totalMentions += row.total_count ?? 0;
    }
  }

  const grouped: Record<string, Array<{
    id: string;
    eventId: string;
    eventTitle: string | null;
    eventTicker: string | null;
    eventDate: string | null;
    eventStatus: string | null;
    createdAt: string;
    wordsFound: number;
    totalMentions: number;
  }>> = {};

  for (const a of analyses ?? []) {
    const ev = a.events as unknown as { id: string; title: string; kalshi_event_ticker: string; event_date: string | null; status: string } | null;
    const tid = a.transcript_id as string;
    (grouped[tid] ??= []).push({
      id: a.id,
      eventId: a.event_id,
      eventTitle: ev?.title ?? null,
      eventTicker: ev?.kalshi_event_ticker ?? null,
      eventDate: ev?.event_date ?? null,
      eventStatus: ev?.status ?? null,
      createdAt: a.created_at,
      wordsFound: countsByAnalysis[a.id]?.wordsFound ?? 0,
      totalMentions: countsByAnalysis[a.id]?.totalMentions ?? 0,
    });
  }

  return NextResponse.json({ analyses: grouped });
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET — full detection data for one analysis (used by the results view)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params;
  const supabase = getServerSupabase();

  const { data: analysis, error: aError } = await supabase
    .from("transcript_analyses")
    .select("id, transcript_id, event_id, created_at, events(id, title, kalshi_event_ticker, event_date, status)")
    .eq("id", analysisId)
    .single();

  if (aError || !analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const { data: sectionDetections } = await supabase
    .from("section_word_detections")
    .select("section_id, word, word_id, mention_count")
    .eq("analysis_id", analysisId);

  const { data: transcriptDetections } = await supabase
    .from("transcript_word_detections")
    .select("word, word_id, total_count, section_count")
    .eq("analysis_id", analysisId);

  // Event strike words (full list — not just the matched ones)
  const { data: eventWords } = await supabase
    .from("words")
    .select("id, word")
    .eq("event_id", analysis.event_id);

  const ev = analysis.events as unknown as { id: string; title: string; kalshi_event_ticker: string; event_date: string | null; status: string } | null;

  return NextResponse.json({
    analysis: {
      id: analysis.id,
      transcriptId: analysis.transcript_id,
      eventId: analysis.event_id,
      eventTitle: ev?.title ?? null,
      eventTicker: ev?.kalshi_event_ticker ?? null,
      eventDate: ev?.event_date ?? null,
      createdAt: analysis.created_at,
    },
    sectionDetections: sectionDetections ?? [],
    transcriptDetections: transcriptDetections ?? [],
    eventWords: eventWords ?? [],
  });
}

// DELETE — remove an analysis (cascades detection rows)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params;
  const supabase = getServerSupabase();

  const { error } = await supabase
    .from("transcript_analyses")
    .delete()
    .eq("id", analysisId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

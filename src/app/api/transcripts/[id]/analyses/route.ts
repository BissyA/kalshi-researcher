import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countWordInText(word: string, text: string): number {
  const variants = word.split(/\s*\/\s*/).map((v) => v.trim()).filter(Boolean);
  let total = 0;
  for (const variant of variants) {
    const pattern = new RegExp(`\\b${escapeRegex(variant)}\\b`, "gi");
    const matches = text.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

// GET — list analyses for a transcript with event metadata + summary counts
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServerSupabase();

  const { data: analyses, error } = await supabase
    .from("transcript_analyses")
    .select("id, event_id, created_at, events(id, title, kalshi_event_ticker, event_date, status)")
    .eq("transcript_id", id)
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

  return NextResponse.json({
    analyses: (analyses ?? []).map((a) => {
      const ev = a.events as unknown as { id: string; title: string; kalshi_event_ticker: string; event_date: string | null; status: string } | null;
      return {
        id: a.id,
        eventId: a.event_id,
        eventTitle: ev?.title ?? null,
        eventTicker: ev?.kalshi_event_ticker ?? null,
        eventDate: ev?.event_date ?? null,
        eventStatus: ev?.status ?? null,
        createdAt: a.created_at,
        wordsFound: countsByAnalysis[a.id]?.wordsFound ?? 0,
        totalMentions: countsByAnalysis[a.id]?.totalMentions ?? 0,
      };
    }),
  });
}

// POST — create a new analysis + run word detection against the event's strikes
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { eventId } = body;

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Verify transcript is sectioned
  const { data: transcript, error: fetchError } = await supabase
    .from("transcripts")
    .select("id, sectioning_status")
    .eq("id", id)
    .single();

  if (fetchError || !transcript) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  if (transcript.sectioning_status !== "approved" && transcript.sectioning_status !== "sectioned") {
    return NextResponse.json(
      { error: "Sections must be approved before running an analysis" },
      { status: 400 }
    );
  }

  // Verify event exists and pull its strike words
  const { data: eventWords } = await supabase
    .from("words")
    .select("id, word")
    .eq("event_id", eventId);

  if (!eventWords || eventWords.length === 0) {
    return NextResponse.json(
      { error: "Selected event has no strike words to detect" },
      { status: 400 }
    );
  }

  // Upsert analysis row (dedup on transcript+event)
  const { data: analysis, error: analysisError } = await supabase
    .from("transcript_analyses")
    .upsert({ transcript_id: id, event_id: eventId }, { onConflict: "transcript_id,event_id" })
    .select()
    .single();

  if (analysisError || !analysis) {
    return NextResponse.json(
      { error: analysisError?.message ?? "Failed to create analysis" },
      { status: 500 }
    );
  }

  // Clear any prior detections for this analysis (idempotent re-run)
  await supabase.from("section_word_detections").delete().eq("analysis_id", analysis.id);
  await supabase.from("transcript_word_detections").delete().eq("analysis_id", analysis.id);

  // Fetch sections + segments
  const { data: sections } = await supabase
    .from("transcript_sections")
    .select("id, title, order_index")
    .eq("transcript_id", id)
    .order("order_index");

  const { data: segments } = await supabase
    .from("transcript_segments")
    .select("id, section_id, text, is_speaker_content")
    .eq("transcript_id", id)
    .order("order_index");

  if (!sections || !segments) {
    return NextResponse.json({ error: "Transcript sections or segments missing" }, { status: 500 });
  }

  const sectionTexts: Record<string, string> = {};
  for (const section of sections) {
    sectionTexts[section.id] = segments
      .filter((s) => s.section_id === section.id && s.is_speaker_content)
      .map((s) => s.text)
      .join(" ");
  }

  const sectionDetections: {
    analysis_id: string;
    section_id: string;
    transcript_id: string;
    word: string;
    word_id: string | null;
    mention_count: number;
  }[] = [];
  const transcriptTotals: Record<string, { total: number; sections: number; word_id: string | null }> = {};

  for (const section of sections) {
    const text = sectionTexts[section.id] || "";
    if (!text) continue;
    for (const { word, id: wordId } of eventWords) {
      const count = countWordInText(word, text);
      if (count > 0) {
        sectionDetections.push({
          analysis_id: analysis.id,
          section_id: section.id,
          transcript_id: id,
          word,
          word_id: wordId,
          mention_count: count,
        });
        const entry = transcriptTotals[word] ??= { total: 0, sections: 0, word_id: wordId };
        entry.total += count;
        entry.sections += 1;
      }
    }
  }

  if (sectionDetections.length > 0) {
    await supabase.from("section_word_detections").insert(sectionDetections);
  }

  const transcriptDetections = Object.entries(transcriptTotals).map(([word, data]) => ({
    analysis_id: analysis.id,
    transcript_id: id,
    word,
    word_id: data.word_id,
    total_count: data.total,
    section_count: data.sections,
  }));

  if (transcriptDetections.length > 0) {
    await supabase.from("transcript_word_detections").insert(transcriptDetections);
  }

  return NextResponse.json({
    analysisId: analysis.id,
    wordsFound: Object.keys(transcriptTotals).length,
    totalMentions: Object.values(transcriptTotals).reduce((sum, d) => sum + d.total, 0),
  });
}

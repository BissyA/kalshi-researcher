import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET — batch fetch transcript data for the research-page Combined view.
// Query: ?ids=uuid1,uuid2,uuid3&eventId=<research-event-id>[&speakerId=X]
//
// Strict event scoping: only transcripts with an analysis against `eventId` contribute data.
// Transcripts without a matching analysis are returned in `missingTranscriptIds` so the UI
// can prompt the user to run analyses before they show up in Combined.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const eventId = searchParams.get("eventId");
  // speakerId param is retained in the query string for backwards compatibility but ignored
  // (categories became global in migration 020).
  void searchParams.get("speakerId");

  if (!idsParam) {
    return NextResponse.json({ error: "ids parameter is required" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "eventId parameter is required" }, { status: 400 });
  }

  const ids = idsParam.split(",").filter(Boolean);
  if (ids.length === 0 || ids.length > 10) {
    return NextResponse.json(
      { error: "Provide 1-10 transcript IDs" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  // Fetch only analyses for the specified event. Transcripts without one are "missing".
  const { data: analysesForEvent, error: analysesError } = await supabase
    .from("transcript_analyses")
    .select("id, transcript_id")
    .in("transcript_id", ids)
    .eq("event_id", eventId);

  if (analysesError) {
    return NextResponse.json({ error: analysesError.message }, { status: 500 });
  }

  const analysisByTranscript = new Map<string, string>();
  for (const a of analysesForEvent ?? []) {
    analysisByTranscript.set(a.transcript_id as string, a.id as string);
  }
  const includedIds = [...analysisByTranscript.keys()];
  const missingTranscriptIds = ids.filter((id) => !analysisByTranscript.has(id));

  // If no transcripts have analyses yet, return the event's strike words + empty structure.
  if (includedIds.length === 0) {
    const { data: words } = await supabase
      .from("words")
      .select("word")
      .eq("event_id", eventId);
    return NextResponse.json({
      transcripts: [],
      sections: [],
      segments: [],
      wordDetections: [],
      eventWords: words ?? [],
      categories: [],
      missingTranscriptIds,
    });
  }

  const analysisIds = [...analysisByTranscript.values()];

  const [transcriptsRes, sectionsRes, segmentsRes, detectionsRes, eventWordsRes, categoriesRes] =
    await Promise.all([
      supabase
        .from("transcripts")
        .select("id, title, event_date, word_count, speaker_id, event_id")
        .in("id", includedIds),
      supabase
        .from("transcript_sections")
        .select("*")
        .in("transcript_id", includedIds)
        .order("order_index"),
      supabase
        .from("transcript_segments")
        .select("*")
        .in("transcript_id", includedIds)
        .order("order_index"),
      supabase
        .from("section_word_detections")
        .select("section_id, transcript_id, word, mention_count")
        .in("analysis_id", analysisIds),
      supabase
        .from("words")
        .select("word")
        .eq("event_id", eventId),
      supabase
        .from("speaker_categories")
        .select("name, color")
        .eq("status", "approved")
        .order("order_index"),
    ]);

  if (transcriptsRes.error) {
    return NextResponse.json({ error: transcriptsRes.error.message }, { status: 500 });
  }

  const sectionMap = new Map<string, { word: string; count: number }[]>();
  for (const d of detectionsRes.data ?? []) {
    const list = sectionMap.get(d.section_id) ?? [];
    list.push({ word: d.word, count: d.mention_count });
    sectionMap.set(d.section_id, list);
  }

  const sections = sectionsRes.data ?? [];
  const wordDetections = sections
    .filter((sec) => sectionMap.has(sec.id))
    .map((sec) => ({
      sectionId: sec.id,
      title: sec.title,
      words: sectionMap.get(sec.id) ?? [],
    }));

  return NextResponse.json({
    transcripts: (transcriptsRes.data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      eventDate: t.event_date,
      wordCount: t.word_count,
    })),
    sections,
    segments: segmentsRes.data ?? [],
    wordDetections,
    eventWords: eventWordsRes.data ?? [],
    categories: (categoriesRes.data ?? []).map((c) => ({
      name: (c as { name: string; color: string }).name,
      color: (c as { name: string; color: string }).color,
    })),
    missingTranscriptIds,
  });
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET — batch fetch transcript data for composite view
// Query: ?ids=uuid1,uuid2,uuid3&speakerId=X
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const speakerId = searchParams.get("speakerId");

  if (!idsParam) {
    return NextResponse.json({ error: "ids parameter is required" }, { status: 400 });
  }

  const ids = idsParam.split(",").filter(Boolean);
  if (ids.length === 0 || ids.length > 10) {
    return NextResponse.json(
      { error: "Provide 1-10 transcript IDs" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  // 4 parallel queries
  const [transcriptsRes, sectionsRes, segmentsRes, detectionsRes, categoriesRes] =
    await Promise.all([
      // 1. Transcript metadata (include event_id for fetching strike words)
      supabase
        .from("transcripts")
        .select("id, title, event_date, word_count, speaker_id, event_id")
        .in("id", ids),
      // 2. All sections across all transcripts
      supabase
        .from("transcript_sections")
        .select("*")
        .in("transcript_id", ids)
        .order("order_index"),
      // 3. All segments across all transcripts
      supabase
        .from("transcript_segments")
        .select("*")
        .in("transcript_id", ids)
        .order("order_index"),
      // 4. Section-level word detections
      supabase
        .from("section_word_detections")
        .select("section_id, transcript_id, word, mention_count")
        .in("transcript_id", ids),
      // 5. Speaker categories (for colors)
      speakerId
        ? supabase
            .from("speaker_categories")
            .select("name, color")
            .eq("speaker_id", speakerId)
            .eq("status", "approved")
            .order("order_index")
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (transcriptsRes.error) {
    return NextResponse.json(
      { error: transcriptsRes.error.message },
      { status: 500 }
    );
  }

  // Fetch strike words from all linked Kalshi events
  const eventIds = (transcriptsRes.data ?? [])
    .map((t) => t.event_id)
    .filter((id): id is string => !!id);

  let eventWords: { word: string }[] = [];
  if (eventIds.length > 0) {
    const uniqueEventIds = [...new Set(eventIds)];
    const { data: words } = await supabase
      .from("words")
      .select("word")
      .in("event_id", uniqueEventIds);
    // Deduplicate by lowercase word
    const seen = new Set<string>();
    for (const w of words ?? []) {
      const lower = w.word.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        eventWords.push({ word: w.word });
      }
    }
  }

  // Build word detections grouped by section (same format as word-detections endpoint)
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
    sections: sections,
    segments: segmentsRes.data ?? [],
    wordDetections,
    eventWords,
    categories: (categoriesRes.data ?? []).map((c) => ({
      name: (c as { name: string; color: string }).name,
      color: (c as { name: string; color: string }).color,
    })),
  });
}

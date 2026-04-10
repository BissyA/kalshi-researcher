import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Count occurrences of a word (or slash-separated variants) in text.
 * Case-insensitive, whole-word matching.
 */
function countWordInText(word: string, text: string): number {
  // Handle slash-separated variants: "Afford / Affordable / Affordability"
  const variants = word.split(/\s*\/\s*/).map((v) => v.trim()).filter(Boolean);
  let total = 0;
  for (const variant of variants) {
    const pattern = new RegExp(`\\b${escapeRegex(variant)}\\b`, "gi");
    const matches = text.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { words: customWords, eventId } = body;

  const supabase = getServerSupabase();

  // Verify transcript is sectioned/approved
  const { data: transcript, error: fetchError } = await supabase
    .from("transcripts")
    .select("id, sectioning_status, event_id")
    .eq("id", id)
    .single();

  if (fetchError || !transcript) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  if (transcript.sectioning_status !== "approved" && transcript.sectioning_status !== "sectioned") {
    return NextResponse.json(
      { error: "Sections must be approved before word detection" },
      { status: 400 }
    );
  }

  // Determine word list
  let wordList: { word: string; word_id: string | null }[] = [];
  const resolvedEventId = eventId || transcript.event_id;

  if (resolvedEventId) {
    // Pull words from linked event
    const { data: eventWords } = await supabase
      .from("words")
      .select("id, word")
      .eq("event_id", resolvedEventId);

    if (eventWords && eventWords.length > 0) {
      wordList = eventWords.map((w) => ({ word: w.word, word_id: w.id }));
    }
  }

  if (wordList.length === 0 && customWords && Array.isArray(customWords)) {
    wordList = customWords.map((w: string) => ({ word: w, word_id: null }));
  }

  if (wordList.length === 0) {
    return NextResponse.json(
      { error: "No words to detect. Provide a word list or link the transcript to an event." },
      { status: 400 }
    );
  }

  // Fetch sections and their speaker-only segments
  const { data: sections } = await supabase
    .from("transcript_sections")
    .select("id, title, order_index")
    .eq("transcript_id", id)
    .order("order_index");

  if (!sections || sections.length === 0) {
    return NextResponse.json({ error: "No sections found" }, { status: 400 });
  }

  const { data: segments } = await supabase
    .from("transcript_segments")
    .select("id, section_id, text, is_speaker_content")
    .eq("transcript_id", id)
    .order("order_index");

  if (!segments) {
    return NextResponse.json({ error: "No segments found" }, { status: 400 });
  }

  // Build speaker text per section
  const sectionTexts: Record<string, string> = {};
  for (const section of sections) {
    const sectionSegments = segments.filter(
      (s) => s.section_id === section.id && s.is_speaker_content
    );
    sectionTexts[section.id] = sectionSegments.map((s) => s.text).join(" ");
  }

  // Delete existing detections
  await supabase
    .from("section_word_detections")
    .delete()
    .eq("transcript_id", id);

  await supabase
    .from("transcript_word_detections")
    .delete()
    .eq("transcript_id", id);

  // Detect words per section
  const sectionDetections: {
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

    for (const { word, word_id } of wordList) {
      const count = countWordInText(word, text);
      if (count > 0) {
        sectionDetections.push({
          section_id: section.id,
          transcript_id: id,
          word,
          word_id,
          mention_count: count,
        });

        if (!transcriptTotals[word]) {
          transcriptTotals[word] = { total: 0, sections: 0, word_id };
        }
        transcriptTotals[word].total += count;
        transcriptTotals[word].sections += 1;
      }
    }
  }

  // Insert section-level detections
  if (sectionDetections.length > 0) {
    const { error: secError } = await supabase
      .from("section_word_detections")
      .insert(sectionDetections);

    if (secError) {
      console.error("[detect-words] Section detection insert error:", secError);
    }
  }

  // Insert transcript-level summaries
  const transcriptDetections = Object.entries(transcriptTotals).map(([word, data]) => ({
    transcript_id: id,
    word,
    word_id: data.word_id,
    total_count: data.total,
    section_count: data.sections,
  }));

  if (transcriptDetections.length > 0) {
    const { error: trError } = await supabase
      .from("transcript_word_detections")
      .insert(transcriptDetections);

    if (trError) {
      console.error("[detect-words] Transcript detection insert error:", trError);
    }
  }

  return NextResponse.json({
    sectionDetections: sectionDetections.length,
    transcriptDetections: transcriptDetections.length,
    wordsFound: Object.keys(transcriptTotals).length,
    totalMentions: Object.values(transcriptTotals).reduce((sum, d) => sum + d.total, 0),
    details: sections.map((sec) => ({
      sectionId: sec.id,
      title: sec.title,
      words: sectionDetections
        .filter((d) => d.section_id === sec.id)
        .map((d) => ({ word: d.word, count: d.mention_count })),
    })),
  });
}

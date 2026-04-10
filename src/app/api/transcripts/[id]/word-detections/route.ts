import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET — load saved word detection results
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServerSupabase();

  // Fetch section-level detections
  const { data: sectionDetections } = await supabase
    .from("section_word_detections")
    .select("section_id, word, mention_count")
    .eq("transcript_id", id);

  if (!sectionDetections || sectionDetections.length === 0) {
    return NextResponse.json({ details: [], wordsFound: 0, totalMentions: 0 });
  }

  // Fetch sections for titles
  const { data: sections } = await supabase
    .from("transcript_sections")
    .select("id, title, order_index")
    .eq("transcript_id", id)
    .order("order_index");

  // Group by section
  const sectionMap = new Map<string, { word: string; count: number }[]>();
  for (const d of sectionDetections) {
    const list = sectionMap.get(d.section_id) ?? [];
    list.push({ word: d.word, count: d.mention_count });
    sectionMap.set(d.section_id, list);
  }

  // Build details in section order
  const details = (sections ?? []).map((sec) => ({
    sectionId: sec.id,
    title: sec.title,
    words: sectionMap.get(sec.id) ?? [],
  }));

  // Compute totals
  const wordSet = new Set(sectionDetections.map((d) => d.word));
  const totalMentions = sectionDetections.reduce((sum, d) => sum + d.mention_count, 0);

  return NextResponse.json({
    details,
    wordsFound: wordSet.size,
    totalMentions,
  });
}

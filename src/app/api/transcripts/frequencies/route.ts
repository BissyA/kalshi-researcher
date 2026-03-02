import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wordsParam = searchParams.get("words");
  const speaker = searchParams.get("speaker");

  if (!wordsParam) {
    return NextResponse.json(
      { error: "words query parameter is required (comma-separated)" },
      { status: 400 }
    );
  }

  const words = wordsParam.split(",").map((w) => w.trim()).filter(Boolean);

  const supabase = getServerSupabase();

  let query = supabase
    .from("transcripts")
    .select("id, full_text, word_count");

  if (speaker) {
    query = query.ilike("speaker", speaker);
  }

  const { data: transcripts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter out metadata-only transcripts
  const validTranscripts = (transcripts ?? []).filter(
    (t) => t.full_text && t.full_text !== "(metadata only)" && t.full_text.length > 50
  );

  const total = validTranscripts.length;

  const frequencies: Record<string, { count: number; total: number; frequency: number; avgMentions: number }> = {};

  for (const word of words) {
    // Handle slash-separated variants (e.g., "Deport / Deportation")
    const variants = word.split(/\s*\/\s*/).map((v) => v.trim().toLowerCase());
    let appearedIn = 0;
    let totalMentions = 0;

    for (const transcript of validTranscripts) {
      const text = transcript.full_text.toLowerCase();
      let found = false;

      for (const variant of variants) {
        // Count occurrences using word boundary-ish matching
        const regex = new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        const matches = transcript.full_text.match(regex);
        if (matches && matches.length > 0) {
          found = true;
          totalMentions += matches.length;
        }
      }

      if (found) {
        appearedIn++;
      }
    }

    frequencies[word] = {
      count: appearedIn,
      total,
      frequency: total > 0 ? appearedIn / total : 0,
      avgMentions: appearedIn > 0 ? totalMentions / appearedIn : 0,
    };
  }

  return NextResponse.json({ frequencies, totalTranscripts: total });
}

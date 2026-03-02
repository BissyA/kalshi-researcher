import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json();
  const { speaker, title, eventType, eventDate, sourceUrl, fullText } = body;

  if (!speaker || !title || !fullText) {
    return NextResponse.json(
      { error: "speaker, title, and fullText are required" },
      { status: 400 }
    );
  }

  const wordCount = fullText.trim().split(/\s+/).length;

  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("transcripts")
    .upsert(
      {
        speaker,
        title,
        event_type: eventType || null,
        event_date: eventDate || null,
        source_url: sourceUrl || null,
        full_text: fullText,
        word_count: wordCount,
      },
      { onConflict: "speaker,title,event_date" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transcript: data });
}

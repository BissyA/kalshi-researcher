import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json();
  const { speakerId, eventId, title, eventType, eventDate, sourceUrl, fullText } = body;

  if (!speakerId || !title || !fullText) {
    return NextResponse.json(
      { error: "speakerId, title, and fullText are required" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  // Look up speaker name for backward compat with existing speaker column
  const { data: speaker } = await supabase
    .from("speakers")
    .select("name")
    .eq("id", speakerId)
    .single();

  if (!speaker) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  const wordCount = fullText.trim().split(/\s+/).length;

  const { data, error } = await supabase
    .from("transcripts")
    .insert({
      speaker: speaker.name,
      speaker_id: speakerId,
      event_id: eventId || null,
      title,
      event_type: eventType || null,
      event_date: eventDate || null,
      source_url: sourceUrl || null,
      full_text: fullText,
      raw_text: fullText,
      word_count: wordCount,
      cleaning_status: "pending",
      sectioning_status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transcript: data });
}

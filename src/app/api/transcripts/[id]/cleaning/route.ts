import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET — fetch current cleaning state (segments + status)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServerSupabase();

  const { data: transcript, error } = await supabase
    .from("transcripts")
    .select("id, cleaning_status, raw_text, cleaned_text")
    .eq("id", id)
    .single();

  if (error || !transcript) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  const { data: segments } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("transcript_id", id)
    .order("order_index");

  return NextResponse.json({
    cleaningStatus: transcript.cleaning_status,
    rawText: transcript.raw_text,
    cleanedText: transcript.cleaned_text,
    segments: segments ?? [],
  });
}

// PATCH — approve cleaning or adjust segments
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { action, segments: segmentUpdates } = body;

  const supabase = getServerSupabase();

  // Verify transcript exists
  const { data: transcript, error: fetchError } = await supabase
    .from("transcripts")
    .select("id, cleaning_status")
    .eq("id", id)
    .single();

  if (fetchError || !transcript) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  if (action === "adjust" && Array.isArray(segmentUpdates)) {
    // Update individual segments (toggle speaker/non-speaker, change attribution)
    for (const seg of segmentUpdates) {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (seg.is_speaker_content !== undefined) update.is_speaker_content = seg.is_speaker_content;
      if (seg.attribution !== undefined) update.attribution = seg.attribution;

      await supabase
        .from("transcript_segments")
        .update(update)
        .eq("id", seg.id);
    }

    // Rebuild cleaned_text from updated segments
    const { data: allSegments } = await supabase
      .from("transcript_segments")
      .select("text, is_speaker_content")
      .eq("transcript_id", id)
      .order("order_index");

    const cleanedText = (allSegments ?? [])
      .filter((s) => s.is_speaker_content)
      .map((s) => s.text)
      .join("\n\n");

    await supabase
      .from("transcripts")
      .update({ cleaned_text: cleanedText })
      .eq("id", id);

    return NextResponse.json({ success: true, cleanedText });
  }

  if (action === "approve") {
    // Rebuild cleaned_text one final time and set status
    const { data: allSegments } = await supabase
      .from("transcript_segments")
      .select("text, is_speaker_content")
      .eq("transcript_id", id)
      .order("order_index");

    const cleanedText = (allSegments ?? [])
      .filter((s) => s.is_speaker_content)
      .map((s) => s.text)
      .join("\n\n");

    await supabase
      .from("transcripts")
      .update({
        cleaned_text: cleanedText,
        cleaning_status: "approved",
        cleaned_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true, cleaningStatus: "approved", cleanedText });
  }

  return NextResponse.json({ error: "Invalid action. Use 'approve' or 'adjust'" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: transcriptId } = await params;
  const { segmentId, startOffset, endOffset } = await request.json();

  if (!segmentId || startOffset === undefined || endOffset === undefined) {
    return NextResponse.json({ error: "segmentId, startOffset, endOffset required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Fetch the segment to split
  const { data: segment, error } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("id", segmentId)
    .eq("transcript_id", transcriptId)
    .single();

  if (error || !segment) {
    return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  }

  const text = segment.text as string;
  const before = text.slice(0, startOffset).trim();
  const selected = text.slice(startOffset, endOffset).trim();
  const after = text.slice(endOffset).trim();

  if (!selected) {
    return NextResponse.json({ error: "No text selected" }, { status: 400 });
  }

  // Build new segments (skip empty parts)
  const newSegments: Array<{
    transcript_id: string;
    section_id: string | null;
    order_index: number;
    text: string;
    is_speaker_content: boolean;
    attribution: string | null;
  }> = [];

  const flippedStatus = !segment.is_speaker_content;
  let idx = 0;

  if (before) {
    newSegments.push({
      transcript_id: transcriptId,
      section_id: segment.section_id,
      order_index: idx++,
      text: before,
      is_speaker_content: segment.is_speaker_content,
      attribution: segment.attribution,
    });
  }

  newSegments.push({
    transcript_id: transcriptId,
    section_id: segment.section_id,
    order_index: idx++,
    text: selected,
    is_speaker_content: flippedStatus,
    attribution: flippedStatus ? null : segment.attribution,
  });

  if (after) {
    newSegments.push({
      transcript_id: transcriptId,
      section_id: segment.section_id,
      order_index: idx++,
      text: after,
      is_speaker_content: segment.is_speaker_content,
      attribution: segment.attribution,
    });
  }

  // Shift order_index of all segments after the original to make room
  const originalIndex = segment.order_index as number;
  const slotsNeeded = newSegments.length - 1; // replacing 1 segment with N

  if (slotsNeeded > 0) {
    await supabase.rpc("increment_order_index", {
      p_transcript_id: transcriptId,
      p_after_index: originalIndex,
      p_increment: slotsNeeded,
    }).then(({ error: rpcError }) => {
      // If RPC doesn't exist, do it manually
      if (rpcError) {
        return supabase
          .from("transcript_segments")
          .select("id, order_index")
          .eq("transcript_id", transcriptId)
          .gt("order_index", originalIndex)
          .then(async ({ data: laterSegs }) => {
            if (laterSegs) {
              for (const s of laterSegs) {
                await supabase
                  .from("transcript_segments")
                  .update({ order_index: s.order_index + slotsNeeded })
                  .eq("id", s.id);
              }
            }
          });
      }
    });
  }

  // Delete the original segment
  await supabase.from("transcript_segments").delete().eq("id", segmentId);

  // Assign correct order_index values
  for (let i = 0; i < newSegments.length; i++) {
    newSegments[i].order_index = originalIndex + i;
  }

  // Insert new segments
  const { data: inserted, error: insertError } = await supabase
    .from("transcript_segments")
    .insert(newSegments)
    .select("*")
    .order("order_index");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Reload all segments for the transcript
  const { data: allSegments } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("transcript_id", transcriptId)
    .order("order_index");

  return NextResponse.json({ segments: allSegments ?? inserted });
}

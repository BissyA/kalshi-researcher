import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { callAgentForJson } from "@/lib/claude-client";

interface CleaningSegment {
  text: string;
  is_speaker_content: boolean;
  attribution: string | null;
}

interface CleaningResult {
  segments: CleaningSegment[];
}

const CLEANING_SYSTEM_PROMPT = `You are a transcript cleaning assistant. Your job is to analyze a raw transcript and identify which parts were spoken by the TARGET SPEAKER vs other people (interviewers, moderators, audience members, other panelists, stage directions, timestamps, etc.).

CRITICAL RULES:
1. If the target speaker QUOTES someone else or READS a statement from someone else, that counts as SPEAKER CONTENT — because the speaker physically said those words.
2. Keep the text EXACTLY as-is. Do not edit, correct, paraphrase, or summarize any text.
3. Split the transcript into segments. Each segment should be a coherent chunk of text from a single source (speaker, interviewer, stage direction, etc.).
4. Do not merge separate speakers' text into one segment.
5. Timestamps, [applause], [laughter], stage directions, and similar annotations are NOT speaker content — mark them with attribution "Stage Direction".
6. Interviewer/moderator questions are NOT speaker content — mark them with the appropriate attribution (e.g. "Interviewer", "Moderator", "Reporter", the person's name if known).

Return JSON with this structure:
{
  "segments": [
    { "text": "...", "is_speaker_content": true, "attribution": null },
    { "text": "...", "is_speaker_content": false, "attribution": "Moderator" },
    ...
  ]
}

The segments array must cover the ENTIRE transcript text in order. No text should be lost.`;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServerSupabase();

  // Fetch transcript
  const { data: transcript, error: fetchError } = await supabase
    .from("transcripts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !transcript) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  const rawText = transcript.raw_text || transcript.full_text;
  if (!rawText || rawText === "(metadata only)") {
    return NextResponse.json({ error: "No transcript text to clean" }, { status: 400 });
  }

  // Set status to processing
  await supabase
    .from("transcripts")
    .update({ cleaning_status: "processing" })
    .eq("id", id);

  try {
    // Call Claude to segment the transcript
    const { data: result } = await callAgentForJson<CleaningResult>({
      systemPrompt: CLEANING_SYSTEM_PROMPT,
      userMessage: `Target speaker: ${transcript.speaker}\n\nTranscript to clean:\n\n${rawText}`,
      enableWebSearch: false,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 16000,
    });

    const segments = result.segments;
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      throw new Error("AI returned no segments");
    }

    // Delete any existing segments for this transcript
    await supabase
      .from("transcript_segments")
      .delete()
      .eq("transcript_id", id);

    // Insert segments
    const segmentRows = segments.map((seg, i) => ({
      transcript_id: id,
      order_index: i,
      text: seg.text,
      is_speaker_content: seg.is_speaker_content,
      attribution: seg.attribution || null,
    }));

    const { error: insertError } = await supabase
      .from("transcript_segments")
      .insert(segmentRows);

    if (insertError) {
      throw new Error(`Failed to insert segments: ${insertError.message}`);
    }

    // Build cleaned_text from speaker-only segments
    const cleanedText = segments
      .filter((s) => s.is_speaker_content)
      .map((s) => s.text)
      .join("\n\n");

    // Update transcript status
    await supabase
      .from("transcripts")
      .update({
        cleaned_text: cleanedText,
        cleaning_status: "cleaned",
        cleaned_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Fetch inserted segments with IDs
    const { data: savedSegments } = await supabase
      .from("transcript_segments")
      .select("*")
      .eq("transcript_id", id)
      .order("order_index");

    return NextResponse.json({
      segments: savedSegments ?? [],
      cleanedText,
      status: "cleaned",
    });
  } catch (err) {
    console.error("[clean] AI cleaning failed:", err);
    await supabase
      .from("transcripts")
      .update({ cleaning_status: "pending" })
      .eq("id", id);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cleaning failed" },
      { status: 500 }
    );
  }
}

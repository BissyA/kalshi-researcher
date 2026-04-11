import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { YoutubeTranscript } from "youtube-transcript";

function extractVideoId(input: string): string | null {
  // Handle various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // bare video ID
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { speakerId, youtubeUrl, title, eventId, eventDate, sourceUrl } = body as {
    speakerId?: string;
    youtubeUrl?: string;
    title?: string;
    eventId?: string;
    eventDate?: string;
    sourceUrl?: string;
  };

  if (!speakerId || !youtubeUrl) {
    return NextResponse.json(
      { error: "speakerId and youtubeUrl are required" },
      { status: 400 }
    );
  }

  const videoId = extractVideoId(youtubeUrl.trim());
  if (!videoId) {
    return NextResponse.json(
      { error: "Invalid YouTube URL or video ID" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  // Look up speaker name
  const { data: speaker } = await supabase
    .from("speakers")
    .select("name")
    .eq("id", speakerId)
    .single();

  if (!speaker) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  try {
    // Fetch transcript from YouTube
    const transcriptEntries = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: "en",
    });

    if (!transcriptEntries || transcriptEntries.length === 0) {
      return NextResponse.json(
        { error: "No transcript available for this video. The video may not have captions enabled." },
        { status: 404 }
      );
    }

    // Join transcript entries into continuous text
    // Each entry is a caption segment — join with spaces, clean up whitespace
    const rawText = transcriptEntries
      .map((entry) => entry.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/\[Music\]/gi, "")
      .replace(/\[Applause\]/gi, "")
      .replace(/\[Laughter\]/gi, "")
      .trim();

    if (rawText.length < 100) {
      return NextResponse.json(
        { error: "Transcript is too short — may be incomplete or unavailable" },
        { status: 400 }
      );
    }

    const wordCount = rawText.split(/\s+/).length;
    const finalTitle = title?.trim() || `YouTube transcript (${videoId})`;
    const finalSourceUrl = sourceUrl || youtubeUrl;

    const { data, error } = await supabase
      .from("transcripts")
      .insert({
        speaker: speaker.name,
        speaker_id: speakerId,
        event_id: eventId || null,
        title: finalTitle,
        event_date: eventDate || null,
        source_url: finalSourceUrl,
        full_text: rawText,
        raw_text: rawText,
        word_count: wordCount,
        cleaning_status: "pending",
        sectioning_status: "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ transcript: data, wordCount });
  } catch (err) {
    console.error("[upload-youtube] Transcript fetch failed:", err);

    const message = err instanceof Error ? err.message : "Failed to fetch YouTube transcript";

    // Provide user-friendly error messages
    if (message.includes("Disabled") || message.includes("disabled")) {
      return NextResponse.json(
        { error: "Transcripts are disabled for this video" },
        { status: 400 }
      );
    }
    if (message.includes("Unavailable") || message.includes("unavailable")) {
      return NextResponse.json(
        { error: "Video is unavailable or private" },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

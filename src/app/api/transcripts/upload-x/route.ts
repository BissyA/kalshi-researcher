import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { getServerSupabase } from "@/lib/supabase";

function isValidXUrl(input: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?(x|twitter)\.com\/i\/broadcasts\/[a-zA-Z0-9_-]+/i,
    /^https?:\/\/(www\.)?(x|twitter)\.com\/i\/spaces\/[a-zA-Z0-9_-]+/i,
    /^https?:\/\/(www\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i,
  ];
  return patterns.some((re) => re.test(input.trim()));
}

export async function POST(request: Request) {
  const body = await request.json();
  const { speakerId, xUrl, title, eventId, eventDate, sourceUrl, useCookies } = body as {
    speakerId?: string;
    xUrl?: string;
    title?: string;
    eventId?: string;
    eventDate?: string;
    sourceUrl?: string;
    useCookies?: boolean;
  };

  if (!speakerId || !xUrl) {
    return NextResponse.json({ error: "speakerId and xUrl are required" }, { status: 400 });
  }

  const trimmedUrl = xUrl.trim();
  if (!isValidXUrl(trimmedUrl)) {
    return NextResponse.json(
      { error: "Invalid X URL. Expected x.com/i/broadcasts/..., x.com/i/spaces/..., or x.com/<user>/status/..." },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  const { data: speaker } = await supabase
    .from("speakers")
    .select("name")
    .eq("id", speakerId)
    .single();

  if (!speaker) {
    return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
  }

  // Refuse if another transcription is already active (UX check — the worker lockfile is the real guard)
  const { data: activeRows } = await supabase
    .from("transcripts")
    .select("id")
    .in("transcription_status", ["downloading", "transcribing"])
    .limit(1);
  if (activeRows && activeRows.length > 0) {
    return NextResponse.json(
      {
        error:
          "Another transcription is in progress. Please wait for it to finish before starting another.",
      },
      { status: 409 }
    );
  }

  const finalTitle = title?.trim() || `X broadcast transcript`;
  const finalSourceUrl = sourceUrl || trimmedUrl;

  // Insert the transcript row immediately — worker will fill raw_text/full_text
  const { data: transcript, error: insertError } = await supabase
    .from("transcripts")
    .insert({
      speaker: speaker.name,
      speaker_id: speakerId,
      event_id: eventId || null,
      title: finalTitle,
      event_date: eventDate || null,
      source_url: finalSourceUrl,
      full_text: "",
      raw_text: "",
      word_count: 0,
      cleaning_status: "pending",
      sectioning_status: "pending",
      transcription_status: "downloading",
      transcription_progress: "Queued...",
      source_platform: "x",
    })
    .select()
    .single();

  if (insertError || !transcript) {
    return NextResponse.json(
      { error: insertError?.message || "Failed to create transcript row" },
      { status: 500 }
    );
  }

  // Spawn via a bash wrapper that uses setsid + nohup + disown to fully
  // orphan the worker from Next.js. Spawning node directly with
  // detached+unref+stdio:ignore does NOT survive Next.js dev server
  // restarts/recompiles — the shell wrapper does.
  const wrapperPath = path.resolve(process.cwd(), "scripts/transcribe-x.sh");

  const workerArgs = [transcript.id, trimmedUrl];
  if (useCookies) workerArgs.push("--cookies-from-browser");

  const child = spawn(wrapperPath, workerArgs, {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
  });
  child.unref();

  return NextResponse.json({ transcript });
}

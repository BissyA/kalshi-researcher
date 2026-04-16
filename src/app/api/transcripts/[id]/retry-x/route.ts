import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServerSupabase();

  const { data: transcript } = await supabase
    .from("transcripts")
    .select("id, source_url, source_platform, transcription_status")
    .eq("id", id)
    .single();

  if (!transcript) return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  if (transcript.source_platform !== "x") {
    return NextResponse.json({ error: "Retry is only supported for X transcripts" }, { status: 400 });
  }
  if (!transcript.source_url) {
    return NextResponse.json({ error: "Transcript has no source URL" }, { status: 400 });
  }
  if (transcript.transcription_status === "downloading" || transcript.transcription_status === "transcribing") {
    return NextResponse.json({ error: "Transcription is already running" }, { status: 409 });
  }

  // Refuse if another transcription is active
  const { data: activeRows } = await supabase
    .from("transcripts")
    .select("id")
    .in("transcription_status", ["downloading", "transcribing"])
    .limit(1);
  if (activeRows && activeRows.length > 0) {
    return NextResponse.json(
      { error: "Another transcription is in progress." },
      { status: 409 }
    );
  }

  await supabase
    .from("transcripts")
    .update({
      transcription_status: "downloading",
      transcription_progress: "Queued (retry)...",
      transcription_error: null,
    })
    .eq("id", id);

  const wrapperPath = path.resolve(process.cwd(), "scripts/transcribe-x.sh");

  const child = spawn(wrapperPath, [id, transcript.source_url], {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
  });
  child.unref();

  return NextResponse.json({ ok: true });
}

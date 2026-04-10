import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const path = await import("path");
  const { PDFParse } = await import("pdf-parse");
  // Next.js dev server can't resolve the worker automatically — set it explicitly
  const workerPath = path.resolve("node_modules/pdf-parse/dist/worker/pdf.worker.mjs");
  PDFParse.setWorker(workerPath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const speakerId = formData.get("speakerId") as string | null;
  const eventId = formData.get("eventId") as string | null;
  const title = formData.get("title") as string | null;
  const eventDate = formData.get("eventDate") as string | null;
  const sourceUrl = formData.get("sourceUrl") as string | null;

  if (!file || !speakerId) {
    return NextResponse.json(
      { error: "file and speakerId are required" },
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
    // Extract text from PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    let rawText: string = await extractTextFromPdf(buffer);

    if (!rawText || rawText.trim().length < 100) {
      return NextResponse.json(
        { error: "Could not extract sufficient text from PDF" },
        { status: 400 }
      );
    }

    // Clean up factbase-specific noise
    rawText = cleanFactbaseText(rawText);

    // Auto-detect title from PDF if not provided
    const finalTitle = title?.trim() || extractTitleFromText(rawText) || file.name.replace(/\.pdf$/i, "");

    const wordCount = rawText.trim().split(/\s+/).length;

    const { data, error } = await supabase
      .from("transcripts")
      .insert({
        speaker: speaker.name,
        speaker_id: speakerId,
        event_id: eventId || null,
        title: finalTitle,
        event_date: eventDate || null,
        source_url: sourceUrl || null,
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

    return NextResponse.json({ transcript: data });
  } catch (err) {
    console.error("[upload-pdf] PDF parsing failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF parsing failed" },
      { status: 500 }
    );
  }
}

/**
 * Clean up factbase PDF extraction artifacts.
 * Removes: page headers/footers, StressLens labels, timestamps in header format,
 * navigation elements, and excessive whitespace.
 */
function cleanFactbaseText(text: string): string {
  return text
    // Remove factbase page headers/footers
    .replace(/\d{2}\/\d{2}\/\d{4},\s*\d{2}:\d{2}\s+Factbase Transcripts.*Roll Call/g, "")
    .replace(/https:\/\/rollcall\.com\/factbase\/.*?\d+\/\d+/g, "")
    // Remove StressLens labels
    .replace(/\bNO STRESSLENS\b/g, "")
    .replace(/\bNO SIGNAL \(\d+\)\b/g, "")
    .replace(/\bStressLens Over Time\b/g, "")
    .replace(/\bStressLens\b/g, "")
    // Remove score axis labels (0, 0.1, 0.2, etc.)
    .replace(/^[0-9]\.[0-9]$/gm, "")
    .replace(/^[01]$/gm, "")
    // Remove time axis labels
    .replace(/\d{2}:\d{2}:\d{2}\s+\d{2}:\d{2}:\d{2}.*?Time/g, "")
    // Remove "X" close buttons
    .replace(/^\s*X\s*$/gm, "")
    // Remove page navigation elements
    .replace(/Powered by FiscalNote StressLens/g, "")
    .replace(/Donald J\. Trump/g, "")
    .replace(/Transcripts\s+White House Calendar\s+White House Press Releases/g, "")
    .replace(/Full Transcript/g, "")
    .replace(/\d+ Topics\s+\d+ Entities\s+Moderation\s+\d+ Speakers/g, "")
    // Remove the chart time axis
    .replace(/\d{2}:\d{2}:\d{2}\s*(?:\d{2}:\d{2}:\d{2}\s*)*/g, "")
    // Remove footer
    .replace(/THE SOURCE FOR NEWS ON[\s\S]*?All rights reserved\./g, "")
    .replace(/CQ and Roll Call are part of FiscalNote[\s\S]*$/g, "")
    // Clean excessive blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Try to extract a title from the first lines of factbase transcript text.
 * Looks for patterns like "Press Briefing: Karoline Leavitt..."
 */
function extractTitleFromText(text: string): string | null {
  const lines = text.split("\n").filter((l) => l.trim().length > 10);
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("Press Briefing:") ||
      trimmed.startsWith("Press Conference:") ||
      trimmed.startsWith("Remarks") ||
      trimmed.includes("Holds a Press") ||
      trimmed.includes("Speech") ||
      trimmed.includes("Address")
    ) {
      return trimmed.substring(0, 200);
    }
  }
  return null;
}

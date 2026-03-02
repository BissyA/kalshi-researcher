import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("transcripts")
    .select("title, speaker, event_date, full_text")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Transcript not found" },
      { status: 404 }
    );
  }

  if (!data.full_text || data.full_text === "(metadata only)") {
    return NextResponse.json(
      { error: "No full text available for this transcript" },
      { status: 404 }
    );
  }

  // Build a safe filename
  const parts = [
    data.speaker,
    data.title,
    data.event_date,
  ].filter(Boolean);
  const filename = parts.join(" - ").replace(/[^a-zA-Z0-9 _\-]/g, "") + ".txt";

  return new Response(data.full_text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

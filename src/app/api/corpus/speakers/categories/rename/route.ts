import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const { speakerId, oldName, newName } = await request.json();

  if (!speakerId || !oldName || !newName) {
    return NextResponse.json({ error: "speakerId, oldName, and newName are required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Update the speaker_categories row
  const { error: catError } = await supabase
    .from("speaker_categories")
    .update({ name: newName })
    .eq("speaker_id", speakerId)
    .eq("name", oldName);

  if (catError) {
    return NextResponse.json({ error: catError.message }, { status: 500 });
  }

  // Update all transcript_sections with the old category name for this speaker's transcripts
  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("id")
    .eq("speaker_id", speakerId);

  if (transcripts && transcripts.length > 0) {
    const transcriptIds = transcripts.map((t) => t.id);
    await supabase
      .from("transcript_sections")
      .update({ category_name: newName })
      .in("transcript_id", transcriptIds)
      .eq("category_name", oldName);
  }

  return NextResponse.json({ success: true });
}

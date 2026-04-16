import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// Categories are global — rename propagates to every transcript section across all speakers.
// `speakerId` is accepted and ignored for backwards compatibility.
export async function POST(request: Request) {
  const { oldName, newName } = await request.json();

  if (!oldName || !newName) {
    return NextResponse.json({ error: "oldName and newName are required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Update the canonical category row
  const { error: catError } = await supabase
    .from("speaker_categories")
    .update({ name: newName })
    .eq("name", oldName);

  if (catError) {
    return NextResponse.json({ error: catError.message }, { status: 500 });
  }

  // Propagate the name change to every transcript section using the old name,
  // regardless of speaker.
  await supabase
    .from("transcript_sections")
    .update({ category_name: newName })
    .eq("category_name", oldName);

  return NextResponse.json({ success: true });
}

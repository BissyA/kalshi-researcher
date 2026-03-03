import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { eventId, speakerId } = body as { eventId?: string; speakerId?: string | null };

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const { error } = await supabase
      .from("events")
      .update({ speaker_id: speakerId || null })
      .eq("id", eventId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET — list transcript sets for an event
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("event_transcript_sets")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sets: data ?? [] });
}

// POST — create a new transcript set
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, name, transcriptIds } = body as {
      eventId?: string;
      name?: string;
      transcriptIds?: string[];
    };

    if (!eventId || !name) {
      return NextResponse.json(
        { error: "eventId and name are required" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("event_transcript_sets")
      .insert({
        event_id: eventId,
        name,
        transcript_ids: transcriptIds ?? [],
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A set named "${name}" already exists for this event` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ set: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

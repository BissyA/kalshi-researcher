import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { eventId, field, value } = body as {
      eventId?: string;
      field?: "pre_event_notes" | "post_event_notes";
      value?: string;
    };

    if (!eventId || !field) {
      return NextResponse.json({ error: "eventId and field are required" }, { status: 400 });
    }

    if (field !== "pre_event_notes" && field !== "post_event_notes") {
      return NextResponse.json({ error: "field must be pre_event_notes or post_event_notes" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const { error } = await supabase
      .from("events")
      .update({ [field]: value ?? null })
      .eq("id", eventId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

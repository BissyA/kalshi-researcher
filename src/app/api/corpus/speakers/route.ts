import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET: List all speakers from speakers table
export async function GET() {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("speakers")
    .select("id, name, created_at")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ speakers: data ?? [] });
}

// POST: Create a new speaker
export async function POST(request: Request) {
  const body = await request.json();
  const { name } = body as { name?: string };

  if (!name?.trim()) {
    return NextResponse.json(
      { error: "Speaker name is required" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("speakers")
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Speaker "${name.trim()}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ speaker: data });
}

// DELETE: Delete a speaker by id (passed as query param)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Speaker id is required" },
      { status: 400 }
    );
  }

  const supabase = getServerSupabase();

  const { error } = await supabase.from("speakers").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

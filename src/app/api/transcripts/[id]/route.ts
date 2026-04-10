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
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  return NextResponse.json({ transcript: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = getServerSupabase();

  const update: Record<string, unknown> = {};
  if (body.needs_review !== undefined) update.needs_review = body.needs_review;
  if (body.review_reason !== undefined) update.review_reason = body.review_reason;
  if (body.completed !== undefined) update.completed = body.completed;

  const { error } = await supabase
    .from("transcripts")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getServerSupabase();

  const { error } = await supabase
    .from("transcripts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

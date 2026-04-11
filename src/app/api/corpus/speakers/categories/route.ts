import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get("speakerId");
  const status = searchParams.get("status"); // optional filter: "pending" or "approved"

  if (!speakerId) {
    return NextResponse.json({ error: "speakerId is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  let query = supabase
    .from("speaker_categories")
    .select("*")
    .eq("speaker_id", speakerId)
    .order("order_index");

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(request: Request) {
  const { speakerId, name, status } = await request.json();

  if (!speakerId || !name) {
    return NextResponse.json({ error: "speakerId and name are required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Get next order_index
  const { data: existing } = await supabase
    .from("speaker_categories")
    .select("order_index")
    .eq("speaker_id", speakerId)
    .order("order_index", { ascending: false })
    .limit(1);

  const nextIndex = (existing?.[0]?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("speaker_categories")
    .upsert(
      { speaker_id: speakerId, name: name.trim(), status: status || "pending", order_index: nextIndex },
      { onConflict: "speaker_id,name" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data });
}

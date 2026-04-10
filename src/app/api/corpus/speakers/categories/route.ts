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

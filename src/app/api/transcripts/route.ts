import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const speaker = searchParams.get("speaker");
  const type = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const supabase = getServerSupabase();

  let query = supabase
    .from("transcripts")
    .select("*", { count: "exact" })
    .order("event_date", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (speaker) {
    query = query.ilike("speaker", speaker);
  }
  if (type) {
    query = query.eq("event_type", type);
  }

  const q = searchParams.get("q");
  if (q) {
    query = query.ilike("full_text", `%${q}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    transcripts: data ?? [],
    total: count ?? 0,
  });
}

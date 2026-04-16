import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// Categories are global (not per-speaker) as of migration 020.
// The `speakerId` query param is accepted and ignored for backwards compatibility.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // optional filter: "pending" or "approved"

  const supabase = getServerSupabase();

  let query = supabase
    .from("speaker_categories")
    .select("*")
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
  const { name, status } = await request.json();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // If a row with this name already exists, return it as-is (no duplicate).
  const { data: existingRow } = await supabase
    .from("speaker_categories")
    .select("*")
    .eq("name", name.trim())
    .maybeSingle();

  if (existingRow) {
    return NextResponse.json({ category: existingRow });
  }

  // Otherwise pick the next order_index globally.
  const { data: lastRow } = await supabase
    .from("speaker_categories")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1);

  const nextIndex = (lastRow?.[0]?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("speaker_categories")
    .insert({
      name: name.trim(),
      status: status || "pending",
      order_index: nextIndex,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data });
}

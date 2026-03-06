import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

// GET /api/corpus/categories?speakerId=...
// Returns distinct categories for a speaker's corpus events
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get("speakerId");

  if (!speakerId) {
    return NextResponse.json({ error: "speakerId is required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  const { data: seriesData } = await supabase
    .from("series")
    .select("id")
    .eq("speaker_id", speakerId);

  const seriesIds = (seriesData ?? []).map((s) => s.id);

  if (seriesIds.length === 0) {
    return NextResponse.json({ categories: [] });
  }

  const { data: events, error } = await supabase
    .from("events")
    .select("category")
    .in("series_id", seriesIds)
    .not("category", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Count events per category
  const countMap = new Map<string, number>();
  for (const e of events ?? []) {
    const cat = e.category as string;
    countMap.set(cat, (countMap.get(cat) ?? 0) + 1);
  }

  const categories = [...countMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({ categories });
}

// PATCH /api/corpus/categories
// Set category on one or more events: { eventIds: string[], category: string | null }
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { eventIds, category } = body as { eventIds?: string[]; category?: string | null };

    if (!eventIds || eventIds.length === 0) {
      return NextResponse.json({ error: "eventIds is required" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const { error } = await supabase
      .from("events")
      .update({ category: category || null })
      .in("id", eventIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: eventIds.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PUT /api/corpus/categories
// Rename a category globally: { speakerId, oldName, newName }
// Updates all events belonging to the speaker's series that have the old category name
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { speakerId, oldName, newName } = body as { speakerId?: string; oldName?: string; newName?: string };

    if (!speakerId || !oldName || !newName?.trim()) {
      return NextResponse.json({ error: "speakerId, oldName, and newName are required" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Find series for this speaker
    const { data: seriesData } = await supabase
      .from("series")
      .select("id")
      .eq("speaker_id", speakerId);

    const seriesIds = (seriesData ?? []).map((s) => s.id);
    if (seriesIds.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    // Find all events with the old category in these series
    const { data: matchingEvents } = await supabase
      .from("events")
      .select("id")
      .in("series_id", seriesIds)
      .eq("category", oldName);

    const eventIds = (matchingEvents ?? []).map((e) => e.id);
    if (eventIds.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const { error } = await supabase
      .from("events")
      .update({ category: newName.trim() })
      .in("id", eventIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: eventIds.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/corpus/categories?speakerId=...&name=...
// Remove a category globally: clears the category from all events that have it
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get("speakerId");
  const name = searchParams.get("name");

  if (!speakerId || !name) {
    return NextResponse.json({ error: "speakerId and name are required" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Find series for this speaker
  const { data: seriesData } = await supabase
    .from("series")
    .select("id")
    .eq("speaker_id", speakerId);

  const seriesIds = (seriesData ?? []).map((s) => s.id);
  if (seriesIds.length === 0) {
    return NextResponse.json({ ok: true, cleared: 0 });
  }

  // Find all events with this category
  const { data: matchingEvents } = await supabase
    .from("events")
    .select("id")
    .in("series_id", seriesIds)
    .eq("category", name);

  const eventIds = (matchingEvents ?? []).map((e) => e.id);
  if (eventIds.length === 0) {
    return NextResponse.json({ ok: true, cleared: 0 });
  }

  const { error } = await supabase
    .from("events")
    .update({ category: null })
    .in("id", eventIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cleared: eventIds.length });
}

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { runId } = body;

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const { data: run, error } = await supabase
      .from("research_runs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("status", "running")
      .select()
      .single();

    if (error || !run) {
      return NextResponse.json(
        { error: "Run not found or not currently running" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, run });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

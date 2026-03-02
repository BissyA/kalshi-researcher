import { NextResponse } from "next/server";
import { settleEvent } from "@/lib/settlement";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, results } = body;

    if (!eventId || !results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: "eventId and results array required" },
        { status: 400 }
      );
    }

    const summary = await settleEvent(
      eventId,
      results.map((r: { wordId: string; wasMentioned: boolean }) => ({
        wordId: r.wordId,
        wasMentioned: r.wasMentioned,
      }))
    );

    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { kalshiFetch } from "@/lib/kalshi-client";

interface KalshiSeries {
  ticker: string;
  title: string;
  category: string;
  frequency: string;
  tags: string[];
}

// Simple in-memory cache (refreshed every 10 minutes)
let cachedSeries: KalshiSeries[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.toLowerCase() ?? "";

  const now = Date.now();
  if (!cachedSeries || now - cacheTimestamp > CACHE_TTL_MS) {
    const response = await kalshiFetch("GET", "/series");
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Kalshi API error: ${response.status} ${text}` },
        { status: 500 }
      );
    }
    const data = await response.json();
    cachedSeries = (data.series ?? []).map((s: KalshiSeries) => ({
      ticker: s.ticker,
      title: s.title,
      category: s.category,
      frequency: s.frequency,
      tags: s.tags ?? [],
    }));
    cacheTimestamp = now;
  }

  let results = cachedSeries!;

  // Filter by search query (match ticker, title, or tags)
  if (query) {
    results = results.filter(
      (s) =>
        s.ticker.toLowerCase().includes(query) ||
        s.title.toLowerCase().includes(query) ||
        s.tags.some((t) => t.toLowerCase().includes(query))
    );
  }

  // Limit results to avoid sending huge payloads
  return NextResponse.json({
    series: results.slice(0, 50),
    total: results.length,
  });
}

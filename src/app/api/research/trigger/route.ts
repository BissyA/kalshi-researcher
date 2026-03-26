import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { runResearchPipeline } from "@/agents/orchestrator";
import { OrchestratorInput, CorpusMentionRate, CorpusEventDetail, ModelPreset } from "@/types/research";

export const maxDuration = 300; // 5 minutes for Vercel

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, layer = "baseline", speakerId, modelPreset = "sonnet", corpusCategory, corpusCategories } = body;
    // Support both old single category and new multi-category format
    const rawCategories: string[] = corpusCategories ?? (corpusCategory ? [corpusCategory] : []);
    const includeAllCorpus = rawCategories.includes("__all__");
    const effectiveCategories: string[] = rawCategories.filter((c: string) => c !== "__all__");
    const validPresets: ModelPreset[] = ["opus", "hybrid", "sonnet", "haiku"];
    const effectivePreset: ModelPreset = validPresets.includes(modelPreset) ? modelPreset : "sonnet";

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    if (layer !== "baseline" && layer !== "current") {
      return NextResponse.json({ error: "layer must be 'baseline' or 'current'" }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Load event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Persist speaker selection to event if provided
    if (speakerId) {
      await supabase
        .from("events")
        .update({ speaker_id: speakerId })
        .eq("id", eventId);
    }

    // Load words
    const { data: words } = await supabase
      .from("words")
      .select("*")
      .eq("event_id", eventId)
      .order("word");

    if (!words || words.length === 0) {
      return NextResponse.json({ error: "No words found for this event" }, { status: 400 });
    }

    // Fetch corpus mention rates for the selected speaker
    let corpusMentionRates: Record<string, CorpusMentionRate> | undefined;
    let corpusMentionRatesAll: Record<string, CorpusMentionRate> | undefined;
    let corpusTotalEvents: number | undefined;
    const effectiveSpeakerId = speakerId || event.speaker_id;
    if (effectiveSpeakerId) {
      try {
        // Find series belonging to this speaker
        const { data: seriesData } = await supabase
          .from("series")
          .select("id")
          .eq("speaker_id", effectiveSpeakerId);

        const seriesIds = (seriesData ?? []).map((s) => s.id);

        if (seriesIds.length > 0) {
          // Fetch all event_results with full event detail, paginated
          const PAGE_SIZE = 1000;
          let offset = 0;
          const allResults: Array<{
            was_mentioned: boolean;
            words: { word: string };
            events: { series_id: string | null; category: string | null; title: string; kalshi_event_ticker: string; event_date: string | null };
          }> = [];

          while (true) {
            const { data: page } = await supabase
              .from("event_results")
              .select(`
                was_mentioned,
                words!inner ( word ),
                events!inner ( series_id, category, title, kalshi_event_ticker, event_date )
              `)
              .range(offset, offset + PAGE_SIZE - 1);

            if (!page || page.length === 0) break;
            allResults.push(...(page as unknown as typeof allResults));
            if (page.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
          }

          // Filter to this speaker's series only
          const speakerResults = allResults.filter(
            (row) => row.events.series_id && seriesIds.includes(row.events.series_id)
          );

          // Count total distinct events across all categories
          const allEventTickers = new Set(speakerResults.map((r) => r.events.kalshi_event_ticker));
          corpusTotalEvents = allEventTickers.size;

          // Helper to build corpus dataset from a set of results
          function buildCorpusDataset(results: typeof speakerResults): Record<string, CorpusMentionRate> | undefined {
            const wordMap = new Map<string, { yesCount: number; totalCount: number; events: CorpusEventDetail[] }>();
            for (const row of results) {
              const normalizedWord = row.words.word.toLowerCase();
              if (!wordMap.has(normalizedWord)) {
                wordMap.set(normalizedWord, { yesCount: 0, totalCount: 0, events: [] });
              }
              const entry = wordMap.get(normalizedWord)!;
              entry.totalCount++;
              if (row.was_mentioned) entry.yesCount++;
              entry.events.push({
                eventTitle: row.events.title,
                eventDate: row.events.event_date,
                eventTicker: row.events.kalshi_event_ticker,
                wasMentioned: row.was_mentioned,
                category: row.events.category,
              });
            }

            if (wordMap.size === 0) return undefined;

            const dataset: Record<string, CorpusMentionRate> = {};
            for (const [word, stats] of wordMap) {
              dataset[word] = {
                mentionRate: stats.totalCount > 0 ? stats.yesCount / stats.totalCount : 0,
                yesCount: stats.yesCount,
                totalEvents: stats.totalCount,
                events: stats.events.sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? "")),
              };
            }
            return dataset;
          }

          // Build unfiltered dataset only if "All" was explicitly selected
          const allDataset = buildCorpusDataset(speakerResults);
          if (includeAllCorpus) {
            corpusMentionRatesAll = allDataset;
          }

          // Build filtered dataset (category-filtered if categories selected)
          if (effectiveCategories.length > 0) {
            const filteredResults = speakerResults.filter(
              (row) => row.events.category && effectiveCategories.includes(row.events.category)
            );
            corpusMentionRates = buildCorpusDataset(filteredResults);
          } else if (includeAllCorpus) {
            // Only "All" ticked, no specific categories
            corpusMentionRates = allDataset;
          }
        }
      } catch (corpusErr) {
        console.error("Failed to fetch corpus mention rates:", corpusErr);
      }
    }

    // Load existing baseline research if running current layer
    let existingResearch: OrchestratorInput["existingResearch"] = undefined;
    if (layer === "current") {
      const { data: baselineRun } = await supabase
        .from("research_runs")
        .select("*")
        .eq("event_id", eventId)
        .eq("layer", "baseline")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      if (baselineRun) {
        existingResearch = {
          historicalResult: baselineRun.historical_result,
          agendaResult: baselineRun.agenda_result,
          eventFormatResult: baselineRun.event_format_result,
          marketAnalysisResult: baselineRun.market_analysis_result,
        };
      }
    }

    // Create research run row
    const { data: researchRun, error: runError } = await supabase
      .from("research_runs")
      .insert({
        event_id: eventId,
        layer,
        status: "running",
        model_used: effectivePreset,
        corpus_category: effectiveCategories.length > 0 ? effectiveCategories.join(",") : null,
      })
      .select()
      .single();

    if (runError || !researchRun) {
      return NextResponse.json({ error: `Failed to create research run: ${runError?.message}` }, { status: 500 });
    }

    // Use SSE to stream progress
    const encoder = new TextEncoder();
    let controllerClosed = false;

    // Listen for client disconnect
    request.signal.addEventListener("abort", () => {
      controllerClosed = true;
    });

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: unknown) => {
          if (controllerClosed) return;
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            controllerClosed = true;
          }
        };

        // Send SSE comments every 15s to keep the connection alive
        // through proxies (Fly.io kills idle connections after ~60s)
        const keepalive = setInterval(() => {
          if (controllerClosed) {
            clearInterval(keepalive);
            return;
          }
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            controllerClosed = true;
            clearInterval(keepalive);
          }
        }, 15_000);

        const orchestratorInput: OrchestratorInput = {
          event: {
            id: event.id,
            kalshiEventTicker: event.kalshi_event_ticker,
            title: event.title,
            speaker: event.speaker,
            eventType: event.event_type ?? "speech",
            eventDate: event.event_date ?? new Date().toISOString(),
            venue: event.venue ?? undefined,
          },
          words: words.map((w) => ({
            id: w.id,
            ticker: w.kalshi_market_ticker,
            word: w.word,
            // We'll need to fetch current prices - use 0 as default
            yesPrice: 0.5,
            noPrice: 0.5,
          })),
          layer,
          modelPreset: effectivePreset,
          existingResearch,
          corpusMentionRates,
          corpusMentionRatesAll,
          corpusCategories: effectiveCategories.length > 0 ? effectiveCategories : undefined,
          corpusTotalEvents,
        };

        // Try to get current prices from Kalshi
        try {
          const { kalshiFetch } = await import("@/lib/kalshi-client");
          const priceResponse = await kalshiFetch(
            "GET",
            `/events/${event.kalshi_event_ticker}`
          );
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            const markets = priceData.markets ?? priceData.event?.markets ?? [];
            for (const word of orchestratorInput.words) {
              const market = markets.find(
                (m: { ticker: string }) => m.ticker === word.ticker
              );
              if (market) {
                word.yesPrice = parseFloat(market.yes_ask_dollars) || 0.5;
                word.noPrice = parseFloat(market.no_bid_dollars) || 0.5;
              }
            }
          }
        } catch (priceErr) {
          console.warn("[trigger] Failed to fetch Kalshi prices, using defaults:", priceErr);
          sendEvent({ type: "progress", status: "running", completedAgents: [], warning: "Could not fetch live Kalshi prices — using defaults (edge calculations may be inaccurate)" });
        }

        sendEvent({
          type: "started",
          runId: researchRun.id,
          layer,
          totalAgents: layer === "current" ? 7 : 6,
        });

        try {
          const result = await runResearchPipeline(
            orchestratorInput,
            researchRun.id,
            (progress) => {
              sendEvent({ type: "progress", ...progress });
            }
          );

          const warnings: string[] = [];
          if (result.savedScores < (result.wordScores?.length ?? 0)) {
            warnings.push(`Only ${result.savedScores}/${result.wordScores?.length} word scores saved`);
          }
          if (result.briefingLength < 100) {
            warnings.push("Briefing is missing or incomplete");
          }

          sendEvent({
            type: "completed",
            runId: researchRun.id,
            tokenUsage: result.tokenUsage,
            wordScoresCount: result.wordScores?.length ?? 0,
            savedScoresCount: result.savedScores,
            clustersCount: result.clusters?.length ?? 0,
            warnings: warnings.length > 0 ? warnings : undefined,
          });
        } catch (error) {
          sendEvent({
            type: "error",
            runId: researchRun.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        clearInterval(keepalive);
        if (!controllerClosed) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

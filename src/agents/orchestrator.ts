import { getServerSupabase } from "@/lib/supabase";
import { runHistoricalAgent } from "./historical";
import { runAgendaAgent } from "./agenda";
import { runNewsCycleAgent } from "./news-cycle";
import { runEventFormatAgent } from "./event-format";
import { runMarketAnalysisAgent } from "./market-analysis";
import { runRecentRecordingsAgent } from "./recent-recordings";
import { runClusteringAgent } from "./clustering";
import { runSynthesizer } from "./synthesizer";
import {
  OrchestratorInput,
  OrchestratorOutput,
  AgentName,
  ResearchProgress,
  HistoricalResult,
  AgendaResult,
  NewsCycleResult,
  EventFormatResult,
  MarketAnalysisResult,
  RecentRecordingsResult,
  ModelPreset,
} from "@/types/research";

type ProgressCallback = (progress: ResearchProgress) => void;

const OPUS = "claude-opus-4-6";
const SONNET = "claude-sonnet-4-5-20250929";
const HAIKU = "claude-haiku-4-5-20251001";

type AgentModelMap = Record<AgentName, string>;

function getAgentModels(preset: ModelPreset = "sonnet"): AgentModelMap {
  switch (preset) {
    case "opus":
      return {
        historical: OPUS,
        agenda: OPUS,
        news_cycle: OPUS,
        event_format: OPUS,
        market_analysis: OPUS,
        recent_recordings: OPUS,
        clustering: OPUS,
        synthesizer: OPUS,
      };
    case "hybrid":
      return {
        historical: SONNET,
        agenda: SONNET,
        news_cycle: SONNET,
        event_format: HAIKU,
        market_analysis: SONNET,
        recent_recordings: HAIKU,
        clustering: HAIKU,
        synthesizer: OPUS,
      };
    case "sonnet":
      return {
        historical: SONNET,
        agenda: SONNET,
        news_cycle: SONNET,
        event_format: SONNET,
        market_analysis: SONNET,
        recent_recordings: SONNET,
        clustering: SONNET,
        synthesizer: SONNET,
      };
    case "haiku":
      return {
        historical: HAIKU,
        agenda: HAIKU,
        news_cycle: HAIKU,
        event_format: HAIKU,
        market_analysis: HAIKU,
        recent_recordings: HAIKU,
        clustering: HAIKU,
        synthesizer: HAIKU,
      };
  }
}

class CancelledError extends Error {
  constructor() {
    super("Research run was cancelled");
    this.name = "CancelledError";
  }
}

async function checkCancelled(supabase: ReturnType<typeof getServerSupabase>, runId: string) {
  const { data } = await supabase
    .from("research_runs")
    .select("status")
    .eq("id", runId)
    .single();

  if (data?.status === "cancelled") {
    throw new CancelledError();
  }
}

export async function runResearchPipeline(
  input: OrchestratorInput,
  runId: string,
  onProgress?: ProgressCallback
): Promise<OrchestratorOutput> {
  const supabase = getServerSupabase();
  const models = getAgentModels(input.modelPreset);
  const completedAgents: AgentName[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostCents = 0;

  const emit = (current?: AgentName) => {
    onProgress?.({
      runId,
      status: "running",
      completedAgents: [...completedAgents],
      currentAgent: current,
    });
  };

  const wordNames = input.words.map((w) => w.word);

  try {
    // ──────────────────────────────────────────────────────────────
    // Phase 1: Run research agents in parallel
    // ──────────────────────────────────────────────────────────────
    await checkCancelled(supabase, runId);
    emit("historical");

    // Load cached transcripts for this speaker
    let cachedTranscripts: Array<{ title: string; date: string; source: string; url: string; wordCount: number; summary: string }> = [];
    try {
      const { data: cached } = await supabase
        .from("transcripts")
        .select("title, event_date, source_url, word_count, full_text")
        .eq("speaker", input.event.speaker);

      cachedTranscripts = (cached ?? []).map((t) => ({
        title: t.title ?? "",
        date: t.event_date ?? "",
        source: "cached",
        url: t.source_url ?? "",
        wordCount: t.word_count ?? 0,
        summary: t.full_text === "(metadata only)" ? "" : (t.full_text ?? ""),
      }));
    } catch (cacheErr) {
      console.error("Failed to load transcript cache:", cacheErr);
    }

    const agentPromises: Array<{
      name: AgentName;
      promise: Promise<{ data: unknown; inputTokens: number; outputTokens: number; estimatedCostCents: number }>;
    }> = [
      {
        name: "historical",
        promise: runHistoricalAgent({
          speaker: input.event.speaker,
          eventTitle: input.event.title,
          eventType: input.event.eventType,
          words: wordNames,
          cachedTranscripts: cachedTranscripts.length > 0 ? cachedTranscripts : undefined,
          model: models.historical,
        }),
      },
      {
        name: "agenda",
        promise: runAgendaAgent({
          speaker: input.event.speaker,
          eventTitle: input.event.title,
          eventDate: input.event.eventDate,
          venue: input.event.venue,
          words: wordNames,
          model: models.agenda,
        }),
      },
      {
        name: "event_format",
        promise: runEventFormatAgent({
          speaker: input.event.speaker,
          eventTitle: input.event.title,
          eventDate: input.event.eventDate,
          venue: input.event.venue,
          model: models.event_format,
        }),
      },
      {
        name: "market_analysis",
        promise: runMarketAnalysisAgent({
          speaker: input.event.speaker,
          eventTitle: input.event.title,
          words: input.words.map((w) => ({
            word: w.word,
            yesPrice: w.yesPrice,
          })),
          model: models.market_analysis,
        }),
      },
    ];

    agentPromises.push({
      name: "recent_recordings",
      promise: runRecentRecordingsAgent({
        speaker: input.event.speaker,
        eventTitle: input.event.title,
        eventDate: input.event.eventDate,
        eventType: input.event.eventType,
        model: models.recent_recordings,
      }),
    });

    agentPromises.push({
      name: "news_cycle",
      promise: runNewsCycleAgent({
        speaker: input.event.speaker,
        eventTitle: input.event.title,
        eventDate: input.event.eventDate,
        words: wordNames,
        model: models.news_cycle,
      }),
    });

    // Run all agents in parallel, tracking completion
    const results = await Promise.allSettled(
      agentPromises.map(async ({ name, promise }) => {
        const result = await promise;
        completedAgents.push(name);
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        totalCostCents += result.estimatedCostCents;
        emit();
        return { name, result };
      })
    );

    // Extract results, with fallbacks for failures
    const agentResults: Record<string, unknown> = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        agentResults[r.value.name] = r.value.result.data;
      } else {
        console.error(`[orchestrator] Phase 1 agent failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
      }
    }

    const historicalResult = (agentResults.historical as HistoricalResult) ?? {
      transcriptsFound: [],
      wordFrequencies: {},
      overallNotes: "Historical analysis failed",
    };
    const agendaResult = (agentResults.agenda as AgendaResult) ?? {
      sourcesFound: [],
      topicWordMapping: {},
      wordImplications: {},
      overallNotes: "Agenda analysis failed",
    };
    const newsCycleResult = (agentResults.news_cycle as NewsCycleResult) ?? null;
    const eventFormatResult = (agentResults.event_format as EventFormatResult) ?? {
      estimatedDurationMinutes: 60,
      durationRange: { min: 30, max: 90 },
      format: "mixed" as const,
      hasQandA: false,
      hasAudienceInteraction: false,
      isLive: true,
      comparableEvents: [],
      implications: {
        durationEffect: "Unknown",
        formatEffect: "Unknown",
        overallWordCountExpectation: "medium" as const,
        scriptedWeight: 0.5,
        currentContextWeight: 0.5,
      },
    };
    const marketAnalysisResult = (agentResults.market_analysis as MarketAnalysisResult) ?? {
      marketImpliedTopics: [],
      pricingAssessments: {},
      correlatedPairs: [],
      overallMarketNotes: "Market analysis failed",
    };
    const recentRecordingsResult = (agentResults.recent_recordings as RecentRecordingsResult) ?? {
      recordings: [],
      selectionRationale: "Recent recordings search failed",
      searchQueries: [],
    };

    // Save phase 1 results to DB (non-critical — don't crash pipeline on failure)
    try {
      await supabase.from("research_runs").update({
        historical_result: historicalResult,
        agenda_result: agendaResult,
        news_cycle_result: newsCycleResult,
        event_format_result: eventFormatResult,
        market_analysis_result: marketAnalysisResult,
        recent_recordings_result: recentRecordingsResult,
      }).eq("id", runId);
    } catch (dbErr) {
      console.error("Failed to save phase 1 results:", dbErr);
    }

    // Cache transcript metadata for future runs (non-critical)
    try {
      if (historicalResult.transcriptsFound?.length > 0) {
        for (const t of historicalResult.transcriptsFound) {
          await supabase.from("transcripts").upsert(
            {
              speaker: input.event.speaker,
              event_type: input.event.eventType,
              event_date: t.date || null,
              title: t.title,
              source_url: t.url || null,
              full_text: t.summary || "(metadata only)",
              word_count: t.wordCount || null,
            },
            { onConflict: "speaker,title,event_date" }
          );
        }
      }
    } catch (cacheErr) {
      console.error("Failed to cache transcripts:", cacheErr);
    }

    // ──────────────────────────────────────────────────────────────
    // Phase 2: Clustering (uses phase 1 outputs)
    // ──────────────────────────────────────────────────────────────
    await checkCancelled(supabase, runId);
    emit("clustering");

    const clusteringResult = await runClusteringAgent({
      speaker: input.event.speaker,
      eventTitle: input.event.title,
      words: wordNames,
      historicalResult,
      agendaResult,
      model: models.clustering,
    });

    completedAgents.push("clustering");
    totalInputTokens += clusteringResult.inputTokens;
    totalOutputTokens += clusteringResult.outputTokens;
    totalCostCents += clusteringResult.estimatedCostCents;
    emit();

    try {
      await supabase.from("research_runs").update({
        cluster_result: clusteringResult.data,
      }).eq("id", runId);
    } catch (dbErr) {
      console.error("Failed to save cluster result:", dbErr);
    }

    // ──────────────────────────────────────────────────────────────
    // Phase 3: Synthesis (combines everything)
    // ──────────────────────────────────────────────────────────────
    await checkCancelled(supabase, runId);
    emit("synthesizer");

    const synthesisResult = await runSynthesizer({
      speaker: input.event.speaker,
      eventTitle: input.event.title,
      eventDate: input.event.eventDate,
      words: input.words.map((w) => ({
        ticker: w.ticker,
        word: w.word,
        yesPrice: w.yesPrice,
      })),
      historicalResult,
      agendaResult,
      newsCycleResult,
      eventFormatResult,
      marketAnalysisResult,
      clusterResult: clusteringResult.data,
      corpusMentionRates: input.corpusMentionRates,
      corpusMentionRatesAll: input.corpusMentionRatesAll,
      corpusCategories: input.corpusCategories,
      corpusTotalEvents: input.corpusTotalEvents,
      model: models.synthesizer,
    });

    completedAgents.push("synthesizer");
    totalInputTokens += synthesisResult.inputTokens;
    totalOutputTokens += synthesisResult.outputTokens;
    totalCostCents += synthesisResult.estimatedCostCents;

    // ──────────────────────────────────────────────────────────────
    // Phase 4: Save results
    // ──────────────────────────────────────────────────────────────

    // Save word clusters to DB (non-critical — don't crash pipeline)
    try {
      for (const cluster of clusteringResult.data.clusters ?? []) {
        const { data: clusterRow } = await supabase
          .from("word_clusters")
          .insert({
            event_id: input.event.id,
            cluster_name: cluster.name,
            theme: cluster.theme,
            correlation_note: cluster.correlationNote,
          })
          .select("id")
          .single();

        if (clusterRow) {
          for (const clusterWord of cluster.words) {
            await supabase
              .from("words")
              .update({ cluster_id: clusterRow.id })
              .eq("event_id", input.event.id)
              .ilike("word", clusterWord);
          }
        }
      }
    } catch (dbErr) {
      console.error("Failed to save clusters:", dbErr);
    }

    // Save word scores (non-critical — don't crash pipeline)
    const wordScores = synthesisResult.data.wordScores ?? [];
    let savedScores = 0;
    for (const score of wordScores) {
      try {
        const { data: wordRow } = await supabase
          .from("words")
          .select("id")
          .eq("event_id", input.event.id)
          .ilike("word", score.word)
          .single();

        if (wordRow) {
          await supabase.from("word_scores").insert({
            event_id: input.event.id,
            word_id: wordRow.id,
            research_run_id: runId,
            historical_probability: score.historicalProbability ?? 0.5,
            agenda_probability: score.agendaProbability ?? 0.5,
            news_cycle_probability: score.newsCycleProbability ?? 0.5,
            base_rate_probability: score.baseRateProbability ?? 0.5,
            combined_probability: score.combinedProbability ?? 0.5,
            market_yes_price: score.marketYesPrice ?? 0.5,
            edge: score.edge ?? 0,
            confidence: score.confidence ?? "low",
            reasoning: score.reasoning ?? "",
            key_evidence: score.keyEvidence ?? [],
          });
          savedScores++;
        }
      } catch (dbErr) {
        console.error(`Failed to save score for "${score.word}":`, dbErr);
      }
    }
    console.log(`Saved ${savedScores}/${wordScores.length} word scores`);

    // Mark research run as completed
    await supabase.from("research_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      synthesis_result: synthesisResult.data,
      briefing: synthesisResult.data.briefing ?? null,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cost_cents: totalCostCents,
    }).eq("id", runId);

    // Update event status
    await supabase.from("events").update({
      status: "researched",
      estimated_duration_minutes: eventFormatResult.estimatedDurationMinutes,
      updated_at: new Date().toISOString(),
    }).eq("id", input.event.id);

    // Emit final progress
    onProgress?.({
      runId,
      status: "completed",
      completedAgents: [...completedAgents],
    });

    return {
      wordScores: wordScores,
      clusters: clusteringResult.data.clusters ?? [],
      eventFormat: {
        estimatedDurationMinutes: eventFormatResult.estimatedDurationMinutes,
        format: eventFormatResult.format,
        implications: eventFormatResult.implications.formatEffect,
      },
      researchSummary: {
        historical: historicalResult.overallNotes,
        agenda: agendaResult.overallNotes,
        newsCycle: newsCycleResult?.breakingNewsAlert ?? "Not analyzed",
        marketAnalysis: marketAnalysisResult.overallMarketNotes,
      },
      tokenUsage: {
        totalInputTokens,
        totalOutputTokens,
        estimatedCostCents: totalCostCents,
      },
    };
  } catch (error) {
    const isCancelled = error instanceof CancelledError;

    // Don't overwrite "cancelled" status if already set by the stop endpoint
    if (!isCancelled) {
      await supabase.from("research_runs").update({
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_cost_cents: totalCostCents,
      }).eq("id", runId);
    } else {
      // Update token usage on cancellation
      await supabase.from("research_runs").update({
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_cost_cents: totalCostCents,
      }).eq("id", runId);
    }

    onProgress?.({
      runId,
      status: isCancelled ? "cancelled" : "failed",
      completedAgents: [...completedAgents],
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

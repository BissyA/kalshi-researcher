import { getServerSupabase } from "@/lib/supabase";
import { runHistoricalAgent } from "./historical";
import { runAgendaAgent } from "./agenda";
import { runNewsCycleAgent } from "./news-cycle";
import { runEventFormatAgent } from "./event-format";
import { runMarketAnalysisAgent } from "./market-analysis";
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
} from "@/types/research";

type ProgressCallback = (progress: ResearchProgress) => void;

export async function runResearchPipeline(
  input: OrchestratorInput,
  runId: string,
  onProgress?: ProgressCallback
): Promise<OrchestratorOutput> {
  const supabase = getServerSupabase();
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
    emit("historical");

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
        }),
      },
      {
        name: "event_format",
        promise: runEventFormatAgent({
          speaker: input.event.speaker,
          eventTitle: input.event.title,
          eventDate: input.event.eventDate,
          venue: input.event.venue,
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
        }),
      },
    ];

    // Only run news cycle for the "current" layer
    if (input.layer === "current") {
      agentPromises.push({
        name: "news_cycle",
        promise: runNewsCycleAgent({
          speaker: input.event.speaker,
          eventTitle: input.event.title,
          eventDate: input.event.eventDate,
          words: wordNames,
        }),
      });
    }

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

    // Save phase 1 results to DB
    await supabase.from("research_runs").update({
      historical_result: historicalResult,
      agenda_result: agendaResult,
      news_cycle_result: newsCycleResult,
      event_format_result: eventFormatResult,
      market_analysis_result: marketAnalysisResult,
    }).eq("id", runId);

    // ──────────────────────────────────────────────────────────────
    // Phase 2: Clustering (uses phase 1 outputs)
    // ──────────────────────────────────────────────────────────────
    emit("clustering");

    const clusteringResult = await runClusteringAgent({
      speaker: input.event.speaker,
      eventTitle: input.event.title,
      words: wordNames,
      historicalResult,
      agendaResult,
    });

    completedAgents.push("clustering");
    totalInputTokens += clusteringResult.inputTokens;
    totalOutputTokens += clusteringResult.outputTokens;
    totalCostCents += clusteringResult.estimatedCostCents;
    emit();

    await supabase.from("research_runs").update({
      cluster_result: clusteringResult.data,
    }).eq("id", runId);

    // ──────────────────────────────────────────────────────────────
    // Phase 3: Synthesis (combines everything)
    // ──────────────────────────────────────────────────────────────
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
    });

    completedAgents.push("synthesizer");
    totalInputTokens += synthesisResult.inputTokens;
    totalOutputTokens += synthesisResult.outputTokens;
    totalCostCents += synthesisResult.estimatedCostCents;

    // ──────────────────────────────────────────────────────────────
    // Phase 4: Save results
    // ──────────────────────────────────────────────────────────────

    // Save word clusters to DB
    for (const cluster of clusteringResult.data.clusters) {
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
        // Update words with cluster_id
        for (const clusterWord of cluster.words) {
          await supabase
            .from("words")
            .update({ cluster_id: clusterRow.id })
            .eq("event_id", input.event.id)
            .ilike("word", clusterWord);
        }
      }
    }

    // Save word scores
    for (const score of synthesisResult.data.wordScores) {
      // Find the word_id
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
          historical_probability: score.historicalProbability,
          agenda_probability: score.agendaProbability,
          news_cycle_probability: score.newsCycleProbability,
          base_rate_probability: score.baseRateProbability,
          combined_probability: score.combinedProbability,
          market_yes_price: score.marketYesPrice,
          edge: score.edge,
          confidence: score.confidence,
          reasoning: score.reasoning,
          key_evidence: score.keyEvidence,
        });
      }
    }

    // Mark research run as completed
    await supabase.from("research_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      synthesis_result: synthesisResult.data,
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
      wordScores: synthesisResult.data.wordScores,
      clusters: clusteringResult.data.clusters,
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
    // Mark run as failed
    await supabase.from("research_runs").update({
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cost_cents: totalCostCents,
    }).eq("id", runId);

    onProgress?.({
      runId,
      status: "failed",
      completedAgents: [...completedAgents],
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

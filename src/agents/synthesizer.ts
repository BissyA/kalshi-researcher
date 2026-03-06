import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import {
  SynthesisResult,
  HistoricalResult,
  AgendaResult,
  NewsCycleResult,
  EventFormatResult,
  MarketAnalysisResult,
  ClusterResult,
  CorpusMentionRate,
} from "@/types/research";

interface SynthesizerInput {
  speaker: string;
  eventTitle: string;
  eventDate: string;
  words: Array<{
    ticker: string;
    word: string;
    yesPrice: number;
  }>;
  historicalResult: HistoricalResult;
  agendaResult: AgendaResult;
  newsCycleResult: NewsCycleResult | null;
  eventFormatResult: EventFormatResult;
  marketAnalysisResult: MarketAnalysisResult;
  clusterResult: ClusterResult;
  corpusMentionRates?: Record<string, CorpusMentionRate>;
  corpusMentionRatesAll?: Record<string, CorpusMentionRate>;
  corpusCategories?: string[];
  corpusTotalEvents?: number;
  model?: string;
}

export async function runSynthesizer(
  input: SynthesizerInput
): Promise<{ data: SynthesisResult } & AgentCallResult> {
  const wordPriceList = input.words
    .map((w) => `  - ${w.word} (ticker: ${w.ticker}): YES price = ${Math.round(w.yesPrice * 100)}¢`)
    .join("\n");

  const scriptedWeight = input.eventFormatResult.implications?.scriptedWeight ?? 0.5;
  const currentContextWeight = input.eventFormatResult.implications?.currentContextWeight ?? 0.5;

  const hasNewsCycle = input.newsCycleResult != null;
  const hasCorpus = input.corpusMentionRates && Object.keys(input.corpusMentionRates).length > 0;

  // When corpus data is available, allocate weight from base rate to corpus
  const historicalWeight = Math.round(scriptedWeight * 40);
  const agendaWeight = 25;
  const newsWeight = hasNewsCycle ? Math.round(currentContextWeight * 25) : 0;
  const remainingWeight = 100 - historicalWeight - agendaWeight - newsWeight;
  const baseRateWeight = hasCorpus ? Math.round(remainingWeight * 0.3) : remainingWeight;
  const corpusWeight = hasCorpus ? remainingWeight - baseRateWeight : 0;

  const systemPrompt = `You are an expert prediction market analyst and political speech forecaster. You have been given comprehensive research about an upcoming event. Your job is to produce a final probability estimate for each word being mentioned.

Event: ${input.eventTitle}
Speaker: ${input.speaker}
Date: ${input.eventDate}
Format: ${input.eventFormatResult.format} (est. ${input.eventFormatResult.estimatedDurationMinutes} min)

Words and current market prices:
${wordPriceList}

Research inputs are provided below. Use ALL of them to form your estimates.

Weighting framework (adjusted for event format):
- Historical frequency: ${historicalWeight}% weight
- Agenda/preview: ${agendaWeight}% weight
${hasNewsCycle ? `- News cycle: ${newsWeight}% weight` : "- News cycle: NOT AVAILABLE (baseline layer — set newsCycleProbability to 0.5 for all words)"}
${hasCorpus ? `- Corpus (settled Kalshi markets): ${corpusWeight}% weight` : ""}
- Base rate: ${baseRateWeight}% weight

Important calibration guidance:
- Be well-calibrated. Don't just set everything to 50%.
- Words that appear in 90%+ of similar speeches should be 85-95%.
- Rare or very specific words should be 5-20% unless there's strong current evidence.
- Your estimates should be actionable for trading — the trader will buy when edge > 0.10.
- Consider word clusters: correlated words should have correlated probabilities.
- Be aware that market prices incorporate crowd wisdom — if you disagree significantly with the market, explain why with specific evidence.
- For a ${input.eventFormatResult.estimatedDurationMinutes}-minute ${input.eventFormatResult.format} speech, adjust base rates accordingly (longer = higher probability for most words).
${hasCorpus ? `
CORPUS DATA — CRITICAL: You have been provided empirical mention rates from ACTUAL settled Kalshi mention markets for this speaker. This is ground-truth data showing how often each word was actually mentioned across past events.
${input.corpusCategories && input.corpusCategories.length > 0 ? `
IMPORTANT — CORPUS FILTERING CONTEXT:
You are receiving TWO corpus datasets:
1. **FILTERED CORPUS** — filtered to [${input.corpusCategories.join(", ")}] events only. This is the most relevant data for this specific event type.
2. **FULL CORPUS** — ALL event types for this speaker (${input.corpusTotalEvents ?? "unknown"} total events). This includes rallies, press conferences, roundtables, etc.

Use the FILTERED rates as your primary anchor since they match this event's format. But COMPARE against the full rates to identify important divergences:
- If a word is 60% in [${input.corpusCategories.join(", ")}] but 25% overall, this word is especially relevant to this event type — note this.
- If a word is 10% in [${input.corpusCategories.join(", ")}] but 50% overall, this word is uncommon in this event format despite being common elsewhere — flag this.
- Use the per-event detail to spot recency trends: was the word mentioned in the last 3 events? Has the pattern changed over time?
- Consider sample size: a rate from 3 filtered events is much less reliable than a rate from 50 events overall.
` : `
NOTE: No category filter was applied — this corpus data includes ALL event types for this speaker (${input.corpusTotalEvents ?? "unknown"} total events). Be aware that different event formats (rallies vs press conferences vs roundtables) produce different mention patterns. A word with 40% overall rate might be 80% at rallies but 5% at press conferences. Use the per-event detail (including event titles, dates, and categories) to reason about which events are most comparable to the upcoming one.
`}
When corpus data is available for a word:
- Use the corpus mention rate as your PRIMARY ANCHOR for baseRateProbability.
- A word with a 75% corpus mention rate across 10+ events is extremely strong evidence — your baseRateProbability should be close to that rate.
- Only deviate significantly from the corpus rate when you have strong, specific evidence that this event is different (e.g., different event format, strong agenda/news signals).
- For words NOT in the corpus data, fall back to your general base rate estimate.
- In your briefing, explicitly reference the corpus data with event-level detail: e.g., "Corpus shows 'border' mentioned in 9/12 events (75%), including the last 5 consecutive events. In Sports events specifically, it was 2/3 (67%)."
- Call out significant divergences between filtered and full corpus rates where they exist.` : ""}

In addition to the structured word scores, produce a comprehensive research briefing as a markdown document in the "briefing" field. This briefing will be the primary thing the trader reads. It must:
1. Be written as a flowing narrative, not a list of bullet points
2. Explicitly name and cite every transcript used, with dates and word counts
3. Quote specific evidence — e.g., "In the Laredo remarks, Trump mentioned 'border' 14 times and 'wall' 8 times"
4. Cite news sources with their publication names
5. Highlight the MOST IMPORTANT findings first
6. Include a section on risks and uncertainties — what could make predictions wrong
7. Include market observations — where you see edge and why
8. Be 800-1500 words — thorough but readable in 5 minutes

The trader will use this briefing to form their OWN view before looking at scores. Write it as if you're briefing a trader before a session, not as a data dump. Use markdown headings (##), bold, and bullet points for structure.

Return structured JSON in this exact format:
\`\`\`json
{
  "briefing": "## Event Overview\\n\\nMarkdown briefing document here...",
  "wordScores": [
    {
      "word": "string",
      "ticker": "string",
      "historicalProbability": number (0.0-1.0),
      "agendaProbability": number (0.0-1.0),
      "newsCycleProbability": number (0.0-1.0),
      "baseRateProbability": number (0.0-1.0),
      "combinedProbability": number (0.0-1.0),
      "marketYesPrice": number (0.0-1.0),
      "edge": number (combined - market, can be negative),
      "confidence": "high|medium|low",
      "reasoning": "string (concise explanation)",
      "keyEvidence": ["string"],
      "clusterName": "string or null"
    }
  ],
  "topRecommendations": {
    "strongYes": [
      { "word": "string", "edge": number, "reasoning": "string" }
    ],
    "strongNo": [
      { "word": "string", "edge": number, "reasoning": "string" }
    ]
  },
  "researchQuality": {
    "transcriptsAnalyzed": number,
    "sourcesConsulted": number,
    "overallConfidence": "high|medium|low",
    "caveats": ["string"]
  }
}
\`\`\`

You MUST include an entry in wordScores for EVERY word in the list. Sort strongYes and strongNo by absolute edge descending.`;

  // Build corpus section(s) with per-event detail
  function formatCorpusDataset(dataset: Record<string, CorpusMentionRate>, label: string): string {
    const entries = Object.entries(dataset)
      .sort((a, b) => b[1].totalEvents - a[1].totalEvents || b[1].mentionRate - a[1].mentionRate);

    const lines = entries.map(([word, data]) => {
      const eventDetails = data.events
        .map((evt) => {
          const date = evt.eventDate ? new Date(evt.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "unknown date";
          const cat = evt.category ? ` [${evt.category}]` : "";
          return `${evt.wasMentioned ? "YES" : "NO"} — ${evt.eventTitle} (${date}${cat})`;
        })
        .join("\n      ");
      return `  ${word}: ${Math.round(data.mentionRate * 100)}% (${data.yesCount}/${data.totalEvents} events)\n      ${eventDetails}`;
    });

    return `\n=== ${label} ===\n${lines.join("\n")}`;
  }

  let corpusSection = "";
  if (hasCorpus) {
    const hasCategories = input.corpusCategories && input.corpusCategories.length > 0;
    const hasAllData = input.corpusMentionRatesAll && Object.keys(input.corpusMentionRatesAll).length > 0;

    if (hasCategories && hasAllData) {
      // Show both filtered and full datasets
      corpusSection = formatCorpusDataset(
        input.corpusMentionRates!,
        `CORPUS — FILTERED TO [${input.corpusCategories!.join(", ")}] (${new Set(Object.values(input.corpusMentionRates!).flatMap(d => d.events.map(e => e.eventTicker))).size} events)`
      );
      corpusSection += "\n" + formatCorpusDataset(
        input.corpusMentionRatesAll!,
        `CORPUS — ALL EVENT TYPES (${input.corpusTotalEvents ?? "unknown"} total events)`
      );
    } else {
      // No category filter — show single dataset
      corpusSection = formatCorpusDataset(
        input.corpusMentionRates!,
        `CORPUS MENTION HISTORY — ALL EVENT TYPES (${input.corpusTotalEvents ?? "unknown"} total events)`
      );
    }
  }

  const researchData = `
=== HISTORICAL TRANSCRIPT ANALYSIS ===
Transcripts found: ${input.historicalResult.transcriptsFound?.length ?? 0}
${JSON.stringify(input.historicalResult, null, 2)}

=== AGENDA / PREVIEW ANALYSIS ===
${JSON.stringify(input.agendaResult, null, 2)}

=== NEWS CYCLE ANALYSIS ===
${hasNewsCycle ? JSON.stringify(input.newsCycleResult, null, 2) : "NOT AVAILABLE — This is a baseline run. News cycle was not analyzed. Set newsCycleProbability to 0.5 for all words and rely on historical + agenda + base rate for your estimates."}

=== EVENT FORMAT ANALYSIS ===
${JSON.stringify(input.eventFormatResult, null, 2)}

=== MARKET PRICE ANALYSIS ===
${JSON.stringify(input.marketAnalysisResult, null, 2)}

=== WORD CLUSTERS ===
${JSON.stringify(input.clusterResult, null, 2)}
${corpusSection}`;

  const userMessage = `Using all the research data below, produce final probability estimates for each word being mentioned at ${input.speaker}'s "${input.eventTitle}" on ${input.eventDate}.

${researchData}

Produce a score for EVERY word. Be precise, well-calibrated, and provide actionable trading recommendations.`;

  return callAgentForJson<SynthesisResult>({
    systemPrompt,
    userMessage,
    maxTokens: 32000,
    enableWebSearch: false,
    model: input.model,
  });
}

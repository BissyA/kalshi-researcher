import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import {
  SynthesisResult,
  HistoricalResult,
  AgendaResult,
  NewsCycleResult,
  EventFormatResult,
  MarketAnalysisResult,
  ClusterResult,
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
  const historicalWeight = Math.round(scriptedWeight * 40);
  const agendaWeight = 25;
  const newsWeight = hasNewsCycle ? Math.round(currentContextWeight * 25) : 0;
  const baseRateWeight = 100 - historicalWeight - agendaWeight - newsWeight;

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
- Base rate: ${baseRateWeight}% weight

Important calibration guidance:
- Be well-calibrated. Don't just set everything to 50%.
- Words that appear in 90%+ of similar speeches should be 85-95%.
- Rare or very specific words should be 5-20% unless there's strong current evidence.
- Your estimates should be actionable for trading — the trader will buy when edge > 0.10.
- Consider word clusters: correlated words should have correlated probabilities.
- Be aware that market prices incorporate crowd wisdom — if you disagree significantly with the market, explain why with specific evidence.
- For a ${input.eventFormatResult.estimatedDurationMinutes}-minute ${input.eventFormatResult.format} speech, adjust base rates accordingly (longer = higher probability for most words).

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

  const researchData = `
=== HISTORICAL TRANSCRIPT ANALYSIS ===
Transcripts found: ${input.historicalResult.transcriptsFound.length}
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
`;

  const userMessage = `Using all the research data below, produce final probability estimates for each word being mentioned at ${input.speaker}'s "${input.eventTitle}" on ${input.eventDate}.

${researchData}

Produce a score for EVERY word. Be precise, well-calibrated, and provide actionable trading recommendations.`;

  return callAgentForJson<SynthesisResult>({
    systemPrompt,
    userMessage,
    maxTokens: 32000,
    enableWebSearch: false,
  });
}

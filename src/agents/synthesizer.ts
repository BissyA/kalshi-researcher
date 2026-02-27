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

  const historicalWeight = Math.round(scriptedWeight * 40);
  const agendaWeight = 25;
  const newsWeight = Math.round(currentContextWeight * 25);
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
- News cycle: ${newsWeight}% weight
- Base rate: ${baseRateWeight}% weight

Important calibration guidance:
- Be well-calibrated. Don't just set everything to 50%.
- Words that appear in 90%+ of similar speeches should be 85-95%.
- Rare or very specific words should be 5-20% unless there's strong current evidence.
- Your estimates should be actionable for trading — the trader will buy when edge > 0.10.
- Consider word clusters: correlated words should have correlated probabilities.
- Be aware that market prices incorporate crowd wisdom — if you disagree significantly with the market, explain why with specific evidence.
- For a ${input.eventFormatResult.estimatedDurationMinutes}-minute ${input.eventFormatResult.format} speech, adjust base rates accordingly (longer = higher probability for most words).

Return structured JSON in this exact format:
\`\`\`json
{
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
${input.newsCycleResult ? JSON.stringify(input.newsCycleResult, null, 2) : "Not available (baseline layer — news cycle not analyzed)"}

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
    maxTokens: 24000,
    enableWebSearch: false,
  });
}

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

=== TRADE RECOMMENDATIONS — $100 BUDGET ===

After completing your word analysis, you MUST produce a "tradeRecommendations" section. You are acting as an experienced Kalshi mention market trader with $100 to deploy on this event. Think like a human trader, not a quant screen.

YOUR ROLE: You are the trader. You have read all the research. Now construct an actual trade plan — which words to buy, at what price, how many contracts, and WHY. The trader will use your recommendations to place limit orders.

KEY PRINCIPLES FOR TRADE CONSTRUCTION:

1. **Ideal Entry Prices (Limit Orders):** For each trade, recommend a TARGET ENTRY PRICE — the price at which you'd want to be filled. This is NOT necessarily the current market price. Think about:
   - What price represents genuine value based on your probability estimate?
   - Would you rather wait for a better fill than pay the current ask?
   - For high-conviction trades, you might accept current market. For marginal trades, set a tighter limit.
   - For YES trades: target entry should be BELOW your combinedProbability (you're buying cheap)
   - For NO trades: target entry should be BELOW (1 - combinedProbability) (you're buying the NO side cheap)

2. **Portfolio Construction & Diversification:**
   - You have $100 (10,000¢). Allocate it thoughtfully across trades.
   - Do NOT spread too thin (20 trades at $5 each = noise). Concentrate on your best ideas.
   - Do NOT concentrate too heavily (1 trade at $80 = reckless). Diversify across themes.
   - Consider cluster correlation: if "border," "wall," and "immigration" are all in the same thematic cluster, they will likely all hit or all miss together. Cap your exposure to any single cluster.
   - Aim for a mix of high-probability/low-payout trades (e.g. YES at 85¢) and low-probability/high-payout trades (e.g. YES at 10¢) where you have genuine edge.

3. **Side Selection (YES vs NO):**
   - Buy YES when you believe the word WILL be mentioned and the YES price is below your probability.
   - Buy NO when you believe the word WON'T be mentioned and the NO price (= 100¢ - YES price) is below (1 - your probability).
   - Don't default to YES. Many profitable trades are on the NO side for words the market overestimates.

4. **Reasoning Like a Human, Not a Formula:**
   - Edge calculations are useful but LIMITED. They're derived from Kalshi market prices which can be wrong, and from historical corpus data which may not include external transcripts or recent behavioral shifts.
   - Use edge as ONE signal among many. Your judgment should incorporate: transcript patterns, news cycle momentum, event format, speaker tendencies, recency of word usage, and cluster dynamics.
   - If a word was mentioned in the last 8 consecutive speeches and immigration is dominating the news, that's a strong YES even if calculated edge is modest.
   - Conversely, if a word has high calculated edge but you have low confidence in the data, size it smaller or skip it.

5. **Confidence-Based Sizing:**
   - High confidence + strong thesis = larger position (more contracts)
   - Low confidence + thin evidence = smaller position or avoid entirely
   - This is about how SURE you are of your view, not just how big the edge number is.

6. **Avoid List:**
   - Include words you're deliberately NOT trading and explain why.
   - Reasons to avoid: low confidence in your probability estimate, insufficient data, efficiently priced with no clear view, or correlated with a word you already have a position on.
   - Do NOT avoid words just because the market price matches your estimate — avoid them because YOU don't have a strong enough view.

7. **Portfolio Summary:**
   - Summarize total deployment, remaining budget, cluster exposure breakdown, and overall strategy.
   - Include portfolio-level risk notes (e.g., "Heavy on immigration theme — a pivot away from border topics would hurt multiple positions").

IMPORTANT: Include the trade recommendations as a dedicated section in your briefing markdown AFTER the word analysis section, using the heading "## Trade Recommendations ($100 Budget)". Format it as a readable table and commentary. The structured JSON tradeRecommendations field should contain the same information in machine-readable form.

Return structured JSON in this exact format:
\`\`\`json
{
  "briefing": "## Event Overview\\n\\nMarkdown briefing document here...\\n\\n## Trade Recommendations ($100 Budget)\\n\\n...",
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
  "tradeRecommendations": {
    "trades": [
      {
        "word": "string",
        "ticker": "string",
        "side": "yes|no",
        "targetEntry": number (0.0-1.0, the limit order price),
        "contracts": number (integer, how many to buy),
        "costCents": number (targetEntry * 100 * contracts for YES, or (1-targetEntry) * 100 * contracts... wait no: costCents = targetEntry * 100 * contracts — targetEntry is already the price of the side you're buying),
        "reasoning": "string (2-3 sentence mini trade thesis — why this word, why this side, why this price)",
        "confidence": "high|medium|low",
        "clusterName": "string or null",
        "riskNote": "string (what could make this trade lose)",
        "edgeAtTarget": number (your probability of winning minus your target entry price — always from the perspective of the side you're buying)
      }
    ],
    "avoid": [
      {
        "word": "string",
        "ticker": "string",
        "reasoning": "string (why you're not trading this)"
      }
    ],
    "portfolioSummary": {
      "totalDeployed": number (total cents across all trades),
      "budgetRemaining": number (10000 - totalDeployed),
      "clusterExposure": [
        {
          "cluster": "string (cluster name or 'Unclustered')",
          "amountCents": number,
          "words": ["string"]
        }
      ],
      "riskNotes": ["string (portfolio-level risk observations)"],
      "strategy": "string (2-3 sentence summary of your overall trading approach for this event)"
    }
  },
  "researchQuality": {
    "transcriptsAnalyzed": number,
    "sourcesConsulted": number,
    "overallConfidence": "high|medium|low",
    "caveats": ["string"]
  }
}
\`\`\`

COST CALCULATION: costCents = targetEntry * 100 * contracts. For example, buying 5 YES contracts at 0.22 (22¢) costs 5 * 22 = 110 cents ($1.10). Buying 3 NO contracts at 0.15 (15¢ NO price) costs 3 * 15 = 45 cents ($0.45). The targetEntry is always the price of the SIDE you are buying.

BUDGET CONSTRAINT: totalDeployed MUST NOT exceed 10000 (= $100). Leave some buffer — deploying exactly $100 with no room is aggressive. Aim for $70-$90 deployed unless you have exceptionally high conviction across the board.

FORMATTING — DOLLARS vs CENTS in the briefing markdown:
- Use DOLLARS (e.g. "$7.00", "$26.82", "$85.22") for all allocation amounts, costs, totals, and budget figures. Nobody says "8,522 cents" — say "$85.22".
- Use CENTS (e.g. "28¢", "93¢") ONLY for strike/entry prices and market prices — these are how Kalshi displays prices.
- Example: "Buy 25 YES contracts at 28¢ ($7.00)" — price in cents, cost in dollars.
- Portfolio summary: "Total deployed: $85.22 | Budget remaining: $14.78" — always dollars.
- Cluster exposure: "$35.52 in Iran Military Operations cluster" — always dollars.
The structured JSON fields (costCents, totalDeployed, budgetRemaining, amountCents) remain in cents for programmatic use — this instruction only applies to the briefing markdown text.

You MUST include an entry in wordScores for EVERY word in the list. Sort strongYes and strongNo by absolute edge descending. The tradeRecommendations.trades should be sorted by costCents descending (largest positions first).`;

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
    maxTokens: 48000,
    enableWebSearch: false,
    model: input.model,
  });
}

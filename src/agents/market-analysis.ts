import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import { MarketAnalysisResult } from "@/types/research";

interface MarketAnalysisAgentInput {
  speaker: string;
  eventTitle: string;
  words: Array<{
    word: string;
    yesPrice: number;
  }>;
}

export async function runMarketAnalysisAgent(
  input: MarketAnalysisAgentInput
): Promise<{ data: MarketAnalysisResult } & AgentCallResult> {
  const priceTable = input.words
    .map((w) => `  ${w.word}: ${Math.round(w.yesPrice * 100)}¢ YES`)
    .join("\n");

  const systemPrompt = `You are a prediction market analyst. Analyze the current pricing of these mention market contracts:

Event: ${input.eventTitle}
Speaker: ${input.speaker}

Current word prices (YES side):
${priceTable}

Analyze:
1. Which words seem overpriced vs underpriced based on general reasoning?
2. Are there any obvious mispricings? (e.g., a word that's virtually certain to be said but priced below 80¢, or a very unlikely word above 50¢)
3. What is the market collectively implying about the event's topics?
4. Are there arbitrage-like opportunities in correlated words? (e.g., if "border" is 80¢ but "wall" is 30¢, and they're usually said together)
5. Consider the vigorish / market efficiency — the house edge in these markets.

Note: This analysis happens BEFORE the historical and contextual research is incorporated. It's purely based on market prices and general knowledge. The synthesizer will combine this with research findings later.

Return structured JSON in this exact format:
\`\`\`json
{
  "marketImpliedTopics": [
    {
      "topic": "string",
      "impliedByWords": ["string"],
      "marketImpliedProbability": number (0.0-1.0)
    }
  ],
  "pricingAssessments": {
    "Word Name": {
      "currentPrice": number,
      "generalAssessment": "overpriced|fairly_priced|underpriced",
      "reasoning": "string"
    }
  },
  "correlatedPairs": [
    {
      "word1": "string",
      "word2": "string",
      "priceDifference": number,
      "correlation": "high|medium|low",
      "note": "string"
    }
  ],
  "overallMarketNotes": "string"
}
\`\`\`

Include an entry in pricingAssessments for EVERY word in the list.`;

  const userMessage = `Analyze these Kalshi mention market prices for ${input.speaker}'s "${input.eventTitle}":

${priceTable}

Identify mispricings, correlated pairs, and what the market is implying about expected topics.`;

  return callAgentForJson<MarketAnalysisResult>({
    systemPrompt,
    userMessage,
    maxTokens: 12000,
    enableWebSearch: false, // Pure analysis, no web search needed
  });
}

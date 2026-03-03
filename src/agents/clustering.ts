import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import { ClusterResult, HistoricalResult, AgendaResult } from "@/types/research";

interface ClusteringAgentInput {
  speaker: string;
  eventTitle: string;
  words: string[];
  historicalResult?: HistoricalResult;
  agendaResult?: AgendaResult;
  model?: string;
}

export async function runClusteringAgent(
  input: ClusteringAgentInput
): Promise<{ data: ClusterResult } & AgentCallResult> {
  const wordList = input.words.map((w) => `  - ${w}`).join("\n");

  let researchContext = "";
  if (input.historicalResult) {
    researchContext += `\n\nHistorical transcript analysis results:\n${JSON.stringify(input.historicalResult.wordFrequencies, null, 2)}`;
  }
  if (input.agendaResult) {
    researchContext += `\n\nAgenda/preview analysis results:\n${JSON.stringify(input.agendaResult.topicWordMapping, null, 2)}`;
  }

  const systemPrompt = `You are a linguistic analyst specializing in political speech. Given this word list from a mention market, group related words into thematic clusters.

Event: ${input.eventTitle}
Speaker: ${input.speaker}

Words:
${wordList}

For each cluster:
1. Name the cluster (e.g., "Immigration", "Economy", "Military")
2. List which words belong to it
3. Assess intra-cluster correlation: if one word in the cluster is said, how likely are the others to also be said?
4. Note any words that don't fit neatly into any cluster (standalone words)

Consider:
- Some words have STRONG correlation (e.g., "border" + "wall" almost always co-occur in immigration discussions)
- Some words share a topic but are NOT correlated (e.g., "tax" and "deficit" relate to economy but might not co-occur)
- Some words are generic enough to span multiple clusters (e.g., "great", "believe")
- A single word can belong to multiple clusters if it genuinely spans topics
${researchContext}

Return structured JSON in this exact format:
\`\`\`json
{
  "clusters": [
    {
      "name": "string",
      "theme": "string",
      "words": ["string"],
      "intraCorrelation": "high|medium|low",
      "correlationNote": "string",
      "tradingImplication": "string",
      "narrative": "string (2-4 sentences explaining why these words are grouped, what the correlation evidence is, and what it means for this specific event)"
    }
  ],
  "standaloneWords": [
    {
      "word": "string",
      "reason": "string"
    }
  ],
  "crossClusterCorrelations": [
    {
      "cluster1": "string",
      "cluster2": "string",
      "correlation": "string",
      "note": "string"
    }
  ]
}
\`\`\``;

  const userMessage = `Group these mention market words into thematic clusters for ${input.speaker}'s "${input.eventTitle}":

${wordList}

Analyze correlations between words and provide trading implications for each cluster.`;

  return callAgentForJson<ClusterResult>({
    systemPrompt,
    userMessage,
    maxTokens: 12000,
    enableWebSearch: false,
    model: input.model,
  });
}

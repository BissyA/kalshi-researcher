import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import { NewsCycleResult } from "@/types/research";

interface NewsCycleAgentInput {
  speaker: string;
  eventTitle: string;
  eventDate: string;
  words: string[];
  model?: string;
}

export async function runNewsCycleAgent(
  input: NewsCycleAgentInput
): Promise<{ data: NewsCycleResult } & AgentCallResult> {
  const wordList = input.words.map((w) => `  - ${w}`).join("\n");

  const systemPrompt = `You are a political media analyst. Analyze the current news cycle to predict which topics ${input.speaker} is likely to bring up at ${input.eventTitle} on ${input.eventDate}.

Search for:
1. Top recent news stories that ${input.speaker} has commented on — focus on the last 24 hours for imminent events, expand to 72+ hours for events further out
2. ${input.speaker}'s recent public statements, interviews, and social media posts across all platforms
3. Trending political topics and controversies
4. Any breaking news that could shift the event's focus
5. What opponents/critics have been saying that ${input.speaker} might respond to
6. Legislative or policy developments the speaker may reference

For each news item or trend, map it to specific words from this list:
${wordList}

Consider: politicians often react to current events even in scripted speeches. A major news story breaking the day before can dominate an otherwise planned address.

Return structured JSON in this exact format:
\`\`\`json
{
  "trendingTopics": [
    {
      "topic": "string",
      "description": "string",
      "relevanceToEvent": "high|medium|low",
      "sources": ["string"],
      "relatedWords": ["string"]
    }
  ],
  "recentSpeakerStatements": [
    {
      "date": "string",
      "platform": "string",
      "summary": "string",
      "wordsUsed": ["string"]
    }
  ],
  "wordImplications": {
    "Word Name": {
      "newsCycleBoost": number (-1.0 to +1.0),
      "reasoning": "string"
    }
  },
  "breakingNewsAlert": "string or null"
}
\`\`\`

Include an entry in wordImplications for EVERY word in the list.`;

  const userMessage = `Analyze the current news cycle and ${input.speaker}'s recent statements ahead of "${input.eventTitle}" on ${input.eventDate}.

Map current events to these mention market words:
${wordList}

Focus on the most recent news and statements — prioritize the last 24-72 hours, scaling the window based on how soon the event is.`;

  return callAgentForJson<NewsCycleResult>({
    systemPrompt,
    userMessage,
    maxTokens: 16000,
    enableWebSearch: true,
    model: input.model,
  });
}

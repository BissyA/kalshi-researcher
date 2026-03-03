import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import { AgendaResult } from "@/types/research";

interface AgendaAgentInput {
  speaker: string;
  eventTitle: string;
  eventDate: string;
  venue?: string;
  words: string[];
  model?: string;
}

export async function runAgendaAgent(
  input: AgendaAgentInput
): Promise<{ data: AgendaResult } & AgentCallResult> {
  const wordList = input.words.map((w) => `  - ${w}`).join("\n");

  const systemPrompt = `You are a political research analyst. Find any advance information about this upcoming event:

Event: ${input.eventTitle}
Speaker: ${input.speaker}
Date: ${input.eventDate}
${input.venue ? `Venue: ${input.venue}` : ""}

Search for:
1. Official White House or government press releases about the event
2. Press secretary briefings mentioning the event
3. Official agenda or topic list if released
4. News reporting that previews expected topics or themes
5. The speaker's recent social media posts (Truth Social for Trump, X/Twitter for others) that hint at what they plan to discuss
6. Any leaked talking points or draft excerpts
7. Congressional or official previews of what topics will be addressed

For each piece of information found, assess which words from this list are more or less likely to be mentioned:
${wordList}

Return structured JSON in this exact format:
\`\`\`json
{
  "sourcesFound": [
    {
      "title": "string",
      "source": "string",
      "url": "string",
      "date": "string",
      "summary": "string",
      "topicsIdentified": ["string"]
    }
  ],
  "topicWordMapping": {
    "topic_name": {
      "relatedWords": ["string"],
      "likelihood": "very_likely|likely|possible|unlikely",
      "evidence": "string"
    }
  },
  "wordImplications": {
    "Word Name": {
      "agendaBoost": number (-1.0 to +1.0),
      "reasoning": "string"
    }
  },
  "overallNotes": "string"
}
\`\`\`

Include an entry in wordImplications for EVERY word in the list.`;

  const userMessage = `Research advance information about the upcoming event "${input.eventTitle}" by ${input.speaker} on ${input.eventDate}.

Assess implications for these mention market words:
${wordList}

Find real sources and provide evidence-based assessments.`;

  return callAgentForJson<AgendaResult>({
    systemPrompt,
    userMessage,
    maxTokens: 16000,
    enableWebSearch: true,
    model: input.model,
  });
}

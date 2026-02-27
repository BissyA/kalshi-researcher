import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import { EventFormatResult } from "@/types/research";

interface EventFormatAgentInput {
  speaker: string;
  eventTitle: string;
  eventDate: string;
  venue?: string;
}

export async function runEventFormatAgent(
  input: EventFormatAgentInput
): Promise<{ data: EventFormatResult } & AgentCallResult> {
  const systemPrompt = `You are a political events analyst. Analyze the format and structure of this upcoming event:

Event: ${input.eventTitle}
Speaker: ${input.speaker}
Date: ${input.eventDate}
${input.venue ? `Venue: ${input.venue}` : ""}

Research:
1. How long do similar events typically last? Find durations of past comparable events.
2. Is the speech expected to be scripted (teleprompter) or off-the-cuff?
3. Will there be a Q&A session, audience interaction, or interview format?
4. How does the format affect word usage:
   - Scripted speeches tend to be more controlled — fewer surprise words
   - Q&A and unscripted moments — more unpredictable vocabulary
   - Longer events — more words mentioned overall
   - Interview format — host's questions can steer topics unpredictably

5. For Kalshi mention markets specifically:
   - Longer events = higher base probability for most words
   - Scripted events = look at prior scripts more than recent news
   - Unscripted/Q&A = weight news cycle and recent statements more heavily

Return structured JSON in this exact format:
\`\`\`json
{
  "estimatedDurationMinutes": number,
  "durationRange": { "min": number, "max": number },
  "format": "scripted|unscripted|mixed|interview",
  "hasQandA": boolean,
  "hasAudienceInteraction": boolean,
  "isLive": boolean,
  "comparableEvents": [
    {
      "title": "string",
      "date": "string",
      "durationMinutes": number,
      "format": "string"
    }
  ],
  "implications": {
    "durationEffect": "string",
    "formatEffect": "string",
    "overallWordCountExpectation": "low|medium|high",
    "scriptedWeight": number (0.0-1.0),
    "currentContextWeight": number (0.0-1.0)
  }
}
\`\`\``;

  const userMessage = `Research the expected format, duration, and structure of "${input.eventTitle}" by ${input.speaker} on ${input.eventDate}${input.venue ? ` at ${input.venue}` : ""}.

Find comparable past events and their durations. Determine if this will be scripted, unscripted, or mixed format.`;

  return callAgentForJson<EventFormatResult>({
    systemPrompt,
    userMessage,
    maxTokens: 8000,
    enableWebSearch: true,
  });
}

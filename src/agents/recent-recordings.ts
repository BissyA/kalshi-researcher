import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import { RecentRecordingsResult } from "@/types/research";

interface RecentRecordingsAgentInput {
  speaker: string;
  eventTitle: string;
  eventDate: string;
  eventType: string;
  model?: string;
}

export async function runRecentRecordingsAgent(
  input: RecentRecordingsAgentInput
): Promise<{ data: RecentRecordingsResult } & AgentCallResult> {
  const systemPrompt = `You are a research assistant specializing in finding video recordings of political events and speeches.

Your task is to find the 3 most recent video recordings of events similar to this upcoming one:

Event: ${input.eventTitle}
Speaker: ${input.speaker}
Date: ${input.eventDate}
Event Type: ${input.eventType}

Instructions:
1. Search for recent recordings of the SAME TYPE of event by this speaker (or the same recurring event series).
   - For example, if the event is a "White House Press Briefing", find the 3 most recent White House Press Briefings.
   - If the event is a "Trump Rally", find the 3 most recent Trump rallies.
   - If the event is an "Address to Congress", find recent addresses to Congress or State of the Union speeches.
2. Prioritize YouTube links, but C-SPAN, official government sites, and major news outlets are also acceptable.
3. Find recordings that are as recent as possible — ideally within the last few months.
4. Each recording MUST have a working URL. Do NOT fabricate or guess URLs.
5. Explain why you selected these specific recordings and how they relate to the upcoming event.

Return structured JSON in this exact format:
\`\`\`json
{
  "recordings": [
    {
      "title": "Full title of the recording",
      "date": "YYYY-MM-DD",
      "url": "https://...",
      "platform": "YouTube|C-SPAN|WhiteHouse.gov|etc",
      "durationMinutes": number or null,
      "description": "Brief description of what happened in this event"
    }
  ],
  "selectionRationale": "Explain why these 3 recordings were chosen and how watching them will help prepare for the upcoming event. Discuss what patterns, vocabulary, and topics the viewer should look for.",
  "searchQueries": ["list of search queries you used to find these recordings"]
}
\`\`\`

IMPORTANT:
- Return exactly 3 recordings, sorted by date (most recent first).
- Each recording MUST be a DIFFERENT event (different date or different occasion). Do NOT return the same event twice with slightly different titles or descriptions. Deduplicate by checking dates and event details.
- If you cannot find 3 recordings of the exact same event type, broaden slightly to similar event types by the same speaker.`;

  const userMessage = `Find the 3 most recent video recordings of events similar to "${input.eventTitle}" by ${input.speaker} (event type: ${input.eventType}, scheduled for ${input.eventDate}). I need direct links to watch these recordings.`;

  return callAgentForJson<RecentRecordingsResult>({
    systemPrompt,
    userMessage,
    maxTokens: 4000,
    enableWebSearch: true,
    model: input.model,
  });
}

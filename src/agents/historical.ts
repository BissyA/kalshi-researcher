import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import { HistoricalResult } from "@/types/research";

interface CachedTranscript {
  title: string;
  date: string;
  source: string;
  url: string;
  wordCount: number;
  summary: string;
}

interface HistoricalAgentInput {
  speaker: string;
  eventTitle: string;
  eventType: string;
  words: string[];
  cachedTranscripts?: CachedTranscript[];
}

export async function runHistoricalAgent(
  input: HistoricalAgentInput
): Promise<{ data: HistoricalResult } & AgentCallResult> {
  const wordList = input.words.map((w) => `  - ${w}`).join("\n");

  const hasCached = input.cachedTranscripts && input.cachedTranscripts.length > 0;
  const cachedSection = hasCached
    ? `\n\nYou already have data from these previously-found transcripts. Do NOT re-search for them — include them in your analysis and focus your web search on finding NEW transcripts not in this list:\n${JSON.stringify(input.cachedTranscripts, null, 2)}\n`
    : "";

  const systemPrompt = `You are a political speech analyst. Your job is to find transcripts of past speeches by ${input.speaker} that are similar to the upcoming event: ${input.eventTitle} (${input.eventType}).${cachedSection}

Steps:
1. Search for transcripts of the speaker's past ${input.eventType} events.${hasCached ? " Focus on finding transcripts NOT already in the cached list above." : ""}
   - For SOTU/Joint Address: search for prior State of the Union or Address to Congress transcripts
   - For press conferences: search for recent press conference transcripts
   - For interviews: search for transcripts of recent interviews on similar shows
   - For rallies: search for recent rally transcripts
   - Search whitehouse.gov, C-SPAN, rev.com/blog, major news outlets (CNN, NBC, NYT)
2. Find at least 3-5 relevant transcripts if possible.
3. For each transcript found, analyze which of these specific words appear:
${wordList}
4. Count frequency: how many of the found transcripts contain each word?
5. Note the context in which words were used (topic, how many times, etc.)
6. For each transcript, record a "wordMentions" object that maps each word from the list to its mention count in that specific transcript (0 if not found). This per-transcript breakdown is critical for the trader to verify evidence.

IMPORTANT: Focus on the EXACT words in the word list. Many Kalshi contracts use slash-separated variants (e.g., "Deport / Deportation") — count a match if ANY variant appears in the transcript.

Return your analysis as structured JSON in this exact format:
\`\`\`json
{
  "transcriptsFound": [
    {
      "title": "string",
      "date": "string",
      "source": "string",
      "url": "string",
      "wordCount": number,
      "summary": "string (brief summary of speech content)",
      "wordMentions": { "WordName": count, "AnotherWord": count }
    }
  ],
  "wordFrequencies": {
    "Word Name": {
      "appearedInCount": number,
      "totalTranscripts": number,
      "frequency": number (0.0-1.0),
      "contextNotes": "string",
      "averageOccurrences": number
    }
  },
  "overallNotes": "string"
}
\`\`\`

Include an entry in wordFrequencies for EVERY word in the list, even if frequency is 0.`;

  const userMessage = `Find and analyze transcripts of past ${input.eventType} speeches by ${input.speaker} to determine word frequency patterns for these words:

${wordList}

The upcoming event is: ${input.eventTitle}

Search for real transcripts and provide actual frequency data.`;

  return callAgentForJson<HistoricalResult>({
    systemPrompt,
    userMessage,
    maxTokens: 16000,
    enableWebSearch: true,
  });
}

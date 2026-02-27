import { callAgentForJson, AgentCallResult } from "@/lib/claude-client";
import { HistoricalResult } from "@/types/research";

interface HistoricalAgentInput {
  speaker: string;
  eventTitle: string;
  eventType: string;
  words: string[];
}

export async function runHistoricalAgent(
  input: HistoricalAgentInput
): Promise<{ data: HistoricalResult } & AgentCallResult> {
  const wordList = input.words.map((w) => `  - ${w}`).join("\n");

  const systemPrompt = `You are a political speech analyst. Your job is to find transcripts of past speeches by ${input.speaker} that are similar to the upcoming event: ${input.eventTitle} (${input.eventType}).

Steps:
1. Search for transcripts of the speaker's past ${input.eventType} events.
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
      "summary": "string (brief summary of speech content)"
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

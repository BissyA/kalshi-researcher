import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Cost per million tokens (Claude Opus 4)
const INPUT_COST_PER_M = 15.0;
const OUTPUT_COST_PER_M = 75.0;

export interface AgentCallOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  enableWebSearch?: boolean;
}

export interface AgentCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
}

/**
 * Parse JSON from Claude's response, handling code fences and bare JSON.
 */
export function parseJsonResponse<T>(text: string): T {
  // Try to extract JSON from code fences first (most reliable)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }

  // Try parsing the whole text as-is (Claude sometimes returns pure JSON)
  try {
    return JSON.parse(text.trim());
  } catch {
    // fall through
  }

  // Find a JSON object by matching balanced braces
  const startIdx = text.indexOf("{");
  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(text.slice(startIdx, i + 1));
        }
      }
    }
  }

  throw new Error("No valid JSON found in response");
}

/**
 * Call a Claude agent with optional web search.
 *
 * web_search is a server-side tool — Anthropic's infrastructure executes search
 * queries automatically within the API call. The response contains text blocks
 * with the final answer plus interleaved server_tool_use / web_search_tool_result
 * blocks. We only need to handle "pause_turn" (server-side loop hit its iteration
 * limit) by re-sending the response to resume.
 */
export async function callAgent(options: AgentCallOptions): Promise<AgentCallResult> {
  const {
    systemPrompt,
    userMessage,
    maxTokens = 16000,
    enableWebSearch = true,
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = enableWebSearch
    ? [{ type: "web_search_20250305", name: "web_search" }]
    : [];

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalTextContent = "";
  const MAX_CONTINUATIONS = 5; // safety limit for pause_turn resumptions

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await anthropic.messages
      .stream({
        model: "claude-opus-4-0",
        max_tokens: maxTokens,
        system: systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
        messages,
      })
      .finalMessage();

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Extract all text blocks from the response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === "text"
    );
    if (textBlocks.length > 0) {
      finalTextContent = textBlocks.map((b) => b.text).join("\n");
    }

    // Done — Claude finished naturally
    if (response.stop_reason === "end_turn") {
      break;
    }

    // Server-side tool loop hit its iteration limit — resume
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    // Any other stop reason (max_tokens, etc.) — stop
    break;
  }

  const estimatedCostCents =
    (totalInputTokens / 1_000_000) * INPUT_COST_PER_M * 100 +
    (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_M * 100;

  return {
    content: finalTextContent,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCostCents: Math.round(estimatedCostCents),
  };
}

/**
 * Call Claude agent and parse the response as JSON.
 * Retries once if JSON parsing fails by asking Claude to fix it.
 */
export async function callAgentForJson<T>(
  options: AgentCallOptions
): Promise<{ data: T } & AgentCallResult> {
  const result = await callAgent(options);

  try {
    const data = parseJsonResponse<T>(result.content);
    return { data, ...result };
  } catch {
    // Retry: ask Claude to fix the JSON
    const fixResult = await callAgent({
      systemPrompt:
        "You are a JSON formatter. The user will give you text that should be valid JSON but has issues. Extract and return ONLY valid JSON, no other text. Wrap in ```json``` code fences.",
      userMessage: `Fix this JSON and return only the corrected JSON:\n\n${result.content}`,
      enableWebSearch: false,
      maxTokens: options.maxTokens,
    });

    const data = parseJsonResponse<T>(fixResult.content);
    return {
      data,
      content: fixResult.content,
      inputTokens: result.inputTokens + fixResult.inputTokens,
      outputTokens: result.outputTokens + fixResult.outputTokens,
      estimatedCostCents:
        result.estimatedCostCents + fixResult.estimatedCostCents,
    };
  }
}

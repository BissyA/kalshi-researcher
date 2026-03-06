import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Per-model pricing (cost per million tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
};

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 3000;

function isRetryableError(err: unknown): boolean {
  // Anthropic SDK errors with status codes
  if (err instanceof Anthropic.APIError) {
    // 429 = rate limited, 529 = overloaded, 500/502/503 = server errors
    // APIConnectionError has status=undefined — also retry those
    if (err.status === undefined) return true;
    if ([429, 500, 502, 503, 529].includes(err.status)) return true;
  }
  // Catch any error containing retryable keywords regardless of type
  // The streaming API may throw non-standard error shapes
  const errStr = String(err instanceof Error ? err.message : JSON.stringify(err)).toLowerCase();
  return errStr.includes("overloaded") || errStr.includes("rate_limit") || errStr.includes("529") || errStr.includes("connection");
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AgentCallOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  enableWebSearch?: boolean;
  model?: string;
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
    model = DEFAULT_MODEL,
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
    let response!: Anthropic.Messages.Message;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await anthropic.messages
          .stream({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            tools: tools.length > 0 ? tools : undefined,
            messages,
          })
          .finalMessage();
        break;
      } catch (err) {
        const isRetryable = isRetryableError(err);
        const errDetail = err instanceof Anthropic.APIError
          ? `APIError status=${err.status} type=${err.error?.type ?? "unknown"}`
          : err instanceof Error
            ? `${err.constructor.name}: ${err.message}`
            : JSON.stringify(err);
        console.error(`[claude-client] API call failed (model=${model}, attempt ${attempt + 1}/${MAX_RETRIES + 1}, retryable=${isRetryable}): ${errDetail}`);
        if (attempt < MAX_RETRIES && isRetryable) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[claude-client] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        throw err;
      }
    }

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

  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];
  const estimatedCostCents =
    (totalInputTokens / 1_000_000) * pricing.input * 100 +
    (totalOutputTokens / 1_000_000) * pricing.output * 100;

  // Strip web search citation tags (e.g. <cite index="1-2,3-4">...</cite>)
  finalTextContent = finalTextContent.replace(/<\/?cite[^>]*>/g, "");

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

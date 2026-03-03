import type { PriceData } from "@/hooks/useLivePrices";

// ── Event & Research Types ──

export interface Event {
  id: string;
  title: string;
  speaker: string;
  event_type: string;
  event_date: string;
  estimated_duration_minutes: number | null;
  status: string;
}

export interface WordScore {
  id: string;
  word_id: string;
  combined_probability: number;
  historical_probability: number;
  agenda_probability: number;
  news_cycle_probability: number;
  base_rate_probability: number;
  market_yes_price: number;
  edge: number;
  confidence: string;
  reasoning: string;
  key_evidence: string[];
  words: {
    word: string;
    kalshi_market_ticker: string;
    cluster_id: string | null;
  };
}

export interface Cluster {
  id: string;
  cluster_name: string;
  theme: string;
  correlation_note: string;
}

export interface ResearchRun {
  id: string;
  layer: string;
  status: string;
  triggered_at: string;
  completed_at: string | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_cents: number | null;
  error_message: string | null;
  briefing: string | null;
  model_used: string | null;
  historical_result: unknown | null;
  agenda_result: unknown | null;
  news_cycle_result: unknown | null;
  event_format_result: unknown | null;
  market_analysis_result: unknown | null;
  cluster_result: unknown | null;
  synthesis_result: unknown | null;
}

export const MODEL_PRESET_LABELS: Record<string, string> = {
  opus: "Opus (Full)",
  hybrid: "Hybrid",
  sonnet: "Sonnet (All)",
  haiku: "Haiku (All)",
};

export interface ResearchSummary {
  historical: unknown;
  agenda: unknown;
  newsCycle: unknown;
  eventFormat: unknown;
  marketAnalysis: unknown;
  clusters: unknown;
  synthesis: unknown;
}

// ── Trade Types ──

export interface Trade {
  id: string;
  word_id: string;
  side: "yes" | "no";
  entry_price: number;
  contracts: number;
  total_cost_cents: number;
  agent_estimated_probability: number | null;
  agent_edge: number | null;
  result: "win" | "loss" | null;
  pnl_cents: number | null;
  created_at: string;
}

export interface Word {
  id: string;
  word: string;
  kalshi_market_ticker: string;
}

export interface EventResult {
  word_id: string;
  was_mentioned: boolean;
}

// ── UI Types ──

export type SortKey = "word" | "combined" | "edge" | "market" | "confidence";
export type TabId = "research" | "sources" | "tradelog";

// ── Live Prices ──

export type { PriceData };

export interface DbEvent {
  id: string;
  kalshi_event_ticker: string;
  title: string;
  speaker: string;
  event_type: string | null;
  event_date: string | null;
  venue: string | null;
  estimated_duration_minutes: number | null;
  status: "pending" | "researched" | "live" | "completed";
  created_at: string;
  updated_at: string;
}

export interface DbWord {
  id: string;
  event_id: string;
  kalshi_market_ticker: string;
  word: string;
  cluster_id: string | null;
  created_at: string;
}

export interface DbWordCluster {
  id: string;
  event_id: string;
  cluster_name: string;
  theme: string | null;
  correlation_note: string | null;
  created_at: string;
}

export interface DbResearchRun {
  id: string;
  event_id: string;
  layer: "baseline" | "current";
  status: "running" | "completed" | "failed";
  triggered_at: string;
  completed_at: string | null;
  historical_result: unknown | null;
  agenda_result: unknown | null;
  news_cycle_result: unknown | null;
  event_format_result: unknown | null;
  market_analysis_result: unknown | null;
  synthesis_result: unknown | null;
  cluster_result: unknown | null;
  model_used: string;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_cents: number | null;
  error_message: string | null;
}

export interface DbWordScore {
  id: string;
  event_id: string;
  word_id: string;
  research_run_id: string;
  historical_probability: number | null;
  agenda_probability: number | null;
  news_cycle_probability: number | null;
  base_rate_probability: number | null;
  combined_probability: number | null;
  market_yes_price: number | null;
  edge: number | null;
  confidence: "high" | "medium" | "low" | null;
  reasoning: string | null;
  key_evidence: string[] | null;
  created_at: string;
}

export interface DbTranscript {
  id: string;
  speaker: string;
  event_type: string | null;
  event_date: string | null;
  title: string | null;
  source_url: string | null;
  full_text: string;
  word_count: number | null;
  created_at: string;
}

export interface DbTrade {
  id: string;
  event_id: string | null;
  word_id: string | null;
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

export interface DbEventResult {
  id: string;
  event_id: string;
  word_id: string;
  was_mentioned: boolean;
  settled_at: string | null;
  created_at: string;
}

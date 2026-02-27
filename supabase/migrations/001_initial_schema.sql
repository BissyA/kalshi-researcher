-- ═══════════════════════════════════════════════════════
-- Kalshi Research Agent — Initial Schema
-- ═══════════════════════════════════════════════════════

-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kalshi_event_ticker TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  speaker TEXT NOT NULL,
  event_type TEXT,
  event_date TIMESTAMPTZ,
  venue TEXT,
  estimated_duration_minutes INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Word clusters
CREATE TABLE word_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  cluster_name TEXT NOT NULL,
  theme TEXT,
  correlation_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Words
CREATE TABLE words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  kalshi_market_ticker TEXT UNIQUE NOT NULL,
  word TEXT NOT NULL,
  cluster_id UUID REFERENCES word_clusters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, word)
);

-- Research runs
CREATE TABLE research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  layer TEXT NOT NULL CHECK (layer IN ('baseline', 'current')),
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  triggered_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  historical_result JSONB,
  agenda_result JSONB,
  news_cycle_result JSONB,
  event_format_result JSONB,
  market_analysis_result JSONB,
  synthesis_result JSONB,
  cluster_result JSONB,
  model_used TEXT DEFAULT 'claude-opus-4-20250514',
  total_input_tokens INTEGER,
  total_output_tokens INTEGER,
  total_cost_cents INTEGER,
  error_message TEXT
);

-- Word scores
CREATE TABLE word_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  word_id UUID REFERENCES words(id) ON DELETE CASCADE,
  research_run_id UUID REFERENCES research_runs(id) ON DELETE CASCADE,
  historical_probability REAL,
  agenda_probability REAL,
  news_cycle_probability REAL,
  base_rate_probability REAL,
  combined_probability REAL,
  market_yes_price REAL,
  edge REAL,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  reasoning TEXT,
  key_evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(word_id, research_run_id)
);

-- Transcripts cache
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker TEXT NOT NULL,
  event_type TEXT,
  event_date DATE,
  title TEXT,
  source_url TEXT,
  full_text TEXT NOT NULL,
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(speaker, title, event_date)
);

-- Trades
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  word_id UUID REFERENCES words(id),
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  entry_price REAL NOT NULL,
  contracts INTEGER NOT NULL,
  total_cost_cents INTEGER NOT NULL,
  agent_estimated_probability REAL,
  agent_edge REAL,
  result TEXT CHECK (result IN ('win', 'loss')),
  pnl_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Event results
CREATE TABLE event_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  word_id UUID REFERENCES words(id) ON DELETE CASCADE,
  was_mentioned BOOLEAN NOT NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, word_id)
);

-- ═══════════════════════════════════════════════════════
-- Views
-- ═══════════════════════════════════════════════════════

CREATE VIEW event_performance AS
SELECT
  e.id as event_id,
  e.title,
  e.event_date,
  COUNT(t.id) as total_trades,
  COUNT(CASE WHEN t.result = 'win' THEN 1 END) as wins,
  COUNT(CASE WHEN t.result = 'loss' THEN 1 END) as losses,
  ROUND(COUNT(CASE WHEN t.result = 'win' THEN 1 END)::NUMERIC / NULLIF(COUNT(t.id), 0), 3) as win_rate,
  SUM(t.pnl_cents) as total_pnl_cents,
  ROUND(AVG(t.agent_edge)::NUMERIC, 3) as avg_agent_edge
FROM events e
LEFT JOIN trades t ON t.event_id = e.id
GROUP BY e.id, e.title, e.event_date;

CREATE VIEW calibration_data AS
SELECT
  ws.combined_probability,
  er.was_mentioned,
  ws.confidence,
  w.word,
  e.title as event_title
FROM word_scores ws
JOIN words w ON w.id = ws.word_id
JOIN events e ON e.id = ws.event_id
JOIN event_results er ON er.word_id = ws.word_id AND er.event_id = ws.event_id
JOIN research_runs rr ON rr.id = ws.research_run_id
WHERE rr.status = 'completed';

-- ═══════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_words_event_id ON words(event_id);
CREATE INDEX idx_research_runs_event_id ON research_runs(event_id);
CREATE INDEX idx_word_scores_event_id ON word_scores(event_id);
CREATE INDEX idx_word_scores_research_run_id ON word_scores(research_run_id);
CREATE INDEX idx_trades_event_id ON trades(event_id);
CREATE INDEX idx_event_results_event_id ON event_results(event_id);
CREATE INDEX idx_transcripts_speaker ON transcripts(speaker);

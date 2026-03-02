-- ============================================================
-- 002: Enable Row Level Security on all tables
-- ============================================================
-- Architecture: All writes go through API routes using the
-- service role key (which bypasses RLS). These policies are
-- a safety net and enable future client-side reads via anon key.
-- ============================================================

-- Enable RLS on all 8 tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_results ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Anon read-only policies (public-facing tables)
-- ============================================================

CREATE POLICY "anon_read_events" ON events
  FOR SELECT USING (true);

CREATE POLICY "anon_read_words" ON words
  FOR SELECT USING (true);

CREATE POLICY "anon_read_word_clusters" ON word_clusters
  FOR SELECT USING (true);

CREATE POLICY "anon_read_research_runs" ON research_runs
  FOR SELECT USING (true);

CREATE POLICY "anon_read_word_scores" ON word_scores
  FOR SELECT USING (true);

-- No anon read on trades, event_results, transcripts (sensitive data)
-- No anon write policies on any table (all writes via service role)

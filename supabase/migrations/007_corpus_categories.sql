-- ═══════════════════════════════════════════════════════
-- Migration 007: Corpus categories
-- Adds category column to events for topical grouping
-- Adds corpus_category to research_runs to track which
-- category was used to filter corpus data for each run
-- ═══════════════════════════════════════════════════════

-- Category on events (e.g. "Rally", "Press Conference", "Sports/Entertainment")
ALTER TABLE events ADD COLUMN category TEXT;
CREATE INDEX idx_events_category ON events(category);

-- Track which corpus category was used for each research run
ALTER TABLE research_runs ADD COLUMN corpus_category TEXT;

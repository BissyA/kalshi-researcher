-- ═══════════════════════════════════════════════════════
-- Dashboard Redesign — Schema Additions
-- ═══════════════════════════════════════════════════════

-- Add briefing column to research_runs (stores markdown briefing from synthesizer)
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS briefing TEXT;

-- Add word_frequencies JSONB column to transcripts (caches per-word counts)
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS word_frequencies JSONB;

-- Fix research_runs status constraint to include 'cancelled'
ALTER TABLE research_runs DROP CONSTRAINT IF EXISTS research_runs_status_check;
ALTER TABLE research_runs ADD CONSTRAINT research_runs_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'cancelled'));

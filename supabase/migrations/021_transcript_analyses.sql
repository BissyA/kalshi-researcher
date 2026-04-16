-- ═══════════════════════════════════════════════════════
-- Migration 021: Transcript Analyses
-- Decouples word detection from transcript ownership.
-- A transcript (reusable reference material) can now have many saved
-- "analyses" — one per event whose strike list we detected against.
-- Detection rows are scoped by analysis_id, not transcript_id, so running
-- a new analysis for a different event no longer overwrites prior ones.
-- ═══════════════════════════════════════════════════════

-- 1. Analyses table
CREATE TABLE IF NOT EXISTS transcript_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(transcript_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_transcript_analyses_transcript ON transcript_analyses(transcript_id);
CREATE INDEX IF NOT EXISTS idx_transcript_analyses_event ON transcript_analyses(event_id);

ALTER TABLE transcript_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_transcript_analyses" ON transcript_analyses FOR SELECT USING (true);

-- 2. Add analysis_id to detection tables
ALTER TABLE section_word_detections
  ADD COLUMN IF NOT EXISTS analysis_id UUID REFERENCES transcript_analyses(id) ON DELETE CASCADE;

ALTER TABLE transcript_word_detections
  ADD COLUMN IF NOT EXISTS analysis_id UUID REFERENCES transcript_analyses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_section_words_analysis ON section_word_detections(analysis_id);
CREATE INDEX IF NOT EXISTS idx_transcript_words_analysis ON transcript_word_detections(analysis_id);

-- 3. Backfill: one analysis per completed transcript that has an event_id
INSERT INTO transcript_analyses (transcript_id, event_id)
SELECT id, event_id FROM transcripts
WHERE completed = true AND event_id IS NOT NULL
ON CONFLICT (transcript_id, event_id) DO NOTHING;

-- 4. Re-key existing detections to the backfilled analyses
UPDATE section_word_detections swd
SET analysis_id = ta.id
FROM transcript_analyses ta
WHERE swd.transcript_id = ta.transcript_id AND swd.analysis_id IS NULL;

UPDATE transcript_word_detections twd
SET analysis_id = ta.id
FROM transcript_analyses ta
WHERE twd.transcript_id = ta.transcript_id AND twd.analysis_id IS NULL;

-- 5. Delete any orphaned detections (transcript had no event_id, can't be backfilled)
DELETE FROM section_word_detections WHERE analysis_id IS NULL;
DELETE FROM transcript_word_detections WHERE analysis_id IS NULL;

-- 6. Make analysis_id NOT NULL now that everything is backfilled
ALTER TABLE section_word_detections ALTER COLUMN analysis_id SET NOT NULL;
ALTER TABLE transcript_word_detections ALTER COLUMN analysis_id SET NOT NULL;

-- 7. Swap unique constraints from transcript-scoped to analysis-scoped
ALTER TABLE section_word_detections DROP CONSTRAINT IF EXISTS section_word_detections_section_id_word_key;
ALTER TABLE transcript_word_detections DROP CONSTRAINT IF EXISTS transcript_word_detections_transcript_id_word_key;

ALTER TABLE section_word_detections
  ADD CONSTRAINT section_word_detections_analysis_section_word_key UNIQUE (analysis_id, section_id, word);

ALTER TABLE transcript_word_detections
  ADD CONSTRAINT transcript_word_detections_analysis_word_key UNIQUE (analysis_id, word);

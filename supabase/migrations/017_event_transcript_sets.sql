-- Migration 017: Event transcript sets
-- Named groups of transcripts for the Compare tab on the research page.
-- Each set represents a "composite view" — multiple transcripts merged into one aggregated output.

CREATE TABLE IF NOT EXISTS event_transcript_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  transcript_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, name)
);

ALTER TABLE event_transcript_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to event_transcript_sets"
  ON event_transcript_sets FOR ALL USING (true) WITH CHECK (true);

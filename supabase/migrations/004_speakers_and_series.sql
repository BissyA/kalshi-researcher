-- ═══════════════════════════════════════════════════════
-- Migration 004: Speakers and Series tables
-- ═══════════════════════════════════════════════════════

-- Speakers — explicitly created, never inferred
CREATE TABLE speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Series — links a Kalshi series ticker to a speaker
CREATE TABLE series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id UUID NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  series_ticker TEXT UNIQUE NOT NULL,
  display_name TEXT,
  events_count INTEGER DEFAULT 0,
  words_count INTEGER DEFAULT 0,
  last_imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_series_speaker_id ON series(speaker_id);

-- Add series_id foreign key to events table
ALTER TABLE events ADD COLUMN series_id UUID REFERENCES series(id) ON DELETE SET NULL;
CREATE INDEX idx_events_series_id ON events(series_id);

-- RLS policies
ALTER TABLE speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_speakers" ON speakers FOR SELECT USING (true);
CREATE POLICY "anon_read_series" ON series FOR SELECT USING (true);

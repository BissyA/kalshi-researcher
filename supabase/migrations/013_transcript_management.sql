-- ═══════════════════════════════════════════════════════
-- Migration 013: Transcript Management System
-- Adds structured transcript cleaning, sectioning, and word detection.
-- Modifies existing transcripts table + creates 4 new tables.
-- ═══════════════════════════════════════════════════════

-- 1. Add new columns to existing transcripts table
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS speaker_id UUID REFERENCES speakers(id) ON DELETE SET NULL;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS raw_text TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS cleaned_text TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS cleaning_status TEXT DEFAULT 'pending'
  CHECK (cleaning_status IN ('pending', 'processing', 'cleaned', 'approved'));
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS sectioning_status TEXT DEFAULT 'pending'
  CHECK (sectioning_status IN ('pending', 'processing', 'sectioned', 'approved'));
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS sectioned_at TIMESTAMPTZ;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_transcripts_speaker_id ON transcripts(speaker_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_event_id ON transcripts(event_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_cleaning_status ON transcripts(cleaning_status);

-- 2. Transcript segments — atomic text chunks tagged speaker/non-speaker
CREATE TABLE IF NOT EXISTS transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  section_id UUID,  -- FK added after sections table is created
  order_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  is_speaker_content BOOLEAN NOT NULL DEFAULT true,
  attribution TEXT,  -- e.g. "Moderator", "Reporter", "Stage Direction"
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_segments_transcript ON transcript_segments(transcript_id);
CREATE INDEX IF NOT EXISTS idx_segments_section ON transcript_segments(section_id);

-- 3. Transcript sections — groupings of segments by topic
CREATE TABLE IF NOT EXISTS transcript_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  section_type TEXT NOT NULL DEFAULT 'remarks'
    CHECK (section_type IN ('remarks', 'qa', 'introduction', 'closing', 'other')),
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sections_transcript ON transcript_sections(transcript_id);

-- Add FK from segments to sections
ALTER TABLE transcript_segments
  ADD CONSTRAINT fk_segment_section
  FOREIGN KEY (section_id) REFERENCES transcript_sections(id) ON DELETE SET NULL;

-- 4. Section-level word detections — which strike words appear per section, with count
CREATE TABLE IF NOT EXISTS section_word_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES transcript_sections(id) ON DELETE CASCADE,
  transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  word_id UUID REFERENCES words(id) ON DELETE SET NULL,
  mention_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(section_id, word)
);

CREATE INDEX IF NOT EXISTS idx_section_words_section ON section_word_detections(section_id);
CREATE INDEX IF NOT EXISTS idx_section_words_transcript ON section_word_detections(transcript_id);
CREATE INDEX IF NOT EXISTS idx_section_words_word ON section_word_detections(word);

-- 5. Transcript-level word summary — aggregate across all sections
CREATE TABLE IF NOT EXISTS transcript_word_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  word_id UUID REFERENCES words(id) ON DELETE SET NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  section_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(transcript_id, word)
);

CREATE INDEX IF NOT EXISTS idx_transcript_words_transcript ON transcript_word_detections(transcript_id);

-- 6. RLS policies
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_word_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_word_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_transcript_segments" ON transcript_segments FOR SELECT USING (true);
CREATE POLICY "anon_read_transcript_sections" ON transcript_sections FOR SELECT USING (true);
CREATE POLICY "anon_read_section_word_detections" ON section_word_detections FOR SELECT USING (true);
CREATE POLICY "anon_read_transcript_word_detections" ON transcript_word_detections FOR SELECT USING (true);

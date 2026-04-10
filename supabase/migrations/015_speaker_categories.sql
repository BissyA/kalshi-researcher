-- ═══════════════════════════════════════════════════════
-- Migration 015: Speaker Categories + Section Category Assignment
-- Adds per-speaker category management and category field on transcript sections.
-- ═══════════════════════════════════════════════════════

-- 1. Speaker categories — the evolving category list per speaker
CREATE TABLE IF NOT EXISTS speaker_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id UUID NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,  -- optional display color (e.g. "green", "blue")
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(speaker_id, name)
);

CREATE INDEX IF NOT EXISTS idx_speaker_categories_speaker ON speaker_categories(speaker_id);

-- 2. Add category column to transcript_sections
ALTER TABLE transcript_sections ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES speaker_categories(id) ON DELETE SET NULL;
ALTER TABLE transcript_sections ADD COLUMN IF NOT EXISTS category_name TEXT;  -- denormalized for display

-- 3. Add review flag to transcripts for retro-classification
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- 4. RLS
ALTER TABLE speaker_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_speaker_categories" ON speaker_categories FOR SELECT USING (true);

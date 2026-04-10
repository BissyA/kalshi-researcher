-- ═══════════════════════════════════════════════════════
-- Migration 014: Backfill existing transcripts
-- Copies full_text → raw_text, links speaker_id and event_id by name matching.
-- ═══════════════════════════════════════════════════════

-- Copy full_text to raw_text for existing transcripts
UPDATE transcripts SET raw_text = full_text WHERE raw_text IS NULL AND full_text IS NOT NULL;

-- Link speaker_id by matching speaker name to speakers table
UPDATE transcripts t
SET speaker_id = s.id
FROM speakers s
WHERE LOWER(t.speaker) = LOWER(s.name)
  AND t.speaker_id IS NULL;

-- Link event_id by matching speaker + event_date to events table
UPDATE transcripts t
SET event_id = e.id
FROM events e
WHERE LOWER(t.speaker) = LOWER(e.speaker)
  AND t.event_date = e.event_date::date
  AND t.event_id IS NULL;

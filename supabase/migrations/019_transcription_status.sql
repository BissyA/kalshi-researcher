-- Add transcription status tracking for async audio transcription (X broadcasts, etc.)
-- The existing cleaning_status pipeline (pending/processing/approved) is preserved.
-- These new columns track the pre-cleaning transcription phase.

ALTER TABLE transcripts ADD COLUMN transcription_status TEXT
  CHECK (transcription_status IN ('downloading', 'transcribing', 'done', 'failed'));

ALTER TABLE transcripts ADD COLUMN transcription_error TEXT;

ALTER TABLE transcripts ADD COLUMN transcription_progress TEXT;

ALTER TABLE transcripts ADD COLUMN source_platform TEXT
  CHECK (source_platform IN ('pdf', 'text', 'youtube', 'x'));

CREATE INDEX idx_transcripts_transcription_status ON transcripts (transcription_status)
  WHERE transcription_status IN ('downloading', 'transcribing');

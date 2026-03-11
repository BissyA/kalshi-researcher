-- ═══════════════════════════════════════════════════════
-- Migration 011: Allow same series ticker for multiple speakers
-- Drop global UNIQUE on series_ticker, replace with UNIQUE(series_ticker, speaker_id)
-- ═══════════════════════════════════════════════════════

ALTER TABLE series DROP CONSTRAINT series_series_ticker_key;

ALTER TABLE series ADD CONSTRAINT series_ticker_speaker_unique UNIQUE (series_ticker, speaker_id);

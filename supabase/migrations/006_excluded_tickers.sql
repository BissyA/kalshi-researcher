-- ═══════════════════════════════════════════════════════
-- Migration 006: Add excluded_tickers to series table
-- Tracks event tickers the user has removed from a series
-- so that refresh/re-import does not bring them back.
-- ═══════════════════════════════════════════════════════

ALTER TABLE series ADD COLUMN excluded_tickers TEXT[] DEFAULT '{}';

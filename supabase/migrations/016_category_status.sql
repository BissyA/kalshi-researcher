-- ═══════════════════════════════════════════════════════
-- Migration 016: Add status to speaker_categories
-- Categories start as 'pending' and become 'approved' or get deleted on reject.
-- ═══════════════════════════════════════════════════════

ALTER TABLE speaker_categories ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved'));

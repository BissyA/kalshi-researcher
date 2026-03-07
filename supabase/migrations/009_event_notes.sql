-- Migration 009: Add pre-event and post-event notes to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS pre_event_notes TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS post_event_notes TEXT;

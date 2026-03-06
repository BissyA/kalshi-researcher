-- Migration 008: Add recent_recordings_result column to research_runs
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS recent_recordings_result jsonb;

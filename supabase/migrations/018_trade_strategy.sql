-- Add strategy column to trades table
-- v1 = original AI-guided strategy, v2 = transcript-driven strategy
ALTER TABLE trades ADD COLUMN strategy TEXT NOT NULL DEFAULT 'v1';

-- All existing trades are v1 (handled by the DEFAULT above)

-- Index for filtering by strategy
CREATE INDEX idx_trades_strategy ON trades (strategy);

-- Migration 012: Add sell trade support with FIFO offset matching
-- Adds action (buy/sell), exit tracking, and match tracking columns to trades

-- 1. Add action column (buy or sell)
ALTER TABLE trades ADD COLUMN action TEXT NOT NULL DEFAULT 'buy';
ALTER TABLE trades ADD CONSTRAINT trades_action_check CHECK (action IN ('buy', 'sell'));

-- 2. Add exit_price for sell trades
ALTER TABLE trades ADD COLUMN exit_price REAL;

-- 3. Add matched_buy_ids to link sells to their matched buys
ALTER TABLE trades ADD COLUMN matched_buy_ids UUID[];

-- 4. Add matched_contracts to track how many contracts on a buy have been sold
ALTER TABLE trades ADD COLUMN matched_contracts INTEGER NOT NULL DEFAULT 0;

-- 5. Add realized_pnl_cents for tracking P&L from sells (on both buy and sell rows)
ALTER TABLE trades ADD COLUMN realized_pnl_cents REAL;

-- 6. Widen the result CHECK constraint to allow 'sold'
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_result_check;
ALTER TABLE trades ADD CONSTRAINT trades_result_check CHECK (result IN ('win', 'loss', 'sold'));

-- 7. Index for efficient FIFO lookups when selling
CREATE INDEX IF NOT EXISTS idx_trades_word_action ON trades(word_id, action, side);

-- Add position_idx to trades table to distinguish long (1) vs short (2) sessions
-- and enable better linkage of auto-closures to the correct group_client_order_id.

BEGIN;

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS position_idx SMALLINT;

ALTER TABLE trades
  ADD CONSTRAINT trades_position_idx_valid CHECK (position_idx IN (1, 2));

-- Helpful index for lookups by user + symbol + position_idx
CREATE INDEX IF NOT EXISTS trades_user_symbol_position_idx_idx
  ON trades (user_id, symbol, position_idx);

COMMIT;
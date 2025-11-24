-- Make client_order_id unique per user, not globally
BEGIN;

-- Drop existing global unique constraint on client_order_id
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_client_order_id_unique;

-- Add composite unique constraint: (user_id, client_order_id)
ALTER TABLE public.trades ADD CONSTRAINT trades_user_client_order_unique UNIQUE (user_id, client_order_id);

COMMIT;
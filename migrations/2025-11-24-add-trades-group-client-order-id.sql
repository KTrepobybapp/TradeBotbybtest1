-- Supabase migration: add group_client_order_id column to trades
-- This stores the opening order's client ID to link related orders (opens/closes)

begin;

alter table public.trades
  add column if not exists group_client_order_id text;

-- Optional index to speed up lookups by group_client_order_id
create index if not exists trades_group_client_order_idx on public.trades (group_client_order_id);

commit;
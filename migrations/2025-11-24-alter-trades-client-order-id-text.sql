-- Supabase migration: change client_order_id and bybit_order_id columns to TEXT
-- This fixes errors when inserting non-UUID client order IDs

begin;

-- Remove defaults if any (safe even if none exist)
alter table public.trades alter column client_order_id drop default;
alter table public.trades alter column bybit_order_id drop default;

-- Change column types from UUID to TEXT, preserving existing data
alter table public.trades
  alter column client_order_id type text using client_order_id::text,
  alter column bybit_order_id type text using bybit_order_id::text;

commit;
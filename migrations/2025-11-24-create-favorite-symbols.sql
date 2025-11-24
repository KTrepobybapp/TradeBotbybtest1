-- Supabase migration: create favorite_symbols table to store per-user favorite instruments

begin;

create table if not exists public.favorite_symbols (
  id bigserial primary key,
  user_id uuid not null,
  symbol text not null,
  created_at timestamptz not null default now()
);

-- Ensure unique favorites per user
create unique index if not exists favorite_symbols_user_symbol_unique
  on public.favorite_symbols(user_id, symbol);

commit;
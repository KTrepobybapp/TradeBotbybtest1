import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cached: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (cached) return cached;
  if (!url || !serviceKey) {
    return null;
  }
  cached = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}

// Fetch recent local trades stored in Supabase (our own log)
export async function fetchRecentLocalTrades(limit: number = 50) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('trades')
    .select('id, symbol, side, size, price, client_order_id, bybit_order_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).map((t: any) => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    size: t.size,
    price: t.price,
    client_order_id: t.client_order_id,
    bybit_order_id: t.bybit_order_id,
    status: t.status,
    timestamp: t.created_at ? Date.parse(t.created_at) : null,
  }));
}

// Favorite symbols helpers
export async function getFavoriteSymbols(userId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('favorite_symbols')
    .select('symbol')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((r: any) => r.symbol as string);
}

export async function addFavoriteSymbol(userId: string, symbol: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { error } = await supabase
    .from('favorite_symbols')
    .insert({ user_id: userId, symbol })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeFavoriteSymbol(userId: string, symbol: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { error } = await supabase
    .from('favorite_symbols')
    .delete()
    .eq('user_id', userId)
    .eq('symbol', symbol);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
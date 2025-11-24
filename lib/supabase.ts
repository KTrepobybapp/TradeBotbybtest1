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
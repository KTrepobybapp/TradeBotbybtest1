import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ESM-compatible import from commonjs package
import bybitPkg from 'bybit-api';
const { WebsocketClient } = bybitPkg;

import { createClient } from '@supabase/supabase-js';

// Env config
const BYBIT_API_KEY = process.env.BYBIT_API_KEY || process.env.NEXT_PUBLIC_BYBIT_API_KEY;
const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET || process.env.NEXT_PUBLIC_BYBIT_API_SECRET;
const BYBIT_TESTNET = (process.env.BYBIT_TESTNET || 'false').toLowerCase() === 'true';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_USER_ID = process.env.SUPABASE_DEFAULT_USER_ID || 'default-user';

if (!BYBIT_API_KEY || !BYBIT_API_SECRET) {
  console.error('[WS Worker] Missing BYBIT_API_KEY/BYBIT_API_SECRET in env');
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[WS Worker] Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in env');
}

// Supabase admin client
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// In-memory map for linking closures without clientOrderId -> group_client_order_id
// key: `${symbol}:${positionIdx}` value: last known group_client_order_id
const positionGroupMap = new Map();

function mapPositionIdxToSide(positionIdx) {
  if (positionIdx === 1 || positionIdx === '1') return 'buy'; // long
  if (positionIdx === 2 || positionIdx === '2') return 'sell'; // short
  return null;
}

async function preloadGroupForSymbolPosition(symbol, positionIdx) {
  if (!supabase) return null;
  const side = mapPositionIdxToSide(positionIdx);
  if (!side) return null;
  const { data, error } = await supabase
    .from('trades')
    .select('group_client_order_id')
    .eq('user_id', DEFAULT_USER_ID)
    .eq('symbol', symbol)
    .eq('side', side)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[WS Worker] preloadGroup error:', error.message);
    return null;
  }
  const groupId = data && data[0] ? data[0].group_client_order_id : null;
  if (groupId) {
    positionGroupMap.set(`${symbol}:${positionIdx}`, groupId);
  }
  return groupId;
}

async function upsertTradeEvent(event) {
  if (!supabase) return;
  // Basic normalization; extend later based on event.topic specifics
  const { topic, data } = event;
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload) return;

  const symbol = payload.symbol || payload.s || payload.baseCoin || null;
  const clientOrderId = payload.clientOrderId || payload.orderLinkId || null;
  const bybitOrderId = payload.orderId || payload.oId || null;
  const side = (payload.side || payload.S || '').toLowerCase(); // buy/sell if present
  const price = payload.price || payload.avgPrice || payload.p || null;
  const size = payload.size || payload.execQty || payload.q || null;
  const status = payload.orderStatus || payload.orderStatusStr || payload.status || topic;
  const timestamp = payload.ts || payload.createdTime || payload.updateTime || Date.now();

  // Attempt to attach group_client_order_id using positionIdx if available
  let group_client_order_id = null;
  const positionIdx = payload.positionIdx ?? payload.posIdx ?? null;
  if (symbol && positionIdx != null) {
    const key = `${symbol}:${positionIdx}`;
    group_client_order_id = positionGroupMap.get(key) || (await preloadGroupForSymbolPosition(symbol, positionIdx));
  }

  // Idempotent upsert: try to find existing by bybit_order_id or client_order_id, then insert/update
  let existing = null;
  if (bybitOrderId) {
    const { data: foundByOrderId } = await supabase
      .from('trades')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('bybit_order_id', bybitOrderId)
      .limit(1)
      .maybeSingle();
    existing = foundByOrderId || null;
  }
  if (!existing && clientOrderId) {
    const { data: foundByClientId } = await supabase
      .from('trades')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('client_order_id', clientOrderId)
      .limit(1)
      .maybeSingle();
    existing = foundByClientId || null;
  }

  const row = {
    user_id: DEFAULT_USER_ID,
    symbol,
    side,
    size,
    price,
    status,
    client_order_id: clientOrderId,
    bybit_order_id: bybitOrderId,
    group_client_order_id,
    created_at: new Date(timestamp).toISOString(),
  };

  if (existing) {
    await supabase.from('trades').update(row).eq('id', existing.id);
  } else {
    await supabase.from('trades').insert(row);
  }
}

function start() {
  const wsConfig = {
    key: BYBIT_API_KEY,
    secret: BYBIT_API_SECRET,
    demoTrading: BYBIT_TESTNET,
    // Heartbeat & reconnect are handled by SDK with configurable intervals
    pingInterval: 10000,
    pongTimeout: 1500,
    reconnectTimeout: 500,
  };

  const ws = new WebsocketClient(wsConfig);

  ws.on('open', () => console.log('[WS Worker] connection open'));
  ws.on('response', (r) => console.log('[WS Worker] response', r?.success, r?.ret_msg));
  ws.on('reconnected', () => console.log('[WS Worker] reconnected'));
  ws.on('close', () => console.log('[WS Worker] connection closed'));
  ws.on('error', (err) => console.error('[WS Worker] error', err?.message || err));

  // v5 private linear topics: order/execution/position
  ws.subscribeV5(['order', 'execution', 'position'], 'linear');

  ws.on('update', async (message) => {
    try {
      console.log('[WS Worker] update', message?.topic);
      await upsertTradeEvent(message);
    } catch (err) {
      console.error('[WS Worker] upsert error', err?.message || err);
    }
  });
}

start();
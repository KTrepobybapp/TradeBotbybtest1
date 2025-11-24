'use server';

import { tryCreateBybitClient, calculateTpSlPrices, roundToPrecision } from '../../lib/bybit';
import { getSupabaseAdmin } from '../../lib/supabase';
import { randomUUID } from 'node:crypto';

export type ExecuteTradeParams = {
  userId: string; // Supabase auth.user id, required for logging
  stopLossPct?: number; // e.g. 0.01 for 1%
  takeProfitPct?: number; // e.g. 0.02 for 2%
  reduceOnly?: boolean;
  useUSDT?: boolean; // interpret amount as notional USDT
  clientOrderId?: string; // optional custom client order id
  hedgeMode?: boolean; // account is in hedge mode (two-way), requires positionIdx 1/2
};

export async function getBybitMarkets() {
  const ex = tryCreateBybitClient();
  if (!ex) return { spot: [], swap: [] };
  await ex.loadMarkets();
  const spot: string[] = [];
  const swap: string[] = [];
  for (const m of Object.values((ex as any).markets || {})) {
    const mm: any = m;
    const symbol: string = mm.symbol;
    if (mm.spot) spot.push(symbol);
    if (mm.swap || mm.contract) swap.push(symbol);
  }
  spot.sort();
  swap.sort();
  return { spot, swap };
}

export async function executeTrade(
  symbol: string,
  side: 'buy' | 'sell',
  amount: number,
  params: ExecuteTradeParams
) {
  if (!params?.userId) {
    return { ok: false, error: 'Missing userId in params' };
  }

  const clientOrderId = params.clientOrderId?.trim()
    ? params.clientOrderId.trim()
    : randomUUID();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured', clientOrderId };
  }

  const exchange = tryCreateBybitClient();
  if (!exchange) {
    await supabase.from('trades').insert({
      user_id: params.userId,
      symbol,
      side,
      size: amount,
      price: null,
      client_order_id: clientOrderId,
      bybit_order_id: null,
      status: 'error',
    });
    return { ok: false, error: 'Bybit credentials are not configured', clientOrderId };
  }

  try {
    await exchange.loadMarkets();

    // Ticker for last price reference
    const ticker = await exchange.fetchTicker(symbol);
    const last = ticker.last ?? ticker.close ?? ticker.bid ?? ticker.ask;
    if (!last) {
      throw new Error('Unable to fetch last price for symbol ' + symbol);
    }

    const market = exchange.market(symbol);
    const { tpPrice, slPrice } = calculateTpSlPrices(
      last,
      side,
      params.takeProfitPct,
      params.stopLossPct
    );

    const tpRounded =
      tpPrice !== undefined ? roundToPrecision(tpPrice, (market as any)?.precision?.price) : undefined;
    const slRounded =
      slPrice !== undefined ? roundToPrecision(slPrice, (market as any)?.precision?.price) : undefined;

    // Convert USDT notional to base amount if requested
    const baseAmount = params.useUSDT
      ? roundToPrecision(amount / Number(last), (market as any)?.precision?.amount)
      : amount;

    // Build order options depending on market type
    const orderOptions: any = { clientOrderId };
    if ((market as any)?.swap || (market as any)?.contract) {
      // Derivatives / perpetual: TP/SL i reduceOnly wspierane + positionIdx dla hedge mode
      orderOptions.takeProfit = tpRounded;
      orderOptions.stopLoss = slRounded;
      orderOptions.tpTriggerBy = 'LastPrice';
      orderOptions.slTriggerBy = 'LastPrice';
      orderOptions.reduceOnly = params.reduceOnly ?? false;
      // Position index: 0 dla One-Way, 1 dla Long w Hedge Mode, 2 dla Short w Hedge Mode
      const hedge = !!params.hedgeMode;
      orderOptions.positionIdx = hedge ? (side === 'buy' ? 1 : 2) : 0;
    } else {
      // Spot: bez TP/SL, reduceOnly i positionIdx, aby uniknąć błędu
    }

    const order = await exchange.createOrder(symbol, 'market', side, baseAmount, undefined, orderOptions);

    const bybitOrderId = (order as any)?.id ?? (order as any)?.info?.orderId ?? null;
    const price = (order as any)?.average ?? (order as any)?.price ?? null;
    const status = (order as any)?.status ?? 'open';

    const { data: record, error: insertError } = await supabase
      .from('trades')
      .insert({
        user_id: params.userId,
        symbol,
        side,
        size: amount,
        price,
        client_order_id: clientOrderId,
        bybit_order_id: bybitOrderId,
        status,
      })
      .select()
      .single();

    if (insertError) {
      return { ok: false, error: `Supabase insert error: ${insertError.message}`, clientOrderId, order };
    }

    return { ok: true, clientOrderId, order, record };
  } catch (err: any) {
    // Log failed attempt as error status
    await supabase.from('trades').insert({
      user_id: params.userId,
      symbol,
      side,
      size: amount,
      price: null,
      client_order_id: clientOrderId,
      bybit_order_id: null,
      status: 'error',
    });

    return { ok: false, error: err?.message ?? 'Unknown error', clientOrderId };
  }
}
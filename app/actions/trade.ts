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
};

export async function executeTrade(
  symbol: string,
  side: 'buy' | 'sell',
  amount: number,
  params: ExecuteTradeParams
) {
  if (!params?.userId) {
    return { ok: false, error: 'Missing userId in params' };
  }

  const clientOrderId = randomUUID();

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
      tpPrice !== undefined ? roundToPrecision(tpPrice, market?.precision?.price) : undefined;
    const slRounded =
      slPrice !== undefined ? roundToPrecision(slPrice, market?.precision?.price) : undefined;

    // Convert USDT notional to base amount if requested
    const baseAmount = params.useUSDT
      ? roundToPrecision(amount / Number(last), market?.precision?.amount)
      : amount;

    const order = await exchange.createOrder(symbol, 'market', side, baseAmount, undefined, {
      clientOrderId,
      takeProfit: tpRounded,
      stopLoss: slRounded,
      tpTriggerBy: 'LastPrice',
      slTriggerBy: 'LastPrice',
      reduceOnly: params.reduceOnly ?? false,
    } as any);

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
'use server';

import { tryCreateBybitClient, calculateTpSlPrices, roundToPrecision } from '../../lib/bybit';
import { getSupabaseAdmin } from '../../lib/supabase';
import { randomUUID } from 'node:crypto';
import { getFavoriteSymbols, addFavoriteSymbol, removeFavoriteSymbol } from '../../lib/supabase';

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

// Dodatkowa akcja: szczegóły rynku + ostatnia cena, aby walidować minima/step i obliczyć kontrakty
export async function getBybitMarketInfo(symbol: string) {
  const ex = tryCreateBybitClient();
  if (!ex) return null;
  await ex.loadMarkets();
  const m: any = ex.market(symbol);
  if (!m) return null;
  const t = await ex.fetchTicker(symbol);
  const last = t.last ?? t.close ?? t.bid ?? t.ask ?? null;
  return {
    symbol: m.symbol,
    type: m.spot ? 'spot' : (m.swap || m.contract ? 'swap' : 'unknown'),
    base: m.base,
    quote: m.quote,
    precision: {
      amount: m.precision?.amount,
      price: m.precision?.price,
    },
    limits: {
      amount: { min: m.limits?.amount?.min, max: m.limits?.amount?.max },
      cost: { min: m.limits?.cost?.min, max: m.limits?.cost?.max },
    },
    contractSize: m.contractSize ?? null,
    last,
  } as const;
}

export async function executeTrade(
  symbol: string,
  side: 'buy' | 'sell',
  amount: number,
  params: ExecuteTradeParams
) {
  const effectiveUserId = (params?.userId && params.userId.trim()) || (process.env.SUPABASE_DEFAULT_USER_ID || '').trim();
  if (!effectiveUserId) {
    return { ok: false, error: 'Missing userId (no param and no SUPABASE_DEFAULT_USER_ID)' };
  }

  const clientOrderId = (() => {
    const rawSuffix = params.clientOrderId?.trim();
    if (rawSuffix) {
      // Sanitize: replace spaces with '-' and strip invalid characters (allow only A-Z, a-z, 0-9, '_' and '-')
      const suffix = rawSuffix.replace(/\s+/g, '-').replace(/[^A-Za-z0-9_-]/g, '');
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const MM = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const HH = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const prefix = `${yy}${MM}${dd}${HH}${mm}${ss}`; // 12 znaków: YYMMDDHHMMSS
      const full = `${prefix}${suffix}`;
      const maxLen = Number(process.env.BYBIT_CLIENT_ORDER_ID_MAXLEN || '36');
      return full.length > maxLen ? full.slice(0, maxLen) : full;
    }
    return randomUUID();
  })();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured', clientOrderId };
  }

  const exchange = tryCreateBybitClient();
  if (!exchange) {
    await supabase
      .from('trades')
      .upsert(
        {
          user_id: effectiveUserId,
          symbol,
          side,
          size: amount,
          price: null,
          client_order_id: clientOrderId,
          bybit_order_id: null,
          status: 'error',
        },
        { onConflict: 'user_id,client_order_id' }
      );
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

    const market = exchange.market(symbol) as any;
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

    // Zbuduj opcje zlecenia zależnie od typu rynku
    const orderOptions: any = { clientOrderId };
    if (market?.swap || market?.contract) {
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

    // Przelicz poprawnie ilość do wysłania (spot: base amount; swap: liczba kontraktów)
    let orderAmount: number;
    if (market?.swap || market?.contract) {
      const contractSize = market.contractSize || 1;
      const sizeFloat = params.useUSDT
        ? amount / (contractSize * Number(last))
        : amount / contractSize;
      const sizePrec = Number(exchange.amountToPrecision(symbol, sizeFloat));

      const minContracts = market?.limits?.amount?.min;
      if (typeof minContracts === 'number' && sizePrec < minContracts) {
        throw new Error(
          `Za mała liczba kontraktów: ${sizePrec}. Minimum dla ${symbol} to ${minContracts}.`
        );
      }
      const minCost = market?.limits?.cost?.min;
      const cost = sizePrec * contractSize * Number(last);
      if (typeof minCost === 'number' && cost < minCost) {
        throw new Error(
          `Za mała wartość nominalna: ${cost.toFixed(4)} ${(market.quote || 'USDT')}. Minimum to ${minCost}.`
        );
      }
      orderAmount = sizePrec;
    } else {
      const baseFloat = params.useUSDT ? amount / Number(last) : amount;
      const basePrec = Number(exchange.amountToPrecision(symbol, baseFloat));

      const minAmount = market?.limits?.amount?.min;
      if (typeof minAmount === 'number' && basePrec < minAmount) {
        throw new Error(
          `Za mała ilość (${basePrec} ${market.base}). Minimum dla ${symbol} to ${minAmount}.`
        );
      }
      const minCost = market?.limits?.cost?.min;
      const cost = basePrec * Number(last);
      if (typeof minCost === 'number' && cost < minCost) {
        throw new Error(
          `Za mała wartość transakcji: ${cost.toFixed(4)} ${(market.quote || 'USDT')}. Minimum to ${minCost}.`
        );
      }
      orderAmount = basePrec;
    }

    const order = await exchange.createOrder(symbol, 'market', side, orderAmount, undefined, orderOptions);

    // Force-set TP/SL via trading-stop to ensure both are applied on Bybit
    if ((market?.swap || market?.contract) && (tpRounded !== undefined || slRounded !== undefined)) {
      try {
        await setPositionTradingStopAction(symbol, side === 'buy' ? 'long' : 'short', {
          takeProfit: tpRounded,
          stopLoss: slRounded,
          tpTriggerBy: 'LastPrice',
          slTriggerBy: 'LastPrice',
          hedgeMode: !!params.hedgeMode,
        })
      } catch {}
    }

    const bybitOrderId = (order as any)?.id ?? (order as any)?.info?.orderId ?? null;
    const price = (order as any)?.average ?? (order as any)?.price ?? null;
    const status = (order as any)?.status ?? 'open';

    const { data: record, error: insertError } = await supabase
      .from('trades')
      .upsert(
        {
          user_id: effectiveUserId,
          symbol,
          side,
          size: amount,
          price,
          client_order_id: clientOrderId,
          bybit_order_id: bybitOrderId,
          status,
        },
        { onConflict: 'user_id,client_order_id' }
      )
      .select()
      .single();

    if (insertError) {
      return { ok: false, error: `Supabase insert error: ${insertError.message}`, clientOrderId, order };
    }

    return { ok: true, clientOrderId, order, record };
  } catch (err: any) {
    await supabase
      .from('trades')
      .upsert(
        {
          user_id: effectiveUserId,
          symbol,
          side,
          size: amount,
          price: null,
          client_order_id: clientOrderId,
          bybit_order_id: null,
          status: 'error',
        },
        { onConflict: 'user_id,client_order_id' }
      );

    return { ok: false, error: err?.message ?? 'Unknown error', clientOrderId };
  }
}

export async function getFavoriteSymbolsAction() {
  const userId = process.env.SUPABASE_DEFAULT_USER_ID;
  if (!userId) return [];
  return await getFavoriteSymbols(userId);
}

export async function addFavoriteSymbolAction(symbol: string) {
  const userId = process.env.SUPABASE_DEFAULT_USER_ID;
  if (!userId) return { ok: false, error: 'Brak SUPABASE_DEFAULT_USER_ID' };
  return await addFavoriteSymbol(userId, symbol);
}

export async function removeFavoriteSymbolAction(symbol: string) {
  const userId = process.env.SUPABASE_DEFAULT_USER_ID;
  if (!userId) return { ok: false, error: 'Brak SUPABASE_DEFAULT_USER_ID' };
  return await removeFavoriteSymbol(userId, symbol);
}

export async function getOpenPositionsAction() {
  const ex = tryCreateBybitClient();
  if (!ex) return [];
  try {
    const positions = await ex.fetchPositions();
    const rows = (positions || []).filter((p: any) => {
      const contracts = p.contracts ?? p.info?.size ?? 0;
      return Number(contracts) !== 0;
    }).map((p: any) => {
      const symbol = p.symbol ?? p.info?.symbol ?? '—';
      const side = p.side ?? p.info?.side ?? (Number(p.contracts ?? p.info?.size ?? 0) > 0 ? 'long' : 'short');
      const contracts = Number(p.contracts ?? p.info?.size ?? 0);
      const entryPrice = typeof p.entryPrice !== 'undefined' ? Number(p.entryPrice) : (p.info?.avgPrice ? Number(p.info?.avgPrice) : null);
      const unrealizedPnl = typeof p.unrealizedPnl !== 'undefined' ? Number(p.unrealizedPnl) : (p.info?.unrealisedPnl ? Number(p.info?.unrealisedPnl) : null);
      const tp = typeof p.takeProfit !== 'undefined' ? Number(p.takeProfit) : (typeof p.info?.takeProfit !== 'undefined' ? Number(p.info?.takeProfit) : null);
      const sl = typeof p.stopLoss !== 'undefined' ? Number(p.stopLoss) : (typeof p.info?.stopLoss !== 'undefined' ? Number(p.info?.stopLoss) : null);
      return { symbol, side, contracts, entryPrice, unrealizedPnl, tp, sl };
    });

    // Enrich with client order id (opening group id) from Supabase
    const supa = getSupabaseAdmin();
    const userId = (process.env.SUPABASE_DEFAULT_USER_ID || '').trim();
    if (supa && userId && rows.length > 0) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const desiredSide = r.side === 'long' ? 'buy' : 'sell';
        try {
          const { data, error } = await supa
            .from('trades')
            .select('client_order_id')
            .eq('user_id', userId)
            .eq('symbol', r.symbol)
            .eq('side', desiredSide)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          const coid = !error && data?.client_order_id ? String(data.client_order_id) : null;
          rows[i] = { ...r, clientOrderId: coid };
        } catch {
          rows[i] = { ...r, clientOrderId: null };
        }
      }
    }

    return rows;
  } catch {
    return [];
  }
}

export async function closePositionMarketAction(symbol: string, side: 'long' | 'short', percent: number = 100, hedgeMode: boolean = true) {
  const ex = tryCreateBybitClient();
  if (!ex) return { ok: false, error: 'Brak konfiguracji Bybit' };
  try {
    await ex.loadMarkets();
    const market: any = ex.market(symbol);
    const positions = await ex.fetchPositions(symbol);
    const pos = (positions || []).find((p: any) => (p.side ?? p.info?.side) === side);
    if (!pos) return { ok: false, error: 'Pozycja nie znaleziona' };
    const size = Number(pos.contracts ?? pos.info?.size ?? 0);
    if (size <= 0) return { ok: false, error: 'Rozmiar pozycji = 0' };
    const amountToClose = Math.max(0, Math.min(size, Number((size * percent) / 100)));
    const orderSide = side === 'long' ? 'sell' : 'buy';
    const options: any = { reduceOnly: true };
    if (market?.swap || market?.contract) {
      options.positionIdx = hedgeMode ? (orderSide === 'buy' ? 2 : 1) : 0; // closing flips side index
    }

    // Resolve group client order id (opening id) from Supabase and attach a unique close link id to the exchange order
    const supabase = getSupabaseAdmin();
    const effectiveUserId = (process.env.SUPABASE_DEFAULT_USER_ID || '').trim();
    let groupClientOrderId: string | null = null;
    if (supabase && effectiveUserId) {
      const desiredOpenSide = side === 'long' ? 'buy' : 'sell';
      try {
        const { data, error } = await supabase
          .from('trades')
          .select('client_order_id')
          .eq('user_id', effectiveUserId)
          .eq('symbol', symbol)
          .eq('side', desiredOpenSide)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (!error && data?.client_order_id) groupClientOrderId = String(data.client_order_id);
      } catch {}
    }
    // Build a unique client order id for Bybit close request (Bybit requires uniqueness), but persist the group id in our DB for tracking
    const maxLen = Number(process.env.BYBIT_CLIENT_ORDER_ID_MAXLEN || '36');
    if (groupClientOrderId) {
      const suffix = '-CLOSE-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      let candidate = `${groupClientOrderId}${suffix}`;
      options.clientOrderId = candidate.length > maxLen ? candidate.slice(0, maxLen) : candidate;
    }

    const order = await ex.createOrder(symbol, 'market', orderSide, amountToClose, undefined, options);

    // Log closing in Supabase, keeping original opening client_order_id for linkage
    if (supabase && effectiveUserId) {
      const bybitOrderId = (order as any)?.id ?? (order as any)?.info?.orderId ?? null;
      const price = (order as any)?.average ?? (order as any)?.price ?? null;
      const status = (order as any)?.status ?? 'open';
      try {
        await supabase
          .from('trades')
          .insert({
            user_id: effectiveUserId,
            symbol,
            side: orderSide,
            size: amountToClose,
            price,
            client_order_id: groupClientOrderId ?? (options.clientOrderId || null),
            bybit_order_id: bybitOrderId,
            status,
          });
      } catch {}
    }

    return { ok: true, order };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Błąd zamykania market' };
  }
}

export async function closePositionLimitAction(symbol: string, side: 'long' | 'short', percent: number = 100, price: number, hedgeMode: boolean = true) {
  const ex = tryCreateBybitClient();
  if (!ex) return { ok: false, error: 'Brak konfiguracji Bybit' };
  try {
    await ex.loadMarkets();
    const market: any = ex.market(symbol);
    const positions = await ex.fetchPositions(symbol);
    const pos = (positions || []).find((p: any) => (p.side ?? p.info?.side) === side);
    if (!pos) return { ok: false, error: 'Pozycja nie znaleziona' };
    const size = Number(pos.contracts ?? pos.info?.size ?? 0);
    if (size <= 0) return { ok: false, error: 'Rozmiar pozycji = 0' };
    const amountToClose = Math.max(0, Math.min(size, Number((size * percent) / 100)));
    const orderSide = side === 'long' ? 'sell' : 'buy';
    const options: any = { reduceOnly: true };
    if (market?.swap || market?.contract) {
      options.positionIdx = hedgeMode ? (orderSide === 'buy' ? 2 : 1) : 0;
    }

    // Resolve group client order id (opening id) and attach a unique close link id to the exchange order
    const supabase = getSupabaseAdmin();
    const effectiveUserId = (process.env.SUPABASE_DEFAULT_USER_ID || '').trim();
    let groupClientOrderId: string | null = null;
    if (supabase && effectiveUserId) {
      const desiredOpenSide = side === 'long' ? 'buy' : 'sell';
      try {
        const { data, error } = await supabase
          .from('trades')
          .select('client_order_id')
          .eq('user_id', effectiveUserId)
          .eq('symbol', symbol)
          .eq('side', desiredOpenSide)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (!error && data?.client_order_id) groupClientOrderId = String(data.client_order_id);
      } catch {}
    }
    const maxLen = Number(process.env.BYBIT_CLIENT_ORDER_ID_MAXLEN || '36');
    if (groupClientOrderId) {
      const suffix = '-CLOSE-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      let candidate = `${groupClientOrderId}${suffix}`;
      options.clientOrderId = candidate.length > maxLen ? candidate.slice(0, maxLen) : candidate;
    }

    const order = await ex.createOrder(symbol, 'limit', orderSide, amountToClose, price, options);

    // Log closing in Supabase, keeping original opening client_order_id for linkage
    if (supabase && effectiveUserId) {
      const bybitOrderId = (order as any)?.id ?? (order as any)?.info?.orderId ?? null;
      const avgPrice = (order as any)?.average ?? (order as any)?.price ?? null;
      const status = (order as any)?.status ?? 'open';
      try {
        await supabase
          .from('trades')
          .insert({
            user_id: effectiveUserId,
            symbol,
            side: orderSide,
            size: amountToClose,
            price: avgPrice,
            client_order_id: groupClientOrderId ?? (options.clientOrderId || null),
            bybit_order_id: bybitOrderId,
            status,
          });
      } catch {}
    }

    return { ok: true, order };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Błąd zamykania limit' };
  }
}

export async function setPositionTradingStopAction(
  symbol: string,
  side: 'long' | 'short',
  args: {
    takeProfit?: number;
    stopLoss?: number;
    trailingStop?: number;
    activePrice?: number;
    tpTriggerBy?: 'LastPrice' | 'MarkPrice' | 'IndexPrice';
    slTriggerBy?: 'LastPrice' | 'MarkPrice' | 'IndexPrice';
    hedgeMode?: boolean;
  }
) {
  const ex = tryCreateBybitClient();
  if (!ex) return { ok: false, error: 'Brak konfiguracji Bybit' };
  try {
    await ex.loadMarkets();
    const market: any = ex.market(symbol);
    if (!(market?.swap || market?.contract)) {
      return { ok: false, error: 'TP/SL dostępne tylko dla kontraktów (swap/contract)' };
    }
    const marketId: string = market?.id ?? symbol.replace('/', '');
    const category: string = market?.linear ? 'linear' : (market?.inverse ? 'inverse' : 'linear');
    const hedge = !!args.hedgeMode;
    const positionIdx = hedge ? (side === 'long' ? 1 : 2) : 0;

    const params: any = {
      category,
      symbol: marketId,
      positionIdx,
    };
    if (typeof args.takeProfit === 'number') {
      params.takeProfit = String(args.takeProfit);
      params.tpTriggerBy = args.tpTriggerBy ?? 'LastPrice';
    }
    if (typeof args.stopLoss === 'number') {
      params.stopLoss = String(args.stopLoss);
      params.slTriggerBy = args.slTriggerBy ?? 'LastPrice';
    }
    if (typeof args.trailingStop === 'number') {
      params.trailingStop = String(args.trailingStop);
    }
    if (typeof args.activePrice === 'number') {
      params.activePrice = String(args.activePrice);
    }

    // Use CCXT raw endpoint for Bybit v5 position trading stop
    const resp = await (ex as any).privatePostV5PositionTradingStop(params);
    const ok = !!resp && (resp.retCode === 0 || resp.code === 0 || resp.success === true);
    return ok ? { ok: true, response: resp } : { ok: false, error: (resp?.retMsg || resp?.msg || 'Błąd ustawiania TP/SL') };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Błąd ustawiania TP/SL' };
  }
}

export async function getRecentLocalTradesAction(limit: number = 200) {
  try {
    const supa = await import('../../lib/supabase');
    const rows = await supa.fetchRecentLocalTrades(limit);
    return rows || [];
  } catch {
    return [];
  }
}
export async function getRecentTradesAction(limit: number = 50) {
  try {
    const bybit = await import('../../lib/bybit');
    const trades = await bybit.fetchRecentTrades(limit);
    return trades || [];
  } catch {
    return [];
  }
}
import ccxt from 'ccxt';

export function tryCreateBybitClient() {
  const apiKey = process.env.BYBIT_API_KEY;
  const secret = process.env.BYBIT_API_SECRET;
  if (!apiKey || !secret) {
    return null;
  }
  const exchange = new ccxt.bybit({
    apiKey,
    secret,
    enableRateLimit: true,
  });
  const isTestnet = process.env.BYBIT_TESTNET === 'true';
  if (isTestnet && typeof (exchange as any).setSandboxMode === 'function') {
    (exchange as any).setSandboxMode(true);
  }
  exchange.options = {
    ...(exchange.options || {}),
    defaultType: 'swap',
    createMarketBuyOrderRequiresPrice: false,
  } as any;
  return exchange as ccxt.bybit;
}

export function roundToPrecision(value: number, precision?: number) {
  if (precision === undefined || precision === null) return value;
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export function calculateTpSlPrices(
  last: number,
  side: 'buy' | 'sell',
  takeProfitPct?: number,
  stopLossPct?: number
) {
  const tp =
    typeof takeProfitPct === 'number'
      ? side === 'buy'
        ? last * (1 + takeProfitPct)
        : last * (1 - takeProfitPct)
      : undefined;
  const sl =
    typeof stopLossPct === 'number'
      ? side === 'buy'
        ? last * (1 - stopLossPct)
        : last * (1 + stopLossPct)
      : undefined;
  return { tpPrice: tp, slPrice: sl };
}

// Fetch recent account trades (fills) from Bybit via CCXT and normalize common fields
export async function fetchRecentTrades(limit: number = 50, symbol?: string) {
  const ex = tryCreateBybitClient();
  if (!ex) return [];
  try {
    const trades = await ex.fetchMyTrades(symbol, undefined, limit);
    return (trades || []).map((t: any) => {
      const size =
        typeof t.amount !== 'undefined'
          ? t.amount
          : t.info?.qty ?? t.info?.size ?? null;
      const price =
        typeof t.price !== 'undefined'
          ? t.price
          : t.info?.avgPrice ?? t.info?.price ?? null;
      // IMPORTANT: ensure order_id is the order identifier, not the trade id
      const orderId = t.order ?? t.info?.orderId ?? null;
      // Client order id (orderLinkId on Bybit)
      const clientOrderId = t.clientOrderId ?? t.info?.orderLinkId ?? null;
      const ts =
        typeof t.timestamp === 'number'
          ? t.timestamp
          : (t.datetime ? Date.parse(t.datetime) : null) ?? (t.info?.timestamp ? Number(t.info?.timestamp) : null);
      return {
        symbol: t.symbol ?? t.info?.symbol ?? '—',
        side: t.side ?? t.info?.side ?? '—',
        size: size !== null ? Number(size) : null,
        price: price !== null ? Number(price) : null,
        order_id: orderId,
        client_order_id: clientOrderId,
        id: t.id ?? t.info?.tradeId ?? null, // keep trade id for row key
        timestamp: ts,
        fee: t.fee?.cost ?? t.info?.execFee ?? null,
        feeCurrency: t.fee?.currency ?? t.info?.feeCurrency ?? 'USDT',
      };
    });
  } catch (e) {
    return [];
  }
}
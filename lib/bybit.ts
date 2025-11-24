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
'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { executeTrade, getBybitMarkets, getBybitMarketInfo, getFavoriteSymbolsAction, addFavoriteSymbolAction, removeFavoriteSymbolAction } from '../app/actions/trade';

export default function TradingPanel() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [amount, setAmount] = useState(50); // default in USDT
  const [useUSDT, setUseUSDT] = useState(true);
  const [stopLossPct, setStopLossPct] = useState(0.01);
  const [takeProfitPct, setTakeProfitPct] = useState(0.02);
  // const [userId, setUserId] = useState(''); // removed: using env fallback on server
  const [reduceOnly, setReduceOnly] = useState(false);
  const [result, setResult] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  const [clientOrderId, setClientOrderId] = useState('');
  const [hedgeMode, setHedgeMode] = useState(true);

  const [spotSymbols, setSpotSymbols] = useState<string[]>([]);
  const [swapSymbols, setSwapSymbols] = useState<string[]>([]);
  const [marketType, setMarketType] = useState<'spot' | 'swap'>('swap');
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>([]);

  const [marketInfo, setMarketInfo] = useState<any | null>(null);
  // Ergonomics: toggle for advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Client Order ID prefix/suffix and validation
  const BYBIT_MAXLEN = 36; // Bybit orderLinkId max length on UI side
  const SUFFIX_MAXLEN = BYBIT_MAXLEN - 12; // 12-char time prefix (YYMMDDHHMMSS)
  const PREFIX_REFRESH_MS = 1000; // refresh prefix every 1s to keep seconds accurate

  function buildIdPrefix(date: Date = new Date()) {
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    return `${yy}${mm}${dd}${hh}${min}${sec}`;
  }

  const [idPrefix, setIdPrefix] = useState<string>(buildIdPrefix());

  useEffect(() => {
    const timer = setInterval(() => setIdPrefix(buildIdPrefix()), PREFIX_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const suffixLen = clientOrderId.length;
  const totalLen = idPrefix.length + suffixLen;
  const overLimit = totalLen > BYBIT_MAXLEN;
  const fullPreview = (idPrefix + clientOrderId).slice(0, BYBIT_MAXLEN);
  useEffect(() => {
    (async () => {
      try {
        const { spot, swap } = await getBybitMarkets();
        setSpotSymbols(spot);
        setSwapSymbols(swap);
        const favs = await getFavoriteSymbolsAction();
        setFavoriteSymbols(favs || []);
        if (swap.length > 0) {
          setMarketType('swap');
          const initial = swap.includes(symbol) ? symbol : swap[0];
          setSymbol(initial);
          const info = await getBybitMarketInfo(initial);
          setMarketInfo(info);
        } else if (spot.length > 0) {
          setMarketType('spot');
          const initial = spot.includes(symbol) ? symbol : spot[0];
          setSymbol(initial);
          const info = await getBybitMarketInfo(initial);
          setMarketInfo(info);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const info = await getBybitMarketInfo(symbol);
        setMarketInfo(info);
      } catch {}
    })();
  }, [symbol]);

  const submitOrder = (side: 'buy' | 'sell') => {
    setResult('');

    startTransition(async () => {
      const res = await executeTrade(symbol, side, amount, {
        userId: '', // empty to trigger SUPABASE_DEFAULT_USER_ID fallback
        stopLossPct,
        takeProfitPct,
        reduceOnly,
        useUSDT,
        clientOrderId: clientOrderId || undefined,
        hedgeMode,
      });

      if (res.ok) {
        setResult(`OK: clientOrderId=${res.clientOrderId}`);
        // Trigger global refresh of history 1s after placing an order
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('order-placed', { detail: { clientOrderId: res.clientOrderId, symbol } }));
        }
      } else {
        setResult(`ERROR: ${res.error} (clientOrderId=${res.clientOrderId})`);
      }
    });
  };

  const currentList = marketType === 'swap' ? swapSymbols : spotSymbols;

  // Favorite symbols helpers for UI
  const isFavorite = favoriteSymbols.includes(symbol);
  const toggleFavorite = async () => {
    if (isFavorite) {
      const res = await removeFavoriteSymbolAction(symbol);
      if (res && (res as any).ok) {
        setFavoriteSymbols((prev) => prev.filter((s) => s !== symbol));
      }
    } else {
      const res = await addFavoriteSymbolAction(symbol);
      if (res && (res as any).ok) {
        setFavoriteSymbols((prev) => [symbol, ...prev.filter((s) => s !== symbol)]);
      }
    }
  };
  const minAmountText = useMemo(() => {
    if (!marketInfo) return '';
    const type = marketInfo.type;
    if (type === 'swap') {
      const minContracts = marketInfo?.limits?.amount?.min;
      const minCost = marketInfo?.limits?.cost?.min;
      const cs = marketInfo.contractSize || 1;
      const last = marketInfo.last || 0;
      const minNotional = typeof minContracts === 'number' ? minContracts * cs * last : undefined;
      const pieces = [] as string[];
      if (typeof minContracts === 'number') pieces.push(`min kontrakty: ${minContracts}`);
      if (typeof minNotional === 'number') pieces.push(`≈ min nominalnie: ${minNotional.toFixed(4)} ${marketInfo.quote}`);
      if (typeof minCost === 'number') pieces.push(`min koszt: ${minCost} ${marketInfo.quote}`);
      return pieces.join(' | ');
    }
    if (type === 'spot') {
      const minAmount = marketInfo?.limits?.amount?.min;
      const minCost = marketInfo?.limits?.cost?.min;
      const last = marketInfo.last || 0;
      const minNotional = typeof minAmount === 'number' ? minAmount * last : undefined;
      const pieces = [] as string[];
      if (typeof minAmount === 'number') pieces.push(`min ilość: ${minAmount} ${marketInfo.base}`);
      if (typeof minNotional === 'number') pieces.push(`≈ min nominalnie: ${minNotional.toFixed(4)} ${marketInfo.quote}`);
      if (typeof minCost === 'number') pieces.push(`min koszt: ${minCost} ${marketInfo.quote}`);
      return pieces.join(' | ');
    }
    return '';
  }, [marketInfo, useUSDT]);

  const amountLabel = marketInfo?.type === 'swap'
    ? (useUSDT ? 'Nominał (USDT/quote) → przeliczymy na kontrakty' : 'Kontrakty (liczba)')
    : (useUSDT ? `Nominał (${marketInfo?.quote || 'USDT'}) → przeliczymy na ${marketInfo?.base || 'base'}` : `Ilość (${marketInfo?.base || 'base'})`);

  const adjustToMinimum = () => {
    if (!marketInfo) return;
    const type = marketInfo.type;
    const last = marketInfo.last || 0;
    if (type === 'swap') {
      const minContracts = marketInfo?.limits?.amount?.min;
      const minCost = marketInfo?.limits?.cost?.min;
      const cs = marketInfo.contractSize || 1;
      if (useUSDT) {
        const minNotionalFromContracts = typeof minContracts === 'number' ? minContracts * cs * last : undefined;
        const target = Math.max(
          typeof minNotionalFromContracts === 'number' ? minNotionalFromContracts : 0,
          typeof minCost === 'number' ? minCost : 0
        );
        if (target > 0) setAmount(Number(target.toFixed(4)));
      } else {
        if (typeof minContracts === 'number') setAmount(Number(minContracts));
      }
    } else if (type === 'spot') {
      const minAmount = marketInfo?.limits?.amount?.min;
      const minCost = marketInfo?.limits?.cost?.min;
      if (useUSDT) {
        const minNotionalFromAmount = typeof minAmount === 'number' ? minAmount * last : undefined;
        const target = Math.max(
          typeof minNotionalFromAmount === 'number' ? minNotionalFromAmount : 0,
          typeof minCost === 'number' ? minCost : 0
        );
        if (target > 0) setAmount(Number(target.toFixed(4)));
      } else {
        if (typeof minAmount === 'number') setAmount(Number(minAmount));
      }
    }
  };

  return (
    <div className="card">
      <div className="card-header">Trading Panel</div>
      <div className="card-body space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Rynek</label>
            <div className="flex gap-2">
              <Button variant={marketType === 'swap' ? 'success' : 'secondary'} onClick={() => setMarketType('swap')}>Perpetual</Button>
              <Button variant={marketType === 'spot' ? 'success' : 'secondary'} onClick={() => setMarketType('spot')}>Spot</Button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Symbol</label>
            <select className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {currentList.length === 0 ? (
                <option>Brak symboli</option>
              ) : (
                currentList.map((s) => <option key={s} value={s}>{s}</option>)
              )}
            </select>
            <div className="mt-2 flex items-center justify-between">
              <Button variant={isFavorite ? 'success' : 'secondary'} size="sm" onClick={toggleFavorite}>
                {isFavorite ? 'Usuń z Ulubionych' : 'Dodaj do Ulubionych'}
              </Button>
            </div>
            {favoriteSymbols.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {favoriteSymbols.map((fs) => (
                  <Button key={fs} variant={fs === symbol ? 'success' : 'secondary'} size="sm" onClick={() => setSymbol(fs)}>
                    {fs}
                  </Button>
                ))}
              </div>
            )}
            {marketInfo && (
              <div className="mt-2 text-[11px] text-neutral-500">
                Precyzja: ilość {marketInfo?.precision?.amount ?? '—'} | cena {marketInfo?.precision?.price ?? '—'}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">{amountLabel}</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <div className="mt-2 flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-xs text-neutral-400">
                <input type="checkbox" checked={useUSDT} onChange={(e) => setUseUSDT(e.target.checked)} />
                Użyj USDT (przeliczenie na ilość kontraktów)
              </label>
              <Button variant="secondary" size="sm" onClick={adjustToMinimum}>Dopasuj do minimum</Button>
            </div>
            {minAmountText && (
              <div className="mt-2 text-[11px] text-neutral-500">{minAmountText}</div>
            )}
          </div>
        </div>

        {/* ClientOrderId UI: prefix + suffix with preview and validation */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Client Order ID</label>
            <div className="grid grid-cols-1 gap-2">
              <div className="text-[11px] text-neutral-500">Prefiks czasu (YYMMDDHHMMSS):</div>
              <Input value={idPrefix} readOnly />
              <div className="text-[11px] text-neutral-500">Sufiks (edytowalne, dozwolone: litery, cyfry, '_' i '-', max {SUFFIX_MAXLEN} znaków):</div>
              <Input
                placeholder="np. bot-alpha-001"
                value={clientOrderId}
                onChange={(e) => {
                  const raw = e.target.value;
                  const sanitized = raw.replace(/\s+/g, '-').replace(/[^A-Za-z0-9_-]/g, '');
                  setClientOrderId(sanitized.slice(0, SUFFIX_MAXLEN));
                }}
              />
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-neutral-500">Długość sufiksu: {suffixLen}/{SUFFIX_MAXLEN}</span>
                <span className={overLimit ? 'text-red-500' : 'text-neutral-500'}>Pełna długość: {Math.min(totalLen, BYBIT_MAXLEN)}/{BYBIT_MAXLEN}</span>
              </div>
              {suffixLen === 0 ? (
                <div className="text-[11px] text-neutral-500">Brak sufiksu — po stronie serwera wygenerujemy UUID.</div>
              ) : (
                <div className="text-[11px] text-neutral-500">Pełny ID (podgląd): <span className="font-mono">{fullPreview}</span></div>
              )}
              {overLimit && (
                <div className="text-[11px] text-red-500">Przekroczono maksymalną długość {BYBIT_MAXLEN}. Skróciliśmy podgląd. Ogranicz sufiks.</div>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Hedge Mode (pozycje dwukierunkowe)</label>
            <label className="mt-1 inline-flex items-center gap-2 text-xs text-neutral-400">
              <input type="checkbox" checked={hedgeMode} onChange={(e) => setHedgeMode(e.target.checked)} />
              Włącz hedging (ustawi właściwy positionIdx)
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Take Profit (%)</label>
            <Input type="number" step="0.001" value={takeProfitPct} onChange={(e) => setTakeProfitPct(Number(e.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Stop Loss (%)</label>
            <Input type="number" step="0.001" value={stopLossPct} onChange={(e) => setStopLossPct(Number(e.target.value))} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-xs text-neutral-400">
            <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
            Reduce Only (tylko dla Perpetual)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="success" size="lg" disabled={isPending || overLimit} onClick={() => submitOrder('buy')}>LONG</Button>
            <Button variant="destructive" size="lg" disabled={isPending || overLimit} onClick={() => submitOrder('sell')}>SHORT</Button>
          </div>
        </div>

        <div className="text-xs text-neutral-400">{isPending ? 'Wysyłanie zlecenia...' : result}</div>
      </div>
    </div>
  );
}
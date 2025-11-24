'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { executeTrade, getBybitMarkets } from '../app/actions/trade';

export default function TradingPanel() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [amount, setAmount] = useState(50); // default in USDT
  const [useUSDT, setUseUSDT] = useState(true);
  const [stopLossPct, setStopLossPct] = useState(0.01);
  const [takeProfitPct, setTakeProfitPct] = useState(0.02);
  const [userId, setUserId] = useState('');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [result, setResult] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  const [clientOrderId, setClientOrderId] = useState('');
  const [hedgeMode, setHedgeMode] = useState(false);

  const [spotSymbols, setSpotSymbols] = useState<string[]>([]);
  const [swapSymbols, setSwapSymbols] = useState<string[]>([]);
  const [marketType, setMarketType] = useState<'spot' | 'swap'>('swap');

  useEffect(() => {
    (async () => {
      try {
        const { spot, swap } = await getBybitMarkets();
        setSpotSymbols(spot);
        setSwapSymbols(swap);
        if (swap.length > 0) {
          setMarketType('swap');
          setSymbol(swap.includes(symbol) ? symbol : swap[0]);
        } else if (spot.length > 0) {
          setMarketType('spot');
          setSymbol(spot.includes(symbol) ? symbol : spot[0]);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const submitOrder = (side: 'buy' | 'sell') => {
    setResult('');

    startTransition(async () => {
      const res = await executeTrade(symbol, side, amount, {
        userId,
        stopLossPct,
        takeProfitPct,
        reduceOnly,
        useUSDT,
        clientOrderId: clientOrderId || undefined,
        hedgeMode,
      });

      if (res.ok) {
        setResult(`OK: clientOrderId=${res.clientOrderId}`);
      } else {
        setResult(`ERROR: ${res.error} (clientOrderId=${res.clientOrderId})`);
      }
    });
  };

  const currentList = marketType === 'swap' ? swapSymbols : spotSymbols;

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
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Wielkość</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-neutral-400">
              <input type="checkbox" checked={useUSDT} onChange={(e) => setUseUSDT(e.target.checked)} />
              Użyj USDT (przeliczenie na ilość kontraktów)
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">User ID (Supabase)</label>
            <Input placeholder="uuid użytkownika" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Client Order ID (opcjonalne)</label>
            <Input placeholder="np. bot-alpha-2025-001" value={clientOrderId} onChange={(e) => setClientOrderId(e.target.value)} />
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
            <Button variant="success" size="lg" disabled={isPending || !userId} onClick={() => submitOrder('buy')}>LONG</Button>
            <Button variant="destructive" size="lg" disabled={isPending || !userId} onClick={() => submitOrder('sell')}>SHORT</Button>
          </div>
        </div>

        <div className="text-xs text-neutral-400">{isPending ? 'Wysyłanie zlecenia...' : result}</div>
      </div>
    </div>
  );
}
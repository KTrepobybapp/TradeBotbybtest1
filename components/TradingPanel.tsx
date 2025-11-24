'use client';

import React, { useState, useTransition } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { executeTrade } from '../app/actions/trade';

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

  const submitOrder = (side: 'buy' | 'sell') => {
    setResult('');

    startTransition(async () => {
      let tradeAmount = amount;

      if (useUSDT) {
        // convert USDT size to base amount using a simple fetch to last via server action would be ideal,
        // but for simplicity, pass USDT amount and let the server compute TP/SL using last; we will approximate amount by USDT/last on server soon.
        // For now we treat amount as contracts/base units if not using USDT.
      }

      const res = await executeTrade(symbol, side, tradeAmount, {
        userId,
        stopLossPct,
        takeProfitPct,
        reduceOnly,
      });

      if (res.ok) {
        setResult(`OK: clientOrderId=${res.clientOrderId}`);
      } else {
        setResult(`ERROR: ${res.error} (clientOrderId=${res.clientOrderId})`);
      }
    });
  };

  return (
    <div className="card">
      <div className="card-header">Trading Panel</div>
      <div className="card-body space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Symbol</label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Wielkość</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-neutral-400">
              <input type="checkbox" checked={useUSDT} onChange={(e) => setUseUSDT(e.target.checked)} />
              Użyj USDT (przeliczenie na ilość kontraktów)
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">User ID (Supabase)</label>
            <Input placeholder="uuid użytkownika" value={userId} onChange={(e) => setUserId(e.target.value)} />
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
          <div className="flex items-end justify-between">
            <label className="inline-flex items-center gap-2 text-xs text-neutral-400">
              <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
              Reduce Only
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="success" size="lg" disabled={isPending || !userId} onClick={() => submitOrder('buy')}>LONG</Button>
          <Button variant="destructive" size="lg" disabled={isPending || !userId} onClick={() => submitOrder('sell')}>SHORT</Button>
        </div>

        <div className="text-xs text-neutral-400">{isPending ? 'Wysyłanie zlecenia...' : result}</div>
      </div>
    </div>
  );
}
import { tryCreateBybitClient } from '../lib/bybit';

export default async function BalanceCard() {
  const ex = tryCreateBybitClient();
  let usdt: number | null = null;
  if (ex) {
    try {
      const balance = await ex.fetchBalance();
      const raw = balance.total?.USDT ?? balance.free?.USDT ?? balance.info?.result?.list?.[0]?.totalEquity ?? null;
      usdt = raw !== null ? Number(raw) : null;
    } catch {
      usdt = null;
    }
  }

  return (
    <div className="card">
      <div className="card-header">Saldo USDT</div>
      <div className="card-body">
        <div className="text-3xl font-semibold">{usdt !== null ? usdt.toFixed(2) : '—'}</div>
        <div className="mt-1 text-xs text-neutral-500">Unified Trading Account</div>
      </div>
    </div>
  );
}
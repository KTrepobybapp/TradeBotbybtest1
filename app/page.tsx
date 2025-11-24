import { tryCreateBybitClient } from '../lib/bybit';
import { getSupabaseAdmin } from '../lib/supabase';
import { ArrowUpRight, Database, Server } from 'lucide-react';
import TradingPanel from '../components/TradingPanel';
import BalanceCard from '../components/BalanceCard';
import PositionsTable from '../components/PositionsTable';
import HistoryTable from '../components/HistoryTable';

async function getStatus() {
  // Check Supabase
  const supabase = getSupabaseAdmin();
  let dbOk = false;
  if (supabase) {
    const db = await supabase.from('trades').select('id').limit(1);
    dbOk = !db.error;
  }

  // Check Bybit
  let apiOk = false;
  const ex = tryCreateBybitClient();
  if (ex) {
    try {
      await ex.fetchTime();
      apiOk = true;
    } catch {
      apiOk = false;
    }
  }

  return { dbOk, apiOk };
}

export default async function Page() {
  const { dbOk, apiOk } = await getStatus();

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">One-Click Trading</h1>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm ${dbOk ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
            <Database className="h-4 w-4" /> DB: {dbOk ? 'OK' : 'ERROR'}
          </span>
          <span className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm ${apiOk ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
            <Server className="h-4 w-4" /> API: {apiOk ? 'OK' : 'ERROR'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <BalanceCard />
        </div>
        <div className="md:col-span-2">
          <TradingPanel />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="md:col-span-1">
          <PositionsTable />
        </div>
        <div className="md:col-span-1">
          <HistoryTable />
        </div>
      </div>

      <footer className="pt-6 text-xs text-neutral-500">
        Uwaga: Dla market orderów wielkość pozycji liczona jest domyślnie w USDT i przeliczana na ilość kontraktów po bieżącej cenie. <ArrowUpRight className="inline h-3 w-3" />
      </footer>
    </div>
  );
}
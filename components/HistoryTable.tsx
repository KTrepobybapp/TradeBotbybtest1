import { fetchRecentTrades } from '../lib/bybit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

export default async function HistoryTable() {
  const trades = await fetchRecentTrades(50)

  const rows = (trades || [])
    .filter((t: any) => t && (t.size !== null || t.price !== null))
    .sort((a: any, b: any) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

  return (
    <div className="card">
      <div className="card-header">Historia Transakcji (Bybit)</div>
      <div className="card-body">
        {rows.length === 0 ? (
          <div className="text-sm text-neutral-400">Brak danych lub brak konfiguracji kluczy API Bybit.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Czas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t: any, idx: number) => (
                <TableRow key={t.id ?? `${t.order_id}-${idx}`}>
                  <TableCell>{t.symbol}</TableCell>
                  <TableCell>{t.side}</TableCell>
                  <TableCell>{typeof t.size === 'number' ? t.size : '—'}</TableCell>
                  <TableCell>{typeof t.price === 'number' ? t.price : '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{t.order_id ?? '—'}</TableCell>
                  <TableCell>{t.fee !== null && typeof t.fee !== 'undefined' ? `${Number(t.fee).toFixed(6)} ${t.feeCurrency}` : '—'}</TableCell>
                  <TableCell>{t.timestamp ? new Date(t.timestamp).toLocaleString() : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
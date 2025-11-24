import { getSupabaseAdmin } from '../lib/supabase'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

export default async function HistoryTable() {
  const client = getSupabaseAdmin()
  let data: any[] | null = null
  let error: { message: string } | null = null

  if (!client) {
    error = { message: 'Supabase nie jest skonfigurowany. Uzupełnij SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY w .env.local.' }
  } else {
    const res = await client
      .from('trades')
      .select('symbol, side, size, price, client_order_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    data = res.data as any[] | null
    error = res.error as any
  }

  return (
    <div className="card">
      <div className="card-header">Ostatnie Transakcje</div>
      <div className="card-body">
        {error ? (
          <div className="text-sm text-red-400">Błąd: {error.message}</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-neutral-400">Brak danych</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Client Order ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((t: any) => (
                <TableRow key={t.client_order_id}>
                  <TableCell>{t.symbol}</TableCell>
                  <TableCell>{t.side}</TableCell>
                  <TableCell>{t.size}</TableCell>
                  <TableCell>{t.price ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{t.client_order_id}</TableCell>
                  <TableCell>{t.status}</TableCell>
                  <TableCell>{new Date(t.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
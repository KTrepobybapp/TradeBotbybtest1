'use client'

import React, { useEffect, useState } from 'react'
import { getRecentTradesAction, getRecentLocalTradesAction } from '../app/actions/trade'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Button } from './ui/button'

export default function HistoryTable() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const fetchRows = async () => {
    try {
      setLoading(true)
      const bybit = await getRecentTradesAction(50)
      const local = await getRecentLocalTradesAction(200)
      // Map: bybit_order_id -> client_order_id
      const localMap = new Map<string, string>((local || []).map((t: any) => [String(t.bybit_order_id ?? ''), String(t.client_order_id ?? '')]))
      const merged = (bybit || [])
        .map((b: any) => ({
          timestamp: b.timestamp,
          symbol: b.symbol,
          side: b.side,
          size: b.size,
          price: b.price,
          order_id: b.order_id,
          client_order_id: b.client_order_id || (b.order_id ? localMap.get(String(b.order_id)) : undefined) || '—',
        }))
        .sort((a: any, b: any) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      setRows(merged)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRows()

    const handler = () => {
      setTimeout(fetchRows, 1000)
    }
    window.addEventListener('order-placed', handler)
    return () => window.removeEventListener('order-placed', handler)
  }, [])

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <span>Historia Transakcji (Bybit)</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? 'Rozwiń' : 'Zwiń'}
          </Button>
          <Button variant="secondary" size="sm" onClick={fetchRows} disabled={loading}>
            {loading ? 'Odświeżanie...' : 'Odśwież'}
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="card-body">
          {rows.length === 0 ? (
            <div className="text-sm text-neutral-400">Brak transakcji lub błąd pobierania.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Ilość</TableHead>
                  <TableHead>Cena</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Client Order ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>{r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}</TableCell>
                    <TableCell>{r.symbol}</TableCell>
                    <TableCell className={r.side === 'buy' || r.side === 'Buy' || r.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{r.side}</TableCell>
                    <TableCell>{typeof r.size === 'number' ? r.size : '—'}</TableCell>
                    <TableCell>{typeof r.price === 'number' ? r.price : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.order_id ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.client_order_id ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}
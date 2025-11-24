'use client'

import React, { useEffect, useState } from 'react'
import { getOpenPositionsAction, closePositionMarketAction, closePositionLimitAction, getBybitMarketInfo, setPositionTradingStopAction } from '../app/actions/trade'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Button } from './ui/button'
import { Input } from './ui/input'

export default function PositionsTable() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [controls, setControls] = useState<Record<string, { expanded: boolean; percent: number; limitPrice?: number; tpPrice?: number; slPrice?: number; trailingStop?: number; activePrice?: number; working?: boolean; message?: string }>>({})

  const setControl = (key: string, patch: Partial<{ expanded: boolean; percent: number; limitPrice?: number; tpPrice?: number; slPrice?: number; trailingStop?: number; activePrice?: number; working?: boolean; message?: string }>) => {
    setControls((prev) => ({
      ...prev,
      [key]: { expanded: prev[key]?.expanded ?? false, percent: prev[key]?.percent ?? 100, ...prev[key], ...patch },
    }))
  }

  const handleToggle = (key: string, p?: any) => {
    const nextExpanded = !(controls[key]?.expanded ?? false)
    const patch: any = { expanded: nextExpanded }
    if (nextExpanded) {
      if (typeof p?.tp === 'number') patch.tpPrice = p.tp
      if (typeof p?.sl === 'number') patch.slPrice = p.sl
    }
    setControl(key, patch)
  }

  const handleCloseMarket = async (symbol: string, side: 'long' | 'short', key: string) => {
    setControl(key, { working: true, message: '' })
    try {
      const percent = controls[key]?.percent ?? 100
      const res = await closePositionMarketAction(symbol, side, percent, true)
      if ((res as any)?.ok) {
        setControl(key, { message: 'Zamknięto market' })
        await fetchRows()
      } else {
        setControl(key, { message: `Błąd: ${(res as any)?.error || 'nieznany'}` })
      }
    } catch (e: any) {
      setControl(key, { message: e?.message ?? 'Błąd wykonania' })
    } finally {
      setControl(key, { working: false })
    }
  }

  const handleCloseLimit = async (symbol: string, side: 'long' | 'short', key: string) => {
    setControl(key, { working: true, message: '' })
    try {
      const percent = controls[key]?.percent ?? 100
      const price = Number(controls[key]?.limitPrice ?? NaN)
      const res = await closePositionLimitAction(symbol, side, percent, price, true)
      if ((res as any)?.ok) {
        setControl(key, { message: 'Wystawiono zlecenie limit' })
        await fetchRows()
      } else {
        setControl(key, { message: `Błąd: ${(res as any)?.error || 'nieznany'}` })
      }
    } catch (e: any) {
      setControl(key, { message: e?.message ?? 'Błąd wykonania' })
    } finally {
      setControl(key, { working: false })
    }
  }

  const pickMidPrice = async (symbol: string, key: string) => {
    try {
      const info = await getBybitMarketInfo(symbol)
      const last = Number(info?.last ?? 0)
      if (last > 0) setControl(key, { limitPrice: last })
    } catch {}
  }

  const handleSetTpSl = async (symbol: string, side: 'long' | 'short', key: string) => {
    setControl(key, { working: true, message: '' })
    try {
      const tp = controls[key]?.tpPrice
      const sl = controls[key]?.slPrice
      if (typeof tp !== 'number' && typeof sl !== 'number') {
        setControl(key, { message: 'Podaj TP lub SL' })
        return
      }
      const res = await setPositionTradingStopAction(symbol, side, {
        takeProfit: typeof tp === 'number' ? tp : undefined,
        stopLoss: typeof sl === 'number' ? sl : undefined,
        tpTriggerBy: 'LastPrice',
        slTriggerBy: 'LastPrice',
        hedgeMode: true,
      })
      if ((res as any)?.ok) {
        setControl(key, { message: 'Zaktualizowano TP/SL' })
        await fetchRows()
      } else {
        setControl(key, { message: `Błąd: ${(res as any)?.error || 'nieznany'}` })
      }
    } catch (e: any) {
      setControl(key, { message: e?.message ?? 'Błąd ustawiania TP/SL' })
    } finally {
      setControl(key, { working: false })
    }
  }

  const handleSetTrailing = async (symbol: string, side: 'long' | 'short', key: string) => {
    setControl(key, { working: true, message: '' })
    try {
      const ts = controls[key]?.trailingStop
      const ap = controls[key]?.activePrice
      if (typeof ts !== 'number') {
        setControl(key, { message: 'Podaj trailing stop (wartość w punktach/cenie)' })
        return
      }
      const res = await setPositionTradingStopAction(symbol, side, {
        trailingStop: ts,
        activePrice: typeof ap === 'number' ? ap : undefined,
        hedgeMode: true,
      })
      if ((res as any)?.ok) {
        setControl(key, { message: 'Ustawiono Trailing Stop' })
        await fetchRows()
      } else {
        setControl(key, { message: `Błąd: ${(res as any)?.error || 'nieznany'}` })
      }
    } catch (e: any) {
      setControl(key, { message: e?.message ?? 'Błąd ustawiania Trailing' })
    } finally {
      setControl(key, { working: false })
    }
  }

  const fetchRows = async () => {
    try {
      setLoading(true)
      const positions = await getOpenPositionsAction()
      setRows(positions || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRows()
    const timer = setInterval(fetchRows, 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <span>Otwarte Pozycje</span>
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
            <div className="text-sm text-neutral-400">Brak pozycji lub błąd pobierania.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Kontrakty</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>PnL</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p: any, idx: number) => {
                  const key = `${p.symbol}-${p.side}`
                  return (
                    <React.Fragment key={key}>
                      <TableRow>
                        <TableCell className="font-mono text-xs break-all">{p.clientOrderId || '—'}</TableCell>
                        <TableCell>{p.symbol}</TableCell>
                        <TableCell className={p.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>{p.side}</TableCell>
                        <TableCell>{p.contracts}</TableCell>
                        <TableCell>{typeof p.entryPrice === 'number' ? p.entryPrice.toFixed(2) : '—'}</TableCell>
                        <TableCell className={typeof p.unrealizedPnl === 'number' ? (p.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}>
                          {typeof p.unrealizedPnl === 'number' ? p.unrealizedPnl.toFixed(4) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="secondary" onClick={() => handleToggle(key, p)}>
                            {controls[key]?.expanded ? 'Ukryj' : 'Szczegóły'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {controls[key]?.expanded && (
                        <TableRow>
                          <TableCell colSpan={7}>
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2">
                                <Input className="w-20" type="number" min={1} max={100} value={controls[key]?.percent ?? 100} onChange={(e) => setControl(key, { percent: Number(e.target.value) })} />
                                <Button size="sm" variant="warning" disabled={controls[key]?.working} onClick={() => handleCloseMarket(p.symbol, p.side, key)}>
                                  {controls[key]?.working ? '...' : 'Zamknij Market'}
                                </Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input className="w-28" type="number" value={controls[key]?.limitPrice ?? ''} onChange={(e) => setControl(key, { limitPrice: Number(e.target.value) })} />
                                <Button size="sm" variant="secondary" disabled={controls[key]?.working} onClick={() => pickMidPrice(p.symbol, key)}>Ustaw cenę=Last</Button>
                                <Button size="sm" variant="success" disabled={controls[key]?.working} onClick={() => handleCloseLimit(p.symbol, p.side, key)}>Zamknij Limit</Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input className="w-28" placeholder="TP cena" type="number" value={controls[key]?.tpPrice ?? ''} onChange={(e) => setControl(key, { tpPrice: Number(e.target.value) })} />
                                <Input className="w-28" placeholder="SL cena" type="number" value={controls[key]?.slPrice ?? ''} onChange={(e) => setControl(key, { slPrice: Number(e.target.value) })} />
                                <Button size="sm" variant="secondary" disabled={controls[key]?.working} onClick={() => handleSetTpSl(p.symbol, p.side, key)}>Ustaw TP/SL</Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input className="w-28" placeholder="Trailing" type="number" value={controls[key]?.trailingStop ?? ''} onChange={(e) => setControl(key, { trailingStop: Number(e.target.value) })} />
                                <Input className="w-28" placeholder="Aktywna cena" type="number" value={controls[key]?.activePrice ?? ''} onChange={(e) => setControl(key, { activePrice: Number(e.target.value) })} />
                                <Button size="sm" variant="secondary" disabled={controls[key]?.working} onClick={() => handleSetTrailing(p.symbol, p.side, key)}>Ustaw Trailing</Button>
                              </div>
                              {controls[key]?.message && <div className="text-xs text-neutral-400">{controls[key]?.message}</div>}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}
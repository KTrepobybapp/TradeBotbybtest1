import { tryCreateBybitClient } from '../lib/bybit';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

export default async function PositionsTable() {
  const ex = tryCreateBybitClient();
  let positions: any[] = [];
  if (ex) {
    try {
      // Try fetch all positions
      positions = await ex.fetchPositions();
    } catch {
      positions = [];
    }
  }

  // Filter only non-zero positions
  const rows = positions.filter((p: any) => {
    const contracts = p.contracts ?? p.info?.size ?? 0;
    return Number(contracts) !== 0;
  });

  return (
    <div className="card">
      <div className="card-header">Otwarte Pozycje</div>
      <div className="card-body">
        {rows.length === 0 ? (
          <div className="text-sm text-neutral-400">Brak pozycji lub błąd pobierania.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>PnL</TableHead>
                <TableHead>Entry Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p: any, idx: number) => (
                <TableRow key={idx}>
                  <TableCell>{p.symbol ?? p.info?.symbol ?? '—'}</TableCell>
                  <TableCell>{
                    typeof p.unrealizedPnl !== 'undefined'
                      ? Number(p.unrealizedPnl).toFixed(4)
                      : p.info?.unrealisedPnl ?? '—'
                  }</TableCell>
                  <TableCell>{
                    typeof p.entryPrice !== 'undefined'
                      ? Number(p.entryPrice).toFixed(2)
                      : p.info?.avgPrice ?? '—'
                  }</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
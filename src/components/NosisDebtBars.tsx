import React from 'react';
import { formatCurrencyThousands } from '../lib/utils';
import { StatusBadge, Status } from './riskColors';

// Deuda por entidad (Nosis) como barras horizontales ordenadas: una sola serie
// (magnitud) en negro de marca. Reemplaza al donut, que compara mal valores
// parecidos. La situación BCRA ≥ 2 se marca con etiqueta de estado.

type Entidad = { entidad?: string | null; situacion?: number | null; monto?: number | null };

const situacionStatus = (s: number | null | undefined): Status | null => {
  if (s === null || s === undefined || s <= 1) return null;
  if (s === 2) return 'warning';
  if (s === 3) return 'serious';
  return 'critical';
};

export function NosisDebtBars({ entidades }: { entidades: Entidad[] }) {
  const rows = entidades
    .map(e => ({ ...e, monto: Number(e.monto) || 0 }))
    .sort((a, b) => b.monto - a.monto);
  const total = rows.reduce((a, r) => a + r.monto, 0);
  const max = rows[0]?.monto || 1;

  return (
    <div className="bg-white border border-ink/10 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h5 className="text-xs font-bold uppercase tracking-wider text-ink/70">Deuda por entidad</h5>
        <span className="text-xs text-ink/50">Total {formatCurrencyThousands(total)}</span>
      </div>
      <div className="space-y-3">
        {rows.map((r, i) => {
          const st = situacionStatus(r.situacion);
          const pct = total > 0 ? (r.monto / total) * 100 : 0;
          return (
            <div key={i} title={`${r.entidad}: ${formatCurrencyThousands(r.monto)} (${pct.toFixed(1)}%)`}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-xs font-medium text-ink truncate flex items-center gap-2">
                  {r.entidad || 'Desconocido'}
                  {st && <StatusBadge status={st} label={`Sit. ${r.situacion}`} />}
                </span>
                <span className="text-xs font-mono text-ink shrink-0">{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2.5 w-full bg-ink/[0.06] rounded-r-sm overflow-hidden">
                <div className="h-full bg-ink rounded-r-sm" style={{ width: `${(r.monto / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

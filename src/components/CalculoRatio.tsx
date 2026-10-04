import React, { createContext, useContext, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { RatioKey, RatioStatus } from '../features/ratios/calculations';
import { RatioKind } from '../features/ratios/blocks';
import { Termino, fmtNumero } from '../features/ratios/definiciones';
import { ExplicacionRatio } from '../features/ratios/explicacion';
import { RatioThreshold } from '../features/risk/policy';
import { StatusBadge, Status } from './riskColors';

// Panel de cálculo: al hacer clic en el nombre de un ratio se abre un panel
// lateral con SOLO ese ratio (fórmula, números, resultado, semáforo) y, plegado,
// de dónde sale cada dato. No agrega nada a la pantalla hasta que se pide.

const AbrirCalculo = createContext<((k: RatioKey) => void) | null>(null);
export const ProveedorCalculo = AbrirCalculo.Provider;

// Nombre de ratio clickeable (subrayado sutil al pasar el mouse). Sin proveedor, texto plano.
export function RatioLink({ ratioKey, children, className = '' }: { ratioKey: RatioKey; children: React.ReactNode; className?: string }) {
  const abrir = useContext(AbrirCalculo);
  if (!abrir) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); abrir(ratioKey); }}
      className={`text-left decoration-ink/30 underline-offset-2 hover:underline focus-visible:underline focus:outline-none ${className}`}
      title="Ver el cálculo"
    >
      {children}
    </button>
  );
}

const SEM: Record<RatioStatus, { status: Status; label: string }> = {
  healthy: { status: 'good', label: 'Sano' },
  alert: { status: 'warning', label: 'Alerta' },
  critical: { status: 'critical', label: 'Crítico' },
};

export const fmtResultado = (v: number | null, kind: RatioKind) =>
  v === null ? 'sin dato'
    : kind === 'pct' ? `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
    : kind === 'dias' ? `${Math.round(v)} días`
    : kind === 'monto' ? `$ ${Math.round(v).toLocaleString('es-AR')}`
    : `${v.toLocaleString('es-AR', { maximumFractionDigits: 2 })}x`;

const fmtUmbral = (u: RatioThreshold) => {
  const f = (v: number) => (u.unidad === '%' ? `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%` : u.unidad === 'pp' ? `${(v * 100).toLocaleString('es-AR')} p.p.` : `${v.toLocaleString('es-AR', { maximumFractionDigits: 2 })}x`);
  const sano = u.mejorSi === 'mayor' ? (u.inclusivo ? '≥' : '>') : '≤';
  const alerta = u.mejorSi === 'mayor' ? '≥' : '≤';
  return `sano ${sano} ${f(u.sano)} · alerta ${alerta} ${f(u.alerta)}`;
};

function Dato({ t, nivel = 0 }: { t: Termino; nivel?: number }) {
  return (
    <li className={nivel ? 'ml-4' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink/80">{t.signo && <span className="text-ink/40 mr-1">{t.signo}</span>}{t.label}</span>
        <span className="tabular-nums font-medium whitespace-nowrap">{fmtNumero(t.valor)}</span>
      </div>
      <p className="text-[11px] text-ink/45 leading-snug">{t.origen}{t.nota ? ` · ${t.nota}` : ''}</p>
      {t.renglones && (t.renglones.incluidos.length > 0 || t.renglones.excluidos.length > 0) && (
        <ul className="mt-1 mb-1 ml-3 text-[11px] space-y-0.5">
          {t.renglones.incluidos.map((r, k) => (
            <li key={`i${k}`} className="flex justify-between gap-3 text-ink/65"><span>+ {r.rubro}</span><span className="tabular-nums">{fmtNumero(r.monto)}</span></li>
          ))}
          {t.renglones.excluidos.map((r, k) => (
            <li key={`e${k}`} className="flex justify-between gap-3 text-ink/40 line-through decoration-ink/30" title="Renglón excluido"><span>{r.rubro}</span><span className="tabular-nums">{fmtNumero(r.monto)}</span></li>
          ))}
        </ul>
      )}
      {t.componentes && (
        <ul className="mt-1 space-y-1.5">{t.componentes.map((c, k) => <Dato key={k} t={c} nivel={nivel + 1} />)}</ul>
      )}
    </li>
  );
}

export function PanelCalculo({ explicacion, onCerrar, editadoEl }: { explicacion: ExplicacionRatio | null; onCerrar: () => void; editadoEl?: string }) {
  useEffect(() => {
    if (!explicacion) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [explicacion, onCerrar]);
  if (!explicacion) return null;
  const x = explicacion;
  const st = x.semaforo.status ? SEM[x.semaforo.status] : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden" role="dialog" aria-modal="true" aria-label={`Cálculo de ${x.nombre}`}>
      <div className="absolute inset-0 bg-ink/20" onClick={onCerrar} />
      <aside className="relative w-full max-w-[440px] h-full bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        <header className="sticky top-0 bg-white border-b border-ink/10 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">{x.nombre}</h3>
            <p className="text-xs text-ink/55 mt-0.5">{x.formula}</p>
          </div>
          <button onClick={onCerrar} className="p-1 text-ink/50 hover:text-ink" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </header>

        <div className="px-5 py-4 space-y-4">
          {/* El ticket: la cuenta de cada ejercicio */}
          {x.ejercicios.length === 0 && <p className="text-sm text-ink/55">No hay datos para calcularlo.</p>}
          {x.ejercicios.map((j, k) => (
            <div key={j.anio} className={k > 0 ? 'text-ink/55' : ''}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">{j.anio}</p>
              <p className="font-mono text-sm mt-0.5">
                {j.calculo.cuenta} = <span className={k === 0 ? 'font-semibold text-ink' : ''}>{fmtResultado(j.calculo.valor, x.kind)}</span>
              </p>
              {j.calculo.nota && <p className="text-xs text-ink/55 mt-0.5">{j.calculo.nota}</p>}
            </div>
          ))}

          {/* Semáforo */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {x.semaforo.noAplica ? (
              <span className="text-ink/60"><span className="font-semibold uppercase tracking-wider text-[10px] text-ink/50 mr-1">No aplica</span>{x.semaforo.noAplica}</span>
            ) : (
              <>
                {st && <StatusBadge status={st.status} label={st.label} />}
                {x.semaforo.umbral && <span className="text-ink/55">{fmtUmbral(x.semaforo.umbral)}</span>}
                {!x.semaforo.umbral && <span className="text-ink/45">Sin semáforo: es un dato informativo.</span>}
              </>
            )}
          </div>
          {x.semaforo.usaValorDe && (
            <p className="text-xs text-ink/55">En este rubro el semáforo se mide con: <strong className="text-ink/75">{x.semaforo.usaValorDe}</strong>.</p>
          )}

          {/* Detalle plegado */}
          {x.ejercicios[0] && x.ejercicios[0].calculo.terminos.length > 0 && (
            <details className="group border-t border-ink/10 pt-3">
              <summary className="cursor-pointer select-none text-xs font-semibold text-ink/60 hover:text-ink flex items-center gap-1 list-none">
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" /> De dónde sale cada dato ({x.ejercicios[0].anio})
              </summary>
              <ul className="mt-3 space-y-2.5 text-xs">
                {x.ejercicios[0].calculo.terminos.map((t, k) => <Dato key={k} t={t} />)}
              </ul>
              {x.supuestos.length > 0 && (
                <div className="mt-3 text-[11px] text-ink/50">
                  <p className="font-semibold mb-0.5">Supuestos</p>
                  <ul className="list-disc pl-4 space-y-0.5">{x.supuestos.map(s => <li key={s}>{s}</li>)}</ul>
                </div>
              )}
            </details>
          )}

          {editadoEl && (
            <p className="text-[11px] text-ink/55 bg-brand-blue/10 px-2 py-1.5 rounded-sm">
              Este caso tiene valores editados a mano el {new Date(editadoEl).toLocaleString('es-AR')}: los números de entrada pueden no ser los originales del balance.
            </p>
          )}
          <p className="text-[11px] text-ink/40">Montos en miles de $. Cálculo hecho por el sistema, no por la IA.</p>
        </div>
      </aside>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, RotateCcw, TrendingUp } from 'lucide-react';
import { ExtractionResult } from '../types';
import {
  CampoSupuesto,
  ESCENARIOS,
  ESCENARIO_LABEL,
  EscenarioId,
  OverridesBase,
  ProyeccionesGuardadas,
  Sugerido,
  Supuestos,
  proyeccionesVacias,
} from '../features/projections/types';
import { mesesPostCierre, resolverProyeccion, ventasPostEnMonedaCierre } from '../features/projections/defaults';
import { faltantes, margenDeudaNueva, proyectar, puntoDeQuiebre, PuntoDeQuiebre } from '../features/projections/model';
import { PROJECTION_PARAMS, RATIO_THRESHOLDS } from '../features/risk/policy';
import { parseNumberInput } from '../features/editing/editing';
import { STATUS, Status, StatusBadge } from './riskColors';
import { cn } from '../lib/utils';

// Proyección de flujo de fondos para capacidad de repago. Todo el cálculo es
// código (features/projections); acá solo se muestran y editan los supuestos.

const fmt = (v: number | null | undefined, dec = 0) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(dec));
  return (r === 0 ? 0 : r).toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: 0 }); // sin "-0"
};
const fmtPct = (v: number | null | undefined, dec = 1) => (v === null || v === undefined ? '—' : `${fmt(v * 100, dec)}%`);
const fmtX = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${fmt(v, 2)}x`);

const dscrStatus = (v: number | null): Status | null => {
  if (v === null) return null;
  const t = RATIO_THRESHOLDS.dscr;
  return v > t.sano ? 'good' : v >= t.alerta ? 'warning' : 'critical';
};
const DSCR_LABEL: Record<Status, string> = { good: 'Sano', warning: 'Alerta', serious: 'Alto', critical: 'Crítico' };

type Kind = 'pct' | 'num' | 'int' | 'bool';

// Celda editable de un supuesto: muestra el valor efectivo, marca si fue editado
// y tiene el sugerido + fuente en el subtexto/tooltip.
function SupuestoInput({ kind, value, sugerido, edited, onChange, disabled }: {
  kind: Kind;
  value: number | boolean | null;
  sugerido?: Sugerido<number | boolean>;
  edited: boolean;
  onChange: (v: number | boolean | null | undefined) => void; // undefined = volver al sugerido
  disabled?: boolean;
}) {
  const toText = (v: number | boolean | null) =>
    v === null || typeof v === 'boolean' ? '' : kind === 'pct' ? fmt(v * 100, 2) : fmt(v, kind === 'num' ? 0 : 2); // montos en miles: sin decimales
  const [text, setText] = useState(toText(value));
  useEffect(() => setText(toText(value)), [value]);
  const title = sugerido ? `Sugerido: ${sugerido.valor === null ? 'sin dato' : typeof sugerido.valor === 'boolean' ? (sugerido.valor ? 'sí' : 'no') : kind === 'pct' ? fmtPct(sugerido.valor, 2) : fmt(sugerido.valor, 2)} — ${sugerido.fuente}${sugerido.aviso ? ` (${sugerido.aviso})` : ''}` : undefined;
  const base = cn(
    'w-full rounded-sm border px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-blue',
    edited ? 'border-brand-blue/60 bg-brand-blue/5' : 'border-ink/15 bg-white',
    value === null && !disabled && 'border-amber-400 bg-amber-50'
  );
  if (kind === 'bool') {
    return (
      <select
        className={base}
        value={value === true ? 'si' : value === false ? 'no' : ''}
        onChange={e => onChange(e.target.value === 'si')}
        title={title}
        disabled={disabled}
      >
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    );
  }
  const commit = () => {
    const n = parseNumberInput(text);
    const v = n === null ? null : kind === 'pct' ? n / 100 : kind === 'int' ? Math.round(n) : n;
    if (v !== value) onChange(v);
  };
  return (
    <div className="relative" title={title}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="Completar"
        className={cn(base, kind === 'pct' && 'pr-6', disabled && 'opacity-40')}
      />
      {kind === 'pct' && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink/40">%</span>}
    </div>
  );
}

const Card = ({ n, title, subtitle, actions, children }: {
  n: number; title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode;
}) => (
  <section className="bg-white border border-ink/15">
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-ink/10">
      <div className="flex items-start gap-3">
        <span className="w-6 h-6 shrink-0 flex items-center justify-center bg-ink text-white text-[11px] font-bold">{n}</span>
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-ink/50">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </header>
    <div className="p-5">{children}</div>
  </section>
);

const ResetButton = ({ onClick, label = 'Restablecer sugeridos' }: { onClick: () => void; label?: string }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1 text-[11px] font-medium text-ink/50 hover:text-ink">
    <RotateCcw className="w-3 h-3" /> {label}
  </button>
);

const quiebreTexto = (p: PuntoDeQuiebre) => {
  if (p.tipo === 'valor') return `${p.crecimientoAnio1 > 0 ? '+' : ''}${fmt(p.crecimientoAnio1 * 100, 1)}% en el año 1`;
  if (p.tipo === 'no_se_alcanza') return 'No se alcanza (soporta caídas de más de 90%)';
  if (p.tipo === 'ya_debajo') return 'Ya está debajo de 1x';
  return 'Sin deuda';
};

// ---------- Vista ----------

export function ProyeccionesView({ result, guardadas, onChange }: {
  result: ExtractionResult;
  guardadas: ProyeccionesGuardadas | null;
  onChange: (next: ProyeccionesGuardadas) => void;
}) {
  const extraction = result.extraction!;
  const ratios = result.ratios!;
  const g = guardadas ?? proyeccionesVacias();
  const [tab, setTab] = useState<EscenarioId>('base');

  const res = useMemo(() => resolverProyeccion(extraction, ratios, g), [extraction, ratios, g]);
  const proyecciones = useMemo(() => {
    const out = {} as Record<EscenarioId, { faltan: string[]; resultado: ReturnType<typeof proyectar> | null; quiebre: PuntoDeQuiebre | null }>;
    for (const e of ESCENARIOS) {
      const s = res.supuestos[e];
      const faltan = [...res.faltaBase, ...faltantes(s)];
      if (faltan.length || !res.base) { out[e] = { faltan, resultado: null, quiebre: null }; continue; }
      out[e] = { faltan: [], resultado: proyectar(res.base, s), quiebre: puntoDeQuiebre(res.base, s) };
    }
    return out;
  }, [res]);

  const update = (mut: (d: ProyeccionesGuardadas) => void) => {
    const next: ProyeccionesGuardadas = JSON.parse(JSON.stringify(g));
    mut(next);
    next.actualizadoEn = new Date().toISOString();
    onChange(next);
  };
  const setBase = (k: keyof OverridesBase, v: number | boolean | null | undefined) =>
    update(d => { if (v === undefined) delete d.base[k]; else (d.base as Record<string, unknown>)[k] = v; });
  const setSupuesto = (e: EscenarioId, k: CampoSupuesto, v: number | boolean | null | undefined) =>
    update(d => { if (v === undefined) delete d.escenarios[e][k]; else (d.escenarios[e] as Record<string, unknown>)[k] = v; });
  const setCrecimiento = (e: EscenarioId, i: number, v: number | null | undefined) =>
    update(d => {
      const c = { ...(d.escenarios[e].crecimiento ?? {}) };
      if (v === undefined) delete c[i]; else c[i] = v;
      d.escenarios[e].crecimiento = c;
    });

  const anio = extraction.company_profile.anio_actual || 'Actual';
  const anioAnt = extraction.company_profile.anio_anterior || 'Anterior';
  const rt6 = extraction.informacion_complementaria?.balance_ajustado_por_inflacion === true;
  const inflacion = g.base.inflacionMensual ?? null;
  const ventasAct = extraction.ejercicio_actual.estado_resultados.ventas_netas;
  const ventasAnt = extraction.ejercicio_anterior?.estado_resultados.ventas_netas ?? null;
  const { meses } = mesesPostCierre(extraction);
  const post = inflacion !== null ? ventasPostEnMonedaCierre(meses, inflacion) : null;
  const anual = inflacion !== null ? Math.pow(1 + inflacion, 12) - 1 : null;
  const horizonteMax = Math.max(...ESCENARIOS.map(e => res.supuestos[e].horizonte));
  const memoria = result.companyHistory?.proyecciones ?? [];

  // Variación entre ejercicios: con RT 6 ya es real; si no, nominal y real deflactada.
  const varNominal = ventasAnt ? ventasAct / ventasAnt - 1 : null;
  const varReal = ventasAnt ? (rt6 ? varNominal : anual !== null ? ventasAct / (ventasAnt * (1 + anual)) - 1 : null) : null;
  const ltm = res.sugeridosBase.ventas.valor;
  const hayPost = meses.some(m => m.anterior !== null && m.anterior > 0);
  const maxMes = Math.max(1, ...meses.map(m => Math.max(m.monto, m.anterior ?? 0)));

  const filasSupuestos: Array<{ campo: CampoSupuesto; label: string; kind: Kind }> = [
    { campo: 'margenEbitda', label: 'Margen EBITDA', kind: 'pct' },
    { campo: 'capexPct', label: 'Capex de mantenimiento (% ventas)', kind: 'pct' },
    { campo: 'capitalTrabajoPct', label: 'Capital de trabajo (% ventas)', kind: 'pct' },
    { campo: 'liberarCapitalTrabajo', label: 'Computar liberación de capital de trabajo', kind: 'bool' },
    { campo: 'tasaReal', label: 'Tasa real de la deuda', kind: 'pct' },
    { campo: 'alicuota', label: 'Alícuota de impuesto a las ganancias', kind: 'pct' },
    { campo: 'aniosAmortizacionNoCorriente', label: 'Años para amortizar deuda no corriente', kind: 'int' },
    { campo: 'aniosAmortizacionPostBalance', label: 'Años para amortizar deuda post balance', kind: 'int' },
  ];

  const sel = proyecciones[tab];
  const avisos = [...res.sugeridosBase.avisos];

  return (
    <div className="@container space-y-6 font-sans">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Proyección de capacidad de repago</h2>
          <p className="text-xs text-ink/50 max-w-3xl">
            Cálculo determinístico en código, sin IA. Miles de $ en moneda constante del cierre del balance. Los supuestos editados se guardan en el caso y no modifican la extracción.
          </p>
        </div>
        <ResetButton label="Restablecer todo" onClick={() => onChange({ ...proyeccionesVacias(), actualizadoEn: new Date().toISOString() })} />
      </div>

      {(avisos.length > 0 || res.faltaBase.length > 0) && (
        <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-ink space-y-1">
          {res.faltaBase.length > 0 && (
            <p className="flex items-start gap-2 font-medium"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" /> Para proyectar falta: {res.faltaBase.join(', ')}.</p>
          )}
          {avisos.map(a => <p key={a} className="flex items-start gap-2 text-ink/80"><Info className="w-4 h-4 mt-0.5 shrink-0 text-ink/40" /> {a}</p>)}
        </div>
      )}

      {/* 1. Evolución histórica */}
      <Card n={1} title="Evolución histórica de ventas" subtitle={rt6 ? 'Balance en moneda homogénea (RT 6): la variación entre ejercicios ya es real.' : 'Balance nominal: la variación real se calcula con la inflación del año base.'}>
        <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink/50">
                <th className="text-left font-semibold py-2">Período</th>
                <th className="text-right font-semibold py-2">Ventas</th>
                <th className="text-right font-semibold py-2">Var. nominal</th>
                <th className="text-right font-semibold py-2">Var. real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              <tr><td className="!text-left py-2">Ejercicio {anioAnt}</td><td className="py-2 tabular-nums">{fmt(ventasAnt)}</td><td className="py-2">—</td><td className="py-2">—</td></tr>
              <tr>
                <td className="!text-left py-2">Ejercicio {anio}</td>
                <td className="py-2 tabular-nums font-semibold">{fmt(ventasAct)}</td>
                <td className="py-2 tabular-nums">{rt6 ? <span className="text-ink/40" title="Con RT 6 el comparativo está reexpresado: no hay variación nominal">n/a</span> : fmtPct(varNominal)}</td>
                <td className="py-2 tabular-nums">{fmtPct(varReal)}</td>
              </tr>
              {hayPost && (
                <tr>
                  <td className="!text-left py-2">Últimos 12 meses <span className="text-[11px] text-ink/45">(moneda de cierre)</span></td>
                  <td className="py-2 tabular-nums font-semibold">{fmt(ltm)}</td>
                  <td className="py-2">—</td>
                  <td className="py-2 tabular-nums">{ltm !== null ? fmtPct(ltm / ventasAct - 1) : '—'}</td>
                </tr>
              )}
            </tbody>
          </table>

          {hayPost ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">Ventas post cierre vs. mismo mes del año anterior (nominal)</p>
                <div className="flex items-center gap-3 text-[11px] text-ink/60">
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-ink" /> Post cierre</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-ink/25" /> Año anterior</span>
                </div>
              </div>
              <div className="flex items-end gap-2 h-36 border-b border-ink/15">
                {meses.map(m => (
                  <div key={m.k} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${m.mes}: ${fmt(m.monto)} vs ${fmt(m.anterior)}`}>
                    <div className="w-full flex items-end justify-center gap-[2px] h-32">
                      <div className="w-1/2 max-w-4 bg-ink rounded-t-sm" style={{ height: `${(m.monto / maxMes) * 100}%` }} />
                      <div className="w-1/2 max-w-4 bg-ink/25 rounded-t-sm" style={{ height: `${((m.anterior ?? 0) / maxMes) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                {meses.map(m => <span key={m.k} className="flex-1 text-center text-[10px] text-ink/50 truncate">{m.mes.slice(0, 3)}</span>)}
              </div>
              {post && <p className="text-[11px] text-ink/50 mt-2">En moneda de cierre: {fmt(post.actual)} vs {fmt(post.anterior)} ({fmtPct(post.actual / post.anterior - 1)} real).</p>}
            </div>
          ) : (
            <p className="text-sm text-ink/50 italic self-center">No hay ventas post cierre con comparativo del año anterior.</p>
          )}
        </div>
      </Card>

      {/* 2. Año base */}
      <Card n={2} title="Año base" subtitle="Valores de partida de la proyección. Cada uno muestra de dónde sale; si lo editás queda marcado."
        actions={<ResetButton onClick={() => update(d => { d.base = { inflacionMensual: d.base.inflacionMensual }; })} />}>
        <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-8 gap-y-4">
          {([
            { k: 'inflacionMensual' as const, label: 'Inflación mensual promedio', kind: 'pct' as Kind, value: inflacion, sugerido: { valor: null, fuente: 'La carga el analista: no hay un dato confiable para sugerir', aviso: res.sugeridosBase.inflacionRequerida ? 'Necesaria para este caso' : 'No hace falta en este caso' }, edited: inflacion !== null },
            { k: 'ventas' as const, label: 'Ventas base', kind: 'num' as Kind, value: res.base?.ventas ?? (g.base.ventas ?? res.sugeridosBase.ventas.valor), sugerido: res.sugeridosBase.ventas, edited: 'ventas' in g.base },
            { k: 'deudaCorriente' as const, label: 'Deuda bancaria corriente', kind: 'num' as Kind, value: g.base.deudaCorriente ?? res.sugeridosBase.deudaCorriente.valor, sugerido: res.sugeridosBase.deudaCorriente, edited: 'deudaCorriente' in g.base },
            { k: 'deudaNoCorriente' as const, label: 'Deuda bancaria no corriente', kind: 'num' as Kind, value: g.base.deudaNoCorriente ?? res.sugeridosBase.deudaNoCorriente.valor, sugerido: res.sugeridosBase.deudaNoCorriente, edited: 'deudaNoCorriente' in g.base },
            { k: 'deudaPostBalance' as const, label: 'Deuda bancaria post balance', kind: 'num' as Kind, value: g.base.deudaPostBalance ?? res.sugeridosBase.deudaPostBalance.valor, sugerido: res.sugeridosBase.deudaPostBalance, edited: 'deudaPostBalance' in g.base },
          ]).map(row => (
            <div key={row.k} className="grid grid-cols-[1fr_150px] gap-3 items-start">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  {row.label}
                  {row.edited && row.k !== 'inflacionMensual' && <span className="text-[10px] font-semibold uppercase text-brand-blue">editado</span>}
                </p>
                <p className="text-[11px] text-ink/50 leading-snug">{row.sugerido.fuente}</p>
                {row.sugerido.aviso && <p className="text-[11px] text-amber-700 leading-snug">{row.sugerido.aviso}</p>}
              </div>
              <div className="flex items-center gap-1">
                <SupuestoInput
                  kind={row.kind}
                  value={row.value}
                  sugerido={row.sugerido}
                  edited={row.edited}
                  disabled={row.k === 'deudaPostBalance' && !res.incluirDeudaPostBalance}
                  onChange={v => setBase(row.k, v as number | null)}
                />
                {row.edited && row.k !== 'inflacionMensual' && (
                  <button onClick={() => setBase(row.k, undefined)} title="Volver al sugerido" className="p-1 text-ink/40 hover:text-ink"><RotateCcw className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={res.incluirDeudaPostBalance}
              onChange={e => setBase('incluirDeudaPostBalance', e.target.checked)}
              className="accent-ink"
            />
            Incluir la deuda tomada después del cierre
          </label>
        </div>
      </Card>

      {/* 3. Supuestos */}
      <Card n={3} title="Supuestos por escenario" subtitle="Pasá el mouse por una celda para ver el valor sugerido y su fuente. Las celdas editadas quedan en azul; las vacías en ámbar.">
        <div className="grid grid-cols-1 @5xl:grid-cols-[minmax(0,1fr)_260px] gap-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-ink/50">
                  <th className="text-left font-semibold py-2 pr-3 min-w-[220px]">Supuesto</th>
                  {ESCENARIOS.map(e => (
                    <th key={e} className="text-right font-semibold py-2 px-1 w-[118px]">
                      <span className="block">{ESCENARIO_LABEL[e]}</span>
                      <span className="block normal-case tracking-normal font-normal">
                        <ResetButton label="Restablecer" onClick={() => update(d => { d.escenarios[e] = {}; })} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                <tr>
                  <td className="!text-left py-1.5 pr-3">Horizonte (años, 1–5)</td>
                  {ESCENARIOS.map(e => (
                    <td key={e} className="py-1.5 px-1">
                      <SupuestoInput kind="int" value={res.supuestos[e].horizonte} sugerido={res.sugeridos[e].horizonte} edited={'horizonte' in g.escenarios[e]}
                        onChange={v => setSupuesto(e, 'horizonte', v === null || v === undefined ? undefined : Math.max(1, Math.min(5, v as number)))} />
                    </td>
                  ))}
                </tr>
                {Array.from({ length: horizonteMax }, (_, i) => (
                  <tr key={`g${i}`}>
                    <td className="!text-left py-1.5 pr-3">Crecimiento real de ventas · año {i + 1}</td>
                    {ESCENARIOS.map(e => (
                      <td key={e} className="py-1.5 px-1">
                        {i < res.supuestos[e].horizonte ? (
                          <SupuestoInput kind="pct" value={res.supuestos[e].crecimiento[i]} sugerido={res.sugeridos[e].crecimiento[i]}
                            edited={!!g.escenarios[e].crecimiento && i in g.escenarios[e].crecimiento!}
                            onChange={v => setCrecimiento(e, i, v as number | null | undefined)} />
                        ) : <span className="block text-right text-ink/25">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {filasSupuestos.map(f => (
                  <tr key={f.campo}>
                    <td className="!text-left py-1.5 pr-3">{f.label}</td>
                    {ESCENARIOS.map(e => (
                      <td key={e} className="py-1.5 px-1">
                        <SupuestoInput kind={f.kind} value={res.supuestos[e][f.campo] as number | boolean | null} sugerido={res.sugeridos[e][f.campo]}
                          edited={f.campo in g.escenarios[e]} onChange={v => setSupuesto(e, f.campo, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="border-l-2 border-brand-blue/40 pl-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">Lo que proyecta el Directorio (Memoria)</p>
            {memoria.length ? (
              <ul className="space-y-2">
                {memoria.map((p, i) => <li key={i} className="text-xs text-body leading-snug">{p}</li>)}
              </ul>
            ) : (
              <p className="text-xs text-ink/50 italic">La Memoria no informa proyecciones (o el caso no tiene historia y actividad).</p>
            )}
            <p className="text-[11px] text-ink/40 mt-3">Solo como referencia para cargar el escenario Directorio: no se lee en forma automática.</p>
          </aside>
        </div>
      </Card>

      {/* 4. Proyección */}
      <Card n={4} title="Proyección" subtitle="Flujo disponible para el servicio de deuda (CFADS) y DSCR por año."
        actions={
          <div className="inline-flex rounded-full border border-ink/15 p-0.5">
            {ESCENARIOS.map(e => (
              <button key={e} onClick={() => setTab(e)} className={cn('px-3 py-1 rounded-full text-xs font-semibold', tab === e ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink')}>
                {ESCENARIO_LABEL[e]}
              </button>
            ))}
          </div>
        }>
        {sel.resultado ? (
          <div className="overflow-x-auto">
            <TablaProyeccion resultado={sel.resultado} ventasBase={res.base!.ventas} />
          </div>
        ) : (
          <p className="text-sm text-amber-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Falta completar: {sel.faltan.join(', ')}.</p>
        )}
      </Card>

      {/* 5. Comparativo */}
      <Card n={5} title="Comparativo de escenarios" subtitle={`DSCR por año (sano > ${fmt(RATIO_THRESHOLDS.dscr.sano, 2)}x, alerta ≥ ${fmt(RATIO_THRESHOLDS.dscr.alerta, 2)}x).`}>
        <div className="overflow-x-auto mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink/50">
                <th className="text-left font-semibold py-2">Escenario</th>
                {Array.from({ length: horizonteMax }, (_, i) => <th key={i} className="text-right font-semibold py-2">Año {i + 1}</th>)}
                <th className="text-right font-semibold py-2">DSCR mínimo</th>
                <th className="text-right font-semibold py-2">Punto de quiebre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {ESCENARIOS.map(e => {
                const p = proyecciones[e];
                return (
                  <tr key={e}>
                    <td className="!text-left py-2.5 font-medium">{ESCENARIO_LABEL[e]}</td>
                    {Array.from({ length: horizonteMax }, (_, i) => {
                      const f = p.resultado?.filas[i];
                      const st = f ? dscrStatus(f.dscr) : null;
                      return (
                        <td key={i} className="py-2.5 tabular-nums" style={st ? { boxShadow: `inset 0 -3px 0 ${STATUS[st]}` } : undefined}>
                          {f ? (f.dscr === null ? 'sin deuda' : fmtX(f.dscr)) : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2.5">
                      {p.resultado?.dscrMinimo ? (
                        <span className="inline-flex items-center gap-2 justify-end">
                          <span className="tabular-nums font-semibold">{fmtX(p.resultado.dscrMinimo.valor)}</span>
                          <span className="text-[11px] text-ink/50">año {p.resultado.dscrMinimo.anio}</span>
                          {dscrStatus(p.resultado.dscrMinimo.valor) && <StatusBadge status={dscrStatus(p.resultado.dscrMinimo.valor)!} label={DSCR_LABEL[dscrStatus(p.resultado.dscrMinimo.valor)!]} />}
                        </span>
                      ) : p.resultado ? 'sin deuda' : <span className="text-ink/30">incompleto</span>}
                    </td>
                    <td className="py-2.5 text-xs">{p.quiebre ? quiebreTexto(p.quiebre) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
          <div className="border border-ink/10 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Margen para deuda nueva (Estrés)</p>
            {proyecciones.estres.resultado ? (() => {
              const m = margenDeudaNueva(proyecciones.estres.resultado, PROJECTION_PARAMS.dscrObjetivoDeudaNueva);
              return m > 0
                ? <p className="text-lg font-semibold tabular-nums">{fmt(m)} <span className="text-xs font-normal text-ink/50">miles $ por año de servicio adicional</span></p>
                : <p className="text-lg font-semibold">Sin margen</p>;
            })() : <p className="text-sm text-ink/40">Incompleto</p>}
            <p className="text-[11px] text-ink/50 mt-1">Cuota anual extra que soporta el flujo manteniendo DSCR ≥ {fmt(PROJECTION_PARAMS.dscrObjetivoDeudaNueva, 2)}x todos los años.</p>
          </div>
          <div className="border border-ink/10 p-4 text-[11px] text-ink/60 space-y-1">
            <p><strong className="text-ink">Punto de quiebre:</strong> caída real de ventas en el año 1 que lleva el DSCR mínimo a 1,0x, con el resto de los supuestos del escenario. Se calcula sin liberación de capital de trabajo, porque una caída de ventas libera caja y distorsiona el resultado.</p>
            <p><strong className="text-ink">Impuestos:</strong> se usa el capex de mantenimiento como proxy de la depreciación.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TablaProyeccion({ resultado, ventasBase }: { resultado: ReturnType<typeof proyectar>; ventasBase: number }) {
  const f = resultado.filas;
  const rows: Array<{ label: string; get: (i: number) => React.ReactNode; strong?: boolean; sep?: boolean; base?: React.ReactNode }> = [
    { label: 'Ventas', get: i => fmt(f[i].ventas), base: fmt(ventasBase) },
    { label: 'EBITDA', get: i => fmt(f[i].ebitda) },
    { label: '− Impuestos', get: i => fmt(-f[i].impuestos) },
    { label: '− Capex de mantenimiento', get: i => fmt(-f[i].capex) },
    { label: '− Δ Capital de trabajo', get: i => fmt(-f[i].deltaCapitalTrabajo) },
    { label: 'Flujo para deuda (CFADS)', get: i => fmt(f[i].cfads), strong: true, sep: true },
    { label: 'Intereses', get: i => fmt(f[i].intereses) },
    { label: 'Amortización', get: i => fmt(f[i].amortizacion) },
    { label: 'Servicio de deuda', get: i => fmt(f[i].servicio), strong: true },
    {
      label: 'DSCR', strong: true, sep: true, get: i => {
        const st = dscrStatus(f[i].dscr);
        return f[i].dscr === null ? 'sin deuda' : (
          <span className="inline-flex items-center gap-2 justify-end">{fmtX(f[i].dscr)}{st && <StatusBadge status={st} label={DSCR_LABEL[st]} />}</span>
        );
      },
    },
    { label: 'Deuda / EBITDA (fin de año)', get: i => fmtX(f[i].deudaEbitda) },
    { label: 'Saldo de deuda (fin de año)', get: i => fmt(f[i].saldoFin) },
    { label: 'Caja acumulada', get: i => fmt(f[i].cajaAcumulada) },
  ];
  return (
    <table className="w-full text-sm min-w-[560px]">
      <thead>
        <tr className="text-[11px] uppercase tracking-wider text-ink/50">
          <th className="text-left font-semibold py-2 min-w-[200px]">Miles de $</th>
          <th className="text-right font-semibold py-2">Año base</th>
          {f.map(r => <th key={r.anio} className="text-right font-semibold py-2">Año {r.anio}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className={cn(r.sep && 'border-t border-ink/15', r.strong && 'font-semibold')}>
            <td className="!text-left py-1.5">{r.label}</td>
            <td className="py-1.5 tabular-nums text-ink/50">{r.base ?? ''}</td>
            {f.map((_, i) => <td key={i} className="py-1.5 pl-3 tabular-nums whitespace-nowrap">{r.get(i)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

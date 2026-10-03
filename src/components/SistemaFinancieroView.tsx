import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus, Scale, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RawExtraction } from '../features/extraction/schemas';
import { CrossCheckResult } from '../features/ratios/crossCheck';
import { AddRowButton, EditableBoolean, EditableNumber, EditableText, RemoveRowButton, useEdit } from '../features/editing/editing';
import {
  etiquetaPeriodo, mesesDeSerie, PuntoTotal, serieTotal, seriePorEntidad, SerieEntidad, Variacion, variacion, variacionTotalPeriodo,
} from '../features/nosis/evolucion';
import { formatCurrencyThousands } from '../lib/utils';
import { STATUS, Status, StatusBadge } from './riskColors';

// Pestaña "Sistema financiero (Nosis)": foto actual (situación, score, cheques,
// antecedentes), evolución mensual de la deuda, detalle por entidad con su
// tendencia y el cruce con el balance. Todo editable en modo edición.

type Nosis = NonNullable<RawExtraction['extraccion_nosis']>;

const SITUACION_LABEL: Record<number, string> = {
  1: 'Normal',
  2: 'Riesgo bajo',
  3: 'Riesgo medio',
  4: 'Riesgo alto',
  5: 'Irrecuperable',
  6: 'Irrec. técnica',
};

// La escala del BCRA va de 1 a 6; cualquier otro valor es un error de lectura.
const situacionValida = (s: number | null | undefined): s is number =>
  s !== null && s !== undefined && Number.isInteger(s) && s >= 1 && s <= 6;

export const situacionStatus = (s: number | null | undefined): Status | null => {
  if (!situacionValida(s)) return null;
  if (s <= 1) return 'good';
  if (s === 2) return 'warning';
  if (s === 3) return 'serious';
  return 'critical';
};

const SituacionBadge = ({ s }: { s: number | null | undefined }) => {
  if (s === null || s === undefined) return <span className="text-ink/30">—</span>;
  const st = situacionStatus(s);
  if (!st) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold text-ink/70 border border-dashed border-ink/30 whitespace-nowrap" title="La escala del BCRA va de 1 a 6: revisar el dato en el informe">
        {s} · fuera de escala, revisar
      </span>
    );
  }
  return <StatusBadge status={st} label={`${s} · ${SITUACION_LABEL[s] ?? 'Situación'}`} />;
};

const fmt = (v: number, dec = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const compacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// ---------- piezas chicas ----------

const Card = ({ title, subtitle, icon, children, className = '', right }: {
  title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; right?: React.ReactNode;
}) => (
  <section className={`bg-white border border-ink/15 ${className}`}>
    <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink/10">
      <div>
        <h3 className="font-display text-base font-semibold flex items-center gap-2">{icon}{title}</h3>
        {subtitle && <p className="text-[11px] text-ink/50 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </header>
    {children}
  </section>
);

const Kpi = ({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="bg-white border border-ink/15 px-5 py-4 flex flex-col gap-1.5 min-w-0">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">{label}</p>
    <div className="text-xl font-semibold tabular-nums text-ink">{children}</div>
    {sub && <div className="text-xs text-ink/55">{sub}</div>}
  </div>
);

// Variación neutra: crecer o bajar la deuda no es bueno ni malo por sí solo.
const VariacionChip = ({ label, v }: { label: string; v: Variacion | null }) => {
  if (!v) return null;
  const Icon = v.abs > 0 ? ArrowUpRight : v.abs < 0 ? ArrowDownRight : Minus;
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-panel border border-ink/10 min-w-[120px]">
      <span className="text-[10px] uppercase tracking-wider text-ink/45">{label}</span>
      <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-ink">
        <Icon className="w-3.5 h-3.5" />
        {v.pct !== null ? `${v.pct > 0 ? '+' : ''}${fmt(v.pct * 100, 1)}%` : 'n/c'}
      </span>
      <span className="text-[10px] tabular-nums text-ink/45">
        {v.abs > 0 ? '+' : ''}{fmt(v.abs)} · {etiquetaPeriodo(v.desde)} → {etiquetaPeriodo(v.hasta)}
      </span>
    </div>
  );
};

const Sparkline = ({ puntos }: { puntos: Array<{ monto: number; situacion: number | null }> }) => {
  if (puntos.length < 2) return <span className="text-ink/30">—</span>;
  const w = 104, h = 28, pad = 3;
  const max = Math.max(...puntos.map(p => p.monto), 1);
  const x = (i: number) => pad + (i / (puntos.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const d = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.monto).toFixed(1)}`).join(' ');
  const ultimo = puntos[puntos.length - 1];
  return (
    <svg width={w} height={h} className="block" aria-hidden="true">
      <path d={`${d} L${x(puntos.length - 1)},${h - pad} L${x(0)},${h - pad} Z`} fill="rgb(0 0 0 / 0.05)" />
      <path d={d} fill="none" stroke="rgb(0 0 0 / 0.7)" strokeWidth="1.5" strokeLinejoin="round" />
      {puntos.map((p, i) => {
        const st = situacionStatus(p.situacion);
        return st && st !== 'good' ? <circle key={i} cx={x(i)} cy={y(p.monto)} r="2.5" fill={STATUS[st]} /> : null;
      })}
      <circle cx={x(puntos.length - 1)} cy={y(ultimo.monto)} r="2.5" fill="#000" />
    </svg>
  );
};

// ---------- gráfico de evolución ----------

const PuntoSituacion = (props: { cx?: number; cy?: number; payload?: PuntoTotal }) => {
  const { cx, cy, payload } = props;
  const st = situacionStatus(payload?.peorSituacion);
  if (cx === undefined || cy === undefined || !st || st === 'good') return <g />;
  return <circle cx={cx} cy={cy} r={5} fill={STATUS[st]} stroke="#fff" strokeWidth={2} />;
};

const TooltipEvolucion = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: PuntoTotal }> }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white border border-ink/15 shadow-lg rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-ink">{etiquetaPeriodo(p.periodo)}</p>
      <p className="tabular-nums text-ink">{formatCurrencyThousands(p.total)} <span className="text-ink/45">miles</span></p>
      <p className="text-ink/55">{p.entidades} {p.entidades === 1 ? 'entidad' : 'entidades'}</p>
      {p.peorSituacion !== null && <SituacionBadge s={p.peorSituacion} />}
    </div>
  );
};

function GraficoEvolucion({ serie }: { serie: PuntoTotal[] }) {
  const conAlerta = serie.some(p => (p.peorSituacion ?? 1) >= 2);
  return (
    <div>
      <div className="h-64 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="nosis-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#000" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#000" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgb(0 0 0 / 0.06)" />
            <XAxis
              dataKey="periodo"
              tickFormatter={etiquetaPeriodo}
              tick={{ fontSize: 11, fill: 'rgb(0 0 0 / 0.5)' }}
              axisLine={{ stroke: 'rgb(0 0 0 / 0.15)' }}
              tickLine={false}
              minTickGap={18}
            />
            <YAxis
              tickFormatter={v => compacto.format(v)}
              tick={{ fontSize: 11, fill: 'rgb(0 0 0 / 0.5)' }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<TooltipEvolucion />} cursor={{ stroke: 'rgb(0 0 0 / 0.25)', strokeDasharray: '3 3' }} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#000"
              strokeWidth={2}
              fill="url(#nosis-area)"
              dot={<PuntoSituacion />}
              activeDot={{ r: 4, fill: '#000', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {conAlerta && (
        <p className="mt-2 text-[11px] text-ink/55 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Puntos de color: meses con situación 2 o peor en alguna entidad.</span>
          {(['warning', 'serious', 'critical'] as const).map(st => (
            <span key={st} className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS[st] }} />
              {st === 'warning' ? '2' : st === 'serious' ? '3' : '4 a 6'}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// ---------- tabla de datos de la evolución (vista accesible + edición) ----------

function DatosEvolucion({ filas }: { filas: NonNullable<Nosis['evolucion_deuda']> }) {
  const { editing } = useEdit();
  const [abierto, setAbierto] = useState(false);
  const base = ['extraccion_nosis', 'evolucion_deuda'];
  const visible = abierto || editing;
  return (
    <div className="border-t border-ink/10">
      {!editing && (
        <button
          type="button"
          onClick={() => setAbierto(a => !a)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-ink/60 hover:text-ink"
        >
          Ver datos del gráfico ({filas.length} filas)
          <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
      )}
      {visible && (
        <div className="px-5 pb-4 pt-2 max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[10px] uppercase tracking-wider text-ink/45">
                <th className="text-left font-semibold py-1.5">Mes</th>
                <th className="text-left font-semibold py-1.5">Entidad</th>
                <th className="text-right font-semibold py-1.5">Situación</th>
                <th className="text-right font-semibold py-1.5">Monto (miles $)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {filas.map((f, i) => (
                <tr key={i}>
                  <td className="!text-left py-1.5 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <RemoveRowButton path={base} list={filas} index={i} />
                      <EditableText path={[...base, i, 'periodo']} value={f.periodo} />
                    </span>
                  </td>
                  <td className="!text-left py-1.5"><EditableText path={[...base, i, 'entidad']} value={f.entidad} /></td>
                  <td className="py-1.5"><EditableNumber path={[...base, i, 'situacion']} value={f.situacion} inputClassName="w-12 text-center" /></td>
                  <td className="py-1.5"><EditableNumber path={[...base, i, 'monto']} value={f.monto} display={f.monto === null ? '—' : fmt(f.monto)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <AddRowButton path={base} list={filas} newItem={{ periodo: '', entidad: '', monto: 0, situacion: 1 }} label="Agregar mes" />
        </div>
      )}
    </div>
  );
}

// ---------- vista ----------

export function SistemaFinancieroView({ nosis, crossCheck }: { nosis: Nosis; crossCheck: CrossCheckResult | null }) {
  const { editing } = useEdit();
  const evol = nosis.evolucion_deuda ?? [];
  const serie = useMemo(() => serieTotal(evol), [evol]);
  const porEntidad = useMemo(() => seriePorEntidad(evol), [evol]);
  const tendencias = useMemo(() => new Map<string, SerieEntidad>(porEntidad.map(s => [norm(s.entidad), s])), [porEntidad]);

  const entidades = Array.isArray(nosis.detalle_entidades) ? nosis.detalle_entidades : [];
  const totalSuma = entidades.reduce((a, e) => a + (Number(e?.monto) || 0), 0);
  const totalRef = (nosis.deuda_financiera_total_nosis ?? 0) > 0 ? (nosis.deuda_financiera_total_nosis as number) : totalSuma;
  const filasEntidades = entidades
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (Number(b.e.monto) || 0) - (Number(a.e.monto) || 0));
  // Entidades que tuvieron deuda en el período y hoy no figuran (canceladas).
  const actuales = new Set(entidades.map(e => norm(e.entidad)));
  const canceladas = porEntidad.filter(s => !actuales.has(norm(s.entidad)) && s.ultimo === 0 && s.puntos.some(p => p.monto > 0));

  const v12 = variacion(serie, 12);
  const v6 = variacion(serie, 6);
  const vTotal = variacionTotalPeriodo(serie);
  const cheques = nosis.cheques_rechazados_cantidad ?? 0;
  const path = (campo: string) => ['extraccion_nosis', campo];

  const antecedentes: Array<{ label: string; campo: keyof Nosis; valor: number | null | undefined; status: Status; monto?: boolean }> = [
    { label: 'Deuda fiscal / previsional (ARCA)', campo: 'deuda_fiscal_previsional', valor: nosis.deuda_fiscal_previsional, status: 'serious', monto: true },
    { label: 'Juicios', campo: 'juicios_cantidad', valor: nosis.juicios_cantidad, status: 'serious' },
    { label: 'Embargos', campo: 'embargos_cantidad', valor: nosis.embargos_cantidad, status: 'serious' },
    { label: 'Pedidos de quiebra', campo: 'pedidos_quiebra_cantidad', valor: nosis.pedidos_quiebra_cantidad, status: 'critical' },
  ];

  return (
    <div className="@container space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Foto actual */}
      <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5 gap-3">
        <Kpi
          label="Deuda en el sistema"
          sub={<>{entidades.length} {entidades.length === 1 ? 'entidad' : 'entidades'} · miles de $</>}
        >
          <EditableNumber path={path('deuda_financiera_total_nosis')} value={nosis.deuda_financiera_total_nosis} display={formatCurrencyThousands(nosis.deuda_financiera_total_nosis)} />
        </Kpi>
        <Kpi label="Situación BCRA hoy" sub={editing ? undefined : 'Peor situación entre las entidades'}>
          {editing
            ? <EditableNumber path={path('situacion_bcra_peor_estado')} value={nosis.situacion_bcra_peor_estado} inputClassName="w-16" />
            : <SituacionBadge s={nosis.situacion_bcra_peor_estado} />}
        </Kpi>
        <Kpi label="Peor situación 24 meses" sub={editing ? undefined : 'En cualquier entidad'}>
          {editing
            ? <EditableNumber path={path('peor_situacion_24_meses')} value={nosis.peor_situacion_24_meses} inputClassName="w-16" />
            : <SituacionBadge s={nosis.peor_situacion_24_meses} />}
        </Kpi>
        <Kpi label="Score Nosis">
          <EditableNumber path={path('score_crediticio')} value={nosis.score_crediticio} display={nosis.score_crediticio ?? '—'} inputClassName="w-20" />
        </Kpi>
        <Kpi
          label="Cheques rechazados"
          sub={
            <span className="inline-flex flex-wrap items-center gap-x-1">
              <EditableNumber path={path('cheques_rechazados_monto')} value={nosis.cheques_rechazados_monto} display={formatCurrencyThousands(nosis.cheques_rechazados_monto)} />
              <span>·</span>
              <EditableNumber path={path('cheques_rechazados_levantados')} value={nosis.cheques_rechazados_levantados} display={nosis.cheques_rechazados_levantados ?? '—'} inputClassName="w-14" />
              <span>levantados</span>
            </span>
          }
        >
          <span className="inline-flex items-center gap-2">
            <EditableNumber path={path('cheques_rechazados_cantidad')} value={nosis.cheques_rechazados_cantidad} inputClassName="w-16" />
            {!editing && cheques > 0 && <StatusBadge status="serious" label="Con rechazos" />}
          </span>
        </Kpi>
      </div>

      {/* Evolución */}
      <Card
        title="Evolución de la deuda en el sistema financiero"
        subtitle="Central de Deudores (Nosis) · miles de $ corrientes de cada mes, sin ajustar por inflación"
        icon={<TrendingUp className="w-4 h-4" />}
        right={serie.length > 0 ? <span className="text-[11px] text-ink/45 whitespace-nowrap">{mesesDeSerie(serie)} meses</span> : undefined}
      >
        {serie.length >= 2 ? (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              <VariacionChip label="Últimos 6 meses" v={v6} />
              <VariacionChip label="Últimos 12 meses" v={v12} />
              <VariacionChip label="Todo el período" v={vTotal} />
            </div>
            <GraficoEvolucion serie={serie} />
            <p className="text-[11px] text-ink/45">
              Los montos son nominales: con inflación alta, una suba en pesos puede ser una baja en términos reales.
            </p>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-ink/50">
            {serie.length === 1
              ? 'El informe trae un solo mes de historia: no alcanza para ver una evolución.'
              : 'Este caso no tiene la evolución mensual de la deuda. Puede que el informe Nosis no la traiga o que el caso se haya analizado antes de que se extrajera: para verla, volvé a analizar los documentos.'}
          </p>
        )}
        {(evol.length > 0 || editing) && <DatosEvolucion filas={evol} />}
      </Card>

      {/* Detalle por entidad */}
      <Card
        title="Deuda por entidad"
        subtitle={`Situación y monto a la fecha del informe${porEntidad.length ? ' · tendencia de los últimos meses' : ''}`}
        right={<span className="text-xs text-ink/50 whitespace-nowrap">Total {formatCurrencyThousands(totalRef)}</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink/50">
                <th className="text-left font-semibold px-5 py-2.5">Entidad</th>
                <th className="text-left font-semibold px-3 py-2.5">Situación</th>
                <th className="text-right font-semibold px-3 py-2.5">Monto</th>
                <th className="text-left font-semibold px-3 py-2.5 w-[22%]">Participación</th>
                {porEntidad.length > 0 && <th className="text-left font-semibold px-3 py-2.5">Tendencia</th>}
                {porEntidad.length > 0 && <th className="text-right font-semibold px-5 py-2.5">Var. 12 m</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {filasEntidades.map(({ e, i }) => {
                const monto = Number(e.monto) || 0;
                const part = totalRef > 0 ? (monto / totalRef) * 100 : 0;
                const t = tendencias.get(norm(e.entidad));
                const v = t ? variacion(t.puntos.map(p => ({ periodo: p.periodo, total: p.monto })), 12) : null;
                return (
                  <tr key={i} className="hover:bg-ink/[0.02]">
                    <td className="!text-left px-5 py-2.5 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <RemoveRowButton path={['extraccion_nosis', 'detalle_entidades']} list={entidades} index={i} />
                        <EditableText path={['extraccion_nosis', 'detalle_entidades', i, 'entidad']} value={e.entidad} />
                      </span>
                    </td>
                    <td className="!text-left px-3 py-2.5">
                      {editing
                        ? <EditableNumber path={['extraccion_nosis', 'detalle_entidades', i, 'situacion']} value={e.situacion} inputClassName="w-14 text-center" />
                        : <SituacionBadge s={e.situacion} />}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      <EditableNumber path={['extraccion_nosis', 'detalle_entidades', i, 'monto']} value={e.monto} display={formatCurrencyThousands(e.monto)} />
                    </td>
                    <td className="!text-left px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-ink/[0.07] overflow-hidden">
                          <div className="h-full bg-ink rounded-full" style={{ width: `${Math.min(100, part)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-ink/60 w-12 text-right">{fmt(part, 1)}%</span>
                      </div>
                    </td>
                    {porEntidad.length > 0 && (
                      <td className="!text-left px-3 py-1.5">{t ? <Sparkline puntos={t.puntos} /> : <span className="text-ink/30 text-xs">sin historia</span>}</td>
                    )}
                    {porEntidad.length > 0 && (
                      <td className="px-5 py-2.5 tabular-nums text-ink/70 whitespace-nowrap">
                        {v && v.pct !== null ? `${v.pct > 0 ? '+' : ''}${fmt(v.pct * 100, 1)}%` : v ? 'nueva' : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
              {entidades.length === 0 && !editing && (
                <tr><td colSpan={6} className="!text-left px-5 py-4 text-sm text-ink/50">El informe no detalla deuda por entidad.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 pb-4">
          <AddRowButton path={['extraccion_nosis', 'detalle_entidades']} list={entidades} newItem={{ entidad: '', situacion: 1, monto: 0 }} label="Agregar entidad" />
          {canceladas.length > 0 && (
            <p className="mt-3 text-xs text-ink/55">
              <span className="font-semibold text-ink/70">Canceladas en el período:</span>{' '}
              {canceladas.map(c => c.entidad).join(', ')}
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-6 items-start">
        {/* Cruce balance vs Nosis */}
        <Card title="Cruce de deuda: balance vs Nosis" icon={<Scale className="w-4 h-4" />}>
          {crossCheck && crossCheck.nosis_debt !== null ? (
            <div className="p-5 space-y-4">
              {(() => {
                const max = Math.max(crossCheck.balance_debt, crossCheck.nosis_debt ?? 0, 1);
                return [
                  { label: 'Deuda bancaria en el balance', v: crossCheck.balance_debt, sub: 'Corriente + no corriente, al cierre' },
                  { label: 'Deuda en el sistema (Nosis)', v: crossCheck.nosis_debt ?? 0, sub: 'A la fecha del informe' },
                ].map(b => (
                  <div key={b.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink/70">{b.label}</span>
                      <span className="font-semibold tabular-nums">{formatCurrencyThousands(b.v)}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-ink/[0.07] overflow-hidden">
                      <div className="h-full bg-ink rounded-full" style={{ width: `${(b.v / max) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-ink/40 mt-1">{b.sub}</p>
                  </div>
                ));
              })()}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-ink/10">
                <StatusBadge status={crossCheck.match ? 'good' : 'critical'} label={crossCheck.match ? 'Consistente' : 'Discrepancia'} />
                <span className="text-xs tabular-nums text-ink/60">
                  Diferencia {formatCurrencyThousands(crossCheck.difference_abs)}
                  {crossCheck.difference_pct !== null && ` (${crossCheck.difference_pct > 0 ? '+' : ''}${fmt(crossCheck.difference_pct, 1)}%)`}
                </span>
              </div>
              <p className="text-[11px] text-ink/45">Las fechas pueden no coincidir: el balance es al cierre y Nosis a la fecha del informe.</p>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-ink/50">No hay deuda informada en Nosis para cruzar con el balance.</p>
          )}
        </Card>

        {/* Antecedentes */}
        <Card title="Antecedentes" subtitle="Alimentan las señales automáticas de la Opinión de riesgos">
          <ul className="divide-y divide-ink/5">
            {antecedentes.map(a => {
              const conDato = a.valor !== null && a.valor !== undefined;
              const alerta = conDato && (a.valor as number) > 0;
              return (
                <li key={a.campo} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="text-ink/70">{a.label}</span>
                  <span className="inline-flex items-center gap-2 font-semibold tabular-nums">
                    {!editing && alerta && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS[a.status] }} aria-hidden="true" />}
                    <EditableNumber
                      path={path(a.campo)}
                      value={a.valor}
                      display={!conDato ? 'Sin dato' : a.monto ? formatCurrencyThousands(a.valor) : a.valor === 0 ? 'No registra' : a.valor}
                      inputClassName="w-24"
                    />
                  </span>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="text-ink/70">Planes de pago vigentes con ARCA</span>
              <span className="inline-flex items-center gap-2 font-semibold">
                {!editing && nosis.planes_de_pago_arca === true && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS.warning }} aria-hidden="true" />}
                <EditableBoolean path={path('planes_de_pago_arca')} value={nosis.planes_de_pago_arca} />
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

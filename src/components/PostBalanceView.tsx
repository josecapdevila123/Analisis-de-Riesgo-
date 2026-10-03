import React from 'react';
import { ArrowDownRight, ArrowUpRight, Boxes, CalendarRange, Landmark, Minus, ShoppingCart } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RawExtraction } from '../features/extraction/schemas';
import { AddRowButton, EditableNumber, EditableSelect, EditableText, Path, RemoveRowButton, useEdit } from '../features/editing/editing';
import { formatCurrencyThousands } from '../lib/utils';
import { hayUnidades, serieUnidades, totalesUnidades } from '../features/postBalance/unidades';

// Pestaña "Información post balance": ventas mensuales posteriores al cierre
// comparadas con el año anterior (con opción de moneda constante) y deuda
// bancaria tomada después del cierre. Solo presentación: el ajuste por
// inflación es el mismo de siempre (factor mensual compuesto hasta el último
// mes; el año anterior lleva además la inflación interanual).

type PostCierre = NonNullable<RawExtraction['analisis_post_cierre']>;

export type AjusteInflacion = {
  activo: boolean;
  setActivo: (v: boolean) => void;
  interanual: number;
  setInteranual: (v: number) => void;
  mensual: number;
  setMensual: (v: number) => void;
};

const VENTAS: Path = ['analisis_post_cierre', 'detalle_ventas_mensuales'];
const DEUDA: Path = ['analisis_post_cierre', 'deuda_bancaria_post_balance_detalle'];

const fmt = (v: number, dec = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const compacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

// Eje del gráfico: "Diciembre 2025" → "dic 25", para que entren todos los meses.
const mesCorto = (mes: string) => {
  const m = (mes ?? '').trim().match(/^([A-Za-zÁÉÍÓÚáéíóúñ]{3})[A-Za-zÁÉÍÓÚáéíóúñ]*\.?\s*(?:de\s+)?(\d{2,4})?$/i);
  if (!m) return mes;
  return `${m[1].toLowerCase()}${m[2] ? ` ${m[2].slice(-2)}` : ''}`;
};

const Card = ({ title, subtitle, icon, right, children }: {
  title: string; subtitle?: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) => (
  <section className="bg-white border border-ink/15">
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-ink/10">
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

// Variación neutra (vender más o menos no se pinta como bueno o malo acá).
const Variacion = ({ v, fuerte }: { v: number | null; fuerte?: boolean }) => {
  if (v === null || !Number.isFinite(v)) return <span className="text-ink/30">—</span>;
  const Icon = v > 0.05 ? ArrowUpRight : v < -0.05 ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center justify-end gap-0.5 tabular-nums whitespace-nowrap ${fuerte ? 'font-semibold text-ink' : 'text-ink/70'}`}>
      <Icon className="w-3.5 h-3.5" />
      {v > 0 ? '+' : ''}{fmt(v, 1)}%
    </span>
  );
};

const TooltipVentas = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number | null }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  const act = payload.find(p => p.dataKey === 'actual')?.value ?? null;
  const ant = payload.find(p => p.dataKey === 'anterior')?.value ?? null;
  const v = act !== null && ant ? ((act - ant) / ant) * 100 : null;
  return (
    <div className="bg-white border border-ink/15 shadow-lg rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-ink">{label}</p>
      <p className="flex items-center gap-1.5 tabular-nums"><span className="w-2 h-2 rounded-sm bg-ink" />Este año {act === null ? '—' : formatCurrencyThousands(act)}</p>
      <p className="flex items-center gap-1.5 tabular-nums"><span className="w-2 h-2 rounded-sm bg-ink/25" />Año anterior {ant === null ? 'sin dato' : formatCurrencyThousands(ant)}</p>
      {v !== null && <p className="text-ink/70"><Variacion v={v} /></p>}
    </div>
  );
};

// ---------- ventas en unidades físicas ----------

type Venta = PostCierre['detalle_ventas_mensuales'][number];

function VentasUnidades({ ventas, unidad }: { ventas: Venta[]; unidad: string | null | undefined }) {
  const { editing } = useEdit();
  const serie = serieUnidades(ventas);
  const t = totalesUnidades(serie);
  const u = (unidad ?? '').trim() || 'unidades';
  const cant = (v: number | null) => (v === null ? '—' : fmt(v, 2));

  const TooltipUnidades = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number | null }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    const act = payload.find(p => p.dataKey === 'cantidad')?.value ?? null;
    const ant = payload.find(p => p.dataKey === 'cantidadAnterior')?.value ?? null;
    const v = act !== null && ant ? ((act - ant) / ant) * 100 : null;
    return (
      <div className="bg-white border border-ink/15 shadow-lg rounded-lg px-3 py-2 text-xs space-y-1">
        <p className="font-semibold text-ink">{label}</p>
        <p className="flex items-center gap-1.5 tabular-nums"><span className="w-2 h-2 rounded-sm bg-ink" />Este año {cant(act)} {u}</p>
        <p className="flex items-center gap-1.5 tabular-nums"><span className="w-2 h-2 rounded-sm bg-ink/25" />Año anterior {ant === null ? 'sin dato' : `${cant(ant)} ${u}`}</p>
        {v !== null && <p className="text-ink/70"><Variacion v={v} /></p>}
      </div>
    );
  };

  return (
    <Card
      title={`Ventas en ${u}`}
      subtitle="Volumen físico informado en la documentación · comparativo con el mismo mes del año anterior"
      icon={<Boxes className="w-4 h-4" />}
      right={
        editing ? (
          <label className="flex items-center gap-2 text-xs text-ink/60">
            Unidad de medida
            <EditableText path={['analisis_post_cierre', 'unidad_medida']} value={unidad ?? ''} inputClassName="w-36" />
          </label>
        ) : (
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">{fmt(t.total, 2)} <span className="text-sm font-normal text-ink/55">{u}</span></p>
            {t.variacion !== null && (
              <p className="text-xs text-ink/55 inline-flex items-center gap-1">
                <Variacion v={t.variacion} /> en {t.mesesComparables} {t.mesesComparables === 1 ? 'mes comparable' : 'meses comparables'}
              </p>
            )}
          </div>
        )
      }
    >
      {serie.length > 1 && !editing && (
        <div className="px-5 pt-5">
          <div className="flex items-center gap-4 text-[11px] text-ink/60 mb-2">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink" />Este año</span>
            {serie.some(p => p.cantidadAnterior !== null) && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink/25" />Año anterior</span>}
          </div>
          <div className="h-48 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} barGap={2} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="mes" tickFormatter={mesCorto} tick={{ fontSize: 11, fill: 'rgb(0 0 0 / 0.5)' }} axisLine={{ stroke: 'rgb(0 0 0 / 0.15)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={v => compacto.format(v)} tick={{ fontSize: 11, fill: 'rgb(0 0 0 / 0.5)' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<TooltipUnidades />} cursor={{ fill: 'rgb(0 0 0 / 0.04)' }} />
                <Bar dataKey="cantidadAnterior" fill="rgb(0 0 0 / 0.22)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="cantidad" fill="#000" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink/50">
              <th className="text-left font-semibold px-5 py-2.5">Mes</th>
              <th className="text-right font-semibold px-3 py-2.5">Este año</th>
              <th className="text-right font-semibold px-3 py-2.5">Año anterior</th>
              {!editing && <th className="text-right font-semibold px-5 py-2.5">Variación</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {editing
              ? ventas.map((v, idx) => (
                  <tr key={idx}>
                    <td className="!text-left px-5 py-2">{v.mes || '—'}{v.moneda === 'USD' && <span className="ml-1 text-[10px] font-semibold text-ink/50">USD</span>}</td>
                    <td className="px-3 py-2"><EditableNumber path={[...VENTAS, idx, 'cantidad']} value={v.cantidad} /></td>
                    <td className="px-3 py-2"><EditableNumber path={[...VENTAS, idx, 'cantidad_anio_anterior']} value={v.cantidad_anio_anterior} /></td>
                  </tr>
                ))
              : serie.map(p => (
                  <tr key={p.mes} className="hover:bg-ink/[0.02]">
                    <td className="!text-left px-5 py-2.5 font-medium">{p.mes}</td>
                    <td className="px-3 py-2.5 tabular-nums">{cant(p.cantidad)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink/60">{p.cantidadAnterior === null ? <span className="text-xs text-ink/35">Sin dato</span> : cant(p.cantidadAnterior)}</td>
                    <td className="px-5 py-2.5"><Variacion v={p.variacion} /></td>
                  </tr>
                ))}
          </tbody>
          {!editing && (
            <tfoot>
              <tr className="border-t border-ink/15 font-semibold">
                <td className="!text-left px-5 py-3">Total</td>
                <td className="px-3 py-3 tabular-nums">{fmt(t.total, 2)}</td>
                <td className="px-3 py-3 tabular-nums text-ink/60">{t.totalAnterior > 0 ? fmt(t.totalAnterior, 2) : <span className="text-xs font-normal text-ink/35">Sin dato</span>}</td>
                <td className="px-5 py-3"><Variacion v={t.variacion} fuerte /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!editing && t.variacion !== null && t.mesesComparables < serie.length && (
        <p className="px-5 pb-4 pt-1 text-[11px] text-ink/45">La variación total compara solo los meses que tienen dato en los dos años.</p>
      )}
      {editing && <p className="px-5 pb-4 pt-1 text-[11px] text-ink/45">Cargá las cantidades en la unidad indicada arriba. Si un mes tiene fila en pesos y en dólares, cargala en una sola.</p>}
    </Card>
  );
}

export function PostBalanceView({ datos, ajuste }: { datos: PostCierre | null; ajuste: AjusteInflacion }) {
  const { editing } = useEdit();
  const ventas = Array.isArray(datos?.detalle_ventas_mensuales) ? datos!.detalle_ventas_mensuales : [];
  const deudas = Array.isArray(datos?.deuda_bancaria_post_balance_detalle) ? datos!.deuda_bancaria_post_balance_detalle : [];
  const ajustar = ajuste.activo && !editing; // en edición se ven y editan los nominales

  // Mismo ajuste que antes: i = meses hasta el último.
  const filas = ventas.map((venta, idx) => {
    const i = ventas.length - 1 - idx;
    let actual = venta.monto || 0;
    let anterior = venta.monto_anio_anterior ?? null;
    if (ajustar) {
      const factorMensual = Math.pow(1 + ajuste.mensual / 100, i);
      const factorInteranual = 1 + ajuste.interanual / 100;
      actual = actual * factorMensual;
      if (anterior) anterior = anterior * factorInteranual * factorMensual;
    }
    const variacion = anterior ? ((actual - anterior) / anterior) * 100 : null;
    return { venta, idx, actual, anterior, variacion };
  });
  const totalActual = filas.reduce((a, f) => a + f.actual, 0);
  const totalAnterior = filas.reduce((a, f) => a + (f.anterior || 0), 0);
  const totalVar = totalAnterior > 0 ? ((totalActual - totalAnterior) / totalAnterior) * 100 : null;
  const mesesConComparativo = filas.filter(f => f.anterior).length;
  const monedaVentas = ventas.some(v => v.moneda === 'USD') ? 'USD' : 'ARS';

  // Deuda: total por moneda (no se suman pesos con dólares).
  const totalesDeuda = (['ARS', 'USD'] as const)
    .map(m => ({ moneda: m, total: deudas.filter(d => (d.moneda ?? 'ARS') === m).reduce((a, d) => a + (Number(d.monto) || 0), 0), n: deudas.filter(d => (d.moneda ?? 'ARS') === m).length }))
    .filter(t => t.n > 0);
  const maxDeuda = Math.max(...deudas.map(d => Number(d.monto) || 0), 1);

  const periodo = datos?.periodo_analizado;
  const hayVentas = ventas.length > 0 || (datos?.total_ventas_post_cierre ?? 0) > 0;
  const hayAlgo = hayVentas || deudas.length > 0 || !!datos?.notas_relevantes;

  if (!datos || (!hayAlgo && !editing)) {
    return (
      <div className="bg-white border border-ink/15 px-6 py-10 text-center animate-in fade-in duration-500">
        <p className="font-display text-base font-semibold">Sin información post balance</p>
        <p className="text-sm text-ink/50 mt-1">No se adjuntaron ventas ni deuda posteriores al cierre en este caso.</p>
      </div>
    );
  }

  return (
    <div className="@container space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
      {/* Resumen */}
      <div className="grid grid-cols-1 @md:grid-cols-2 @4xl:grid-cols-4 gap-3">
        <Kpi label="Período analizado" sub={ventas.length > 0 ? `${ventas.length} ${ventas.length === 1 ? 'mes' : 'meses'} informados` : undefined}>
          {/* Si el documento no informó el período, no se crea uno a medias (el schema pide inicio y fin). */}
          {!periodo ? <span className="text-ink/40">—</span> : (
          <span className="text-base inline-flex flex-wrap items-center gap-1">
            <EditableText path={['analisis_post_cierre', 'periodo_analizado', 'fecha_inicio']} value={periodo?.fecha_inicio} display={periodo?.fecha_inicio || '—'} inputClassName="w-28" />
            <span className="text-ink/40">→</span>
            <EditableText path={['analisis_post_cierre', 'periodo_analizado', 'fecha_fin']} value={periodo?.fecha_fin} display={periodo?.fecha_fin || '—'} inputClassName="w-28" />
          </span>
          )}
        </Kpi>
        <Kpi label={ajustar ? 'Ventas acumuladas (constante)' : 'Ventas acumuladas'} sub={monedaVentas === 'USD' ? 'Incluye meses en dólares' : 'Miles de $'}>
          {formatCurrencyThousands(totalActual)}
        </Kpi>
        <Kpi label="Contra el año anterior" sub={mesesConComparativo > 0 ? `${mesesConComparativo} de ${ventas.length} meses con comparativo` : 'Sin comparativo'}>
          <Variacion v={totalVar} fuerte />
        </Kpi>
        <Kpi label="Deuda tomada post balance" sub={`${deudas.length} ${deudas.length === 1 ? 'operación' : 'operaciones'}`}>
          {totalesDeuda.length === 0 ? '—' : (
            <span className="flex flex-col">
              {totalesDeuda.map(t => <span key={t.moneda}>{formatCurrencyThousands(t.total, t.moneda)}</span>)}
            </span>
          )}
        </Kpi>
      </div>

      {/* Ventas */}
      <Card
        title="Ventas post balance"
        subtitle="Comparativo mes a mes contra el mismo mes del año anterior"
        icon={<ShoppingCart className="w-4 h-4" />}
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex rounded-full border border-ink/15 p-0.5 text-xs font-semibold" role="group" aria-label="Moneda">
              {[
                { v: false, label: 'Nominal' },
                { v: true, label: 'Moneda constante' },
              ].map(o => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => ajuste.setActivo(o.v)}
                  aria-pressed={ajuste.activo === o.v}
                  className={`px-3 py-1 rounded-full transition-colors ${ajuste.activo === o.v ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {ajuste.activo && (
              <div className="flex flex-wrap items-center justify-end gap-3 text-xs animate-in fade-in slide-in-from-top-2">
                <label className="flex items-center gap-1.5 text-ink/60">
                  Inflación interanual
                  <input type="number" value={ajuste.interanual} onChange={e => ajuste.setInteranual(Number(e.target.value))} className="w-16 px-1.5 py-0.5 border border-ink/20 rounded text-right tabular-nums text-ink" />
                  %
                </label>
                <label className="flex items-center gap-1.5 text-ink/60">
                  Mensual promedio
                  <input type="number" value={ajuste.mensual} onChange={e => ajuste.setMensual(Number(e.target.value))} className="w-14 px-1.5 py-0.5 border border-ink/20 rounded text-right tabular-nums text-ink" />
                  %
                </label>
              </div>
            )}
          </div>
        }
      >
        {ventas.length > 0 || editing ? (
          <>
            {ventas.length > 1 && !editing && (
              <div className="px-5 pt-5">
                <div className="flex items-center gap-4 text-[11px] text-ink/60 mb-2">
                  <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink" />Este año</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink/25" />Año anterior</span>
                </div>
                <div className="h-56 -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filas.map(f => ({ mes: f.venta.mes, actual: f.actual, anterior: f.anterior }))} barGap={2} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgb(0 0 0 / 0.06)" />
                      <XAxis dataKey="mes" tickFormatter={mesCorto} tick={{ fontSize: 11, fill: 'rgb(0 0 0 / 0.5)' }} axisLine={{ stroke: 'rgb(0 0 0 / 0.15)' }} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tickFormatter={v => compacto.format(v)} tick={{ fontSize: 11, fill: 'rgb(0 0 0 / 0.5)' }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip content={<TooltipVentas />} cursor={{ fill: 'rgb(0 0 0 / 0.04)' }} />
                      <Bar dataKey="anterior" fill="rgb(0 0 0 / 0.22)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                      <Bar dataKey="actual" fill="#000" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-ink/50">
                    <th className="text-left font-semibold px-5 py-2.5">Mes</th>
                    <th className="text-right font-semibold px-3 py-2.5">Este año</th>
                    <th className="text-right font-semibold px-3 py-2.5">Año anterior</th>
                    <th className="text-right font-semibold px-5 py-2.5">Variación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {filas.map(f => (
                    <tr key={f.idx} className="hover:bg-ink/[0.02]">
                      <td className="!text-left px-5 py-2.5 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <RemoveRowButton path={VENTAS} list={ventas} index={f.idx} />
                          <EditableText path={[...VENTAS, f.idx, 'mes']} value={f.venta.mes} />
                          {f.venta.moneda === 'USD' && !editing && <span className="ml-1 text-[10px] font-semibold text-ink/50">USD</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ink">
                        <EditableNumber path={[...VENTAS, f.idx, 'monto']} value={f.venta.monto} display={formatCurrencyThousands(f.actual, f.venta.moneda)} required />
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ink/60">
                        <EditableNumber
                          path={[...VENTAS, f.idx, 'monto_anio_anterior']}
                          value={f.venta.monto_anio_anterior}
                          display={f.anterior ? formatCurrencyThousands(f.anterior, f.venta.moneda) : <span className="text-xs text-ink/35">Sin dato</span>}
                        />
                      </td>
                      <td className="px-5 py-2.5"><Variacion v={f.variacion} /></td>
                    </tr>
                  ))}
                </tbody>
                {ventas.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-ink/15 font-semibold">
                      <td className="!text-left px-5 py-3">Total acumulado</td>
                      <td className="px-3 py-3 tabular-nums">{formatCurrencyThousands(totalActual)}</td>
                      <td className="px-3 py-3 tabular-nums text-ink/60">{totalAnterior > 0 ? formatCurrencyThousands(totalAnterior) : <span className="text-xs font-normal text-ink/35">Sin dato</span>}</td>
                      <td className="px-5 py-3"><Variacion v={totalVar} fuerte /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="px-5 pb-4 space-y-2">
              <AddRowButton path={VENTAS} list={ventas} newItem={{ mes: '', monto: 0, monto_anio_anterior: null, moneda: 'ARS' }} label="Agregar mes" />
              {ajustar && (
                <p className="text-[11px] text-ink/45">
                  En moneda del último mes, con inflación interanual del {fmt(ajuste.interanual, 1)}% y mensual del {fmt(ajuste.mensual, 1)}%.
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="px-5 py-6 text-sm text-ink/50">
            {(datos.total_ventas_post_cierre ?? 0) > 0
              ? `El documento informa ventas post balance por ${formatCurrencyThousands(datos.total_ventas_post_cierre)}, sin el detalle por mes.`
              : 'No se informaron ventas posteriores al cierre.'}
          </p>
        )}
      </Card>

      {/* Ventas en unidades físicas: solo si el documento las informa (o para cargarlas a mano) */}
      {(hayUnidades(serieUnidades(ventas)) || !!datos.unidad_medida || (editing && ventas.length > 0)) && (
        <VentasUnidades ventas={ventas} unidad={datos.unidad_medida} />
      )}

      {/* Deuda post balance */}
      {(deudas.length > 0 || editing) && (
        <Card title="Deuda bancaria tomada post balance" subtitle="Operaciones posteriores al cierre informadas en la documentación" icon={<Landmark className="w-4 h-4" />}>
          <ul className="divide-y divide-ink/5">
            {deudas.map((d, idx) => (
              <li key={idx} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
                <span className="inline-flex items-center gap-1 font-medium min-w-[160px] flex-1">
                  <RemoveRowButton path={DEUDA} list={deudas} index={idx} />
                  <EditableText path={[...DEUDA, idx, 'entidad']} value={d.entidad} display={d.entidad || 'Sin entidad'} />
                </span>
                {!editing && (
                  <div className="hidden @xl:block w-40 h-1.5 rounded-full bg-ink/[0.07] overflow-hidden">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${((Number(d.monto) || 0) / maxDeuda) * 100}%` }} />
                  </div>
                )}
                <span className="inline-flex items-center gap-2 font-semibold tabular-nums">
                  {editing && <EditableSelect path={[...DEUDA, idx, 'moneda']} value={d.moneda ?? 'ARS'} options={['ARS', 'USD']} />}
                  <EditableNumber path={[...DEUDA, idx, 'monto']} value={d.monto} display={formatCurrencyThousands(d.monto, d.moneda)} required />
                </span>
              </li>
            ))}
          </ul>
          {totalesDeuda.length > 0 && !editing && (
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 px-5 py-3 border-t border-ink/15 text-sm font-semibold">
              {totalesDeuda.map(t => (
                <span key={t.moneda} className="tabular-nums">Total {t.moneda === 'USD' ? 'en dólares' : 'en pesos'}: {formatCurrencyThousands(t.total, t.moneda)}</span>
              ))}
            </div>
          )}
          <div className="px-5 pb-4">
            <AddRowButton path={DEUDA} list={deudas} newItem={{ entidad: '', monto: 0, moneda: 'ARS' }} label="Agregar deuda" />
          </div>
        </Card>
      )}

      {/* Notas */}
      {(datos.notas_relevantes || editing) && (
        <Card title="Notas" icon={<CalendarRange className="w-4 h-4" />}>
          <div className="px-5 py-4 text-sm text-body leading-relaxed">
            <EditableText path={['analisis_post_cierre', 'notas_relevantes']} value={datos.notas_relevantes} multiline />
          </div>
        </Card>
      )}
    </div>
  );
}

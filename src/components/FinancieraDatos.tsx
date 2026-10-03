import { Landmark } from 'lucide-react';
import { FUENTES_FONDEO, RawExtraction } from '../features/extraction/schemas';
import { AddRowButton, EditableNumber, EditableSelect, EditableText, RemoveRowButton, useEdit } from '../features/editing/editing';
import { disponibilidadesActuales } from '../features/ratios/calculations';
import { indicadoresFinancieros } from '../features/ratios/financieras';
import { DocumentoSectorial } from '../features/sectorDocs/tipos';
import { PerfilEfectivo, subsegmentoLabel } from '../features/risk/policy';
import { STATUS, StatusBadge } from './riskColors';

// Financieras: PN ajustado con el cálculo a la vista, fuente y fecha de corte
// de la mora, cruce reporte vs. balance y los datos del bloque financiero de
// los EECC (editables con "Editar valores").

const miles = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `$ ${Math.round(v).toLocaleString('es-AR')}`);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);

const CAMPOS: Array<{ campo: string; label: string }> = [
  { campo: 'cartera_total', label: 'Cartera total (bruta de previsiones)' },
  { campo: 'cartera_total_anterior', label: 'Cartera total del ejercicio anterior' },
  { campo: 'previsiones_incobrabilidad', label: 'Previsiones por incobrabilidad' },
  { campo: 'cargo_incobrabilidad', label: 'Cargo por incobrabilidad del ejercicio' },
  { campo: 'ingresos_financieros', label: 'Ingresos financieros' },
  { campo: 'egresos_financieros', label: 'Egresos financieros' },
  { campo: 'creditos_a_vencer_90_dias', label: 'Créditos a vencer en 90 días' },
  { campo: 'pasivos_a_vencer_90_dias', label: 'Pasivos a vencer en 90 días' },
  { campo: 'inversiones_corrientes', label: 'Inversiones corrientes' },
  { campo: 'top10_deudores_monto', label: 'Top 10 deudores (carga manual)' },
];

export function FinancieraDatos({ extraction, documentos, perfil }: { extraction: RawExtraction; documentos: DocumentoSectorial[]; perfil: PerfilEfectivo }) {
  const { editing } = useEdit();
  const f = indicadoresFinancieros(extraction, documentos, { disponibilidades: disponibilidadesActuales(extraction) });
  const bloque = extraction.extraccion_financiera ?? null;
  const pn = extraction.ejercicio_actual.estado_situacion_patrimonial.patrimonio_neto;
  const pnAj = f.valores.pn_ajustado.actual;
  const sobrePn = f.valores.pn_ajustado_sobre_pn.actual;
  const base = ['extraccion_financiera'];

  return (
    <div className="space-y-6">
      {/* PN ajustado */}
      <section className="bg-white border border-ink/15 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">PN ajustado por mora</h3>
            <p className="text-xs text-ink/50">Patrimonio después de restar la mora con más de 90 días que no está cubierta por previsiones.</p>
          </div>
          {sobrePn !== null && (
            <StatusBadge status={pnAj !== null && pnAj <= 0 ? 'critical' : sobrePn < 0.8 ? 'serious' : 'good'} label={`${pct(sobrePn)} del PN`} />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm tabular-nums">
          <span>PN {miles(pn)}</span>
          <span className="text-ink/40">−</span>
          <span>( cartera &gt; 90 días {miles(f.mora.vencida90)}</span>
          <span className="text-ink/40">−</span>
          <span>previsiones {miles(f.mora.previsiones)} )</span>
          <span className="text-ink/40">=</span>
          <span className="text-xl font-semibold" style={pnAj !== null && pnAj <= 0 ? { color: STATUS.critical } : undefined}>{miles(pnAj)}</span>
          <span className="text-xs text-ink/45">miles</span>
        </div>
        {pnAj === null && <p className="mt-2 text-xs text-ink/50">{f.valores.pn_ajustado.motivo}</p>}
        <p className="mt-3 text-xs text-ink/55">
          Sub-segmento: <strong className="text-ink">{subsegmentoLabel(perfil.subsegmento) ?? '—'}</strong>
          {' · '}Fuente de la mora: <strong className="text-ink">{f.mora.fuente === 'reporte' ? 'reporte de mora (declarado, no auditado)' : f.mora.fuente === 'balance' ? 'balance' : 'sin datos'}</strong>
          {f.mora.fechaCorte && <> al <strong className="text-ink">{f.mora.fechaCorte}</strong></>}
          {f.mora.fuentePrevisiones && f.mora.fuentePrevisiones !== f.mora.fuente && <> · previsiones del {f.mora.fuentePrevisiones}</>}
        </p>
        {f.cruce && (
          <p className={`mt-2 text-xs px-2 py-1 inline-block rounded-sm ${f.cruce.alerta ? 'bg-brand-blue/10 text-ink font-medium' : 'text-ink/55'}`}>
            Cartera del reporte {miles(f.cruce.carteraReporte)} ({f.cruce.fechaReporte ?? 's/f'}) vs. balance {miles(f.cruce.carteraBalance)} ({f.cruce.fechaBalance ?? 's/f'}):
            {' '}{f.cruce.diferenciaPct > 0 ? '+' : ''}{Math.round(f.cruce.diferenciaPct * 100)}%
            {f.cruce.alerta && ' — supera el 15%; puede deberse a las fechas distintas.'}
          </p>
        )}
      </section>

      {/* Mora por producto (si el reporte la trae) */}
      {f.moraPorProducto.length > 0 && (
        <section className="bg-white border border-ink/15">
          <header className="px-5 py-4 border-b border-ink/10">
            <h3 className="font-display text-base font-semibold">Mora por producto</h3>
            <p className="text-xs text-ink/50">Del reporte de mora (declarado por el cliente).</p>
          </header>
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-ink/50"><th className="text-left px-5 py-2">Producto</th><th className="text-right px-3 py-2">Cartera</th><th className="text-right px-3 py-2">&gt; 90 días</th><th className="text-right px-5 py-2">Mora</th></tr></thead>
            <tbody className="divide-y divide-ink/5">
              {f.moraPorProducto.map(p => (
                <tr key={p.producto}><td className="!text-left px-5 py-2">{p.producto}</td><td className="px-3 py-2 tabular-nums">{miles(p.cartera)}</td><td className="px-3 py-2 tabular-nums">{miles(p.mora_90)}</td><td className="px-5 py-2 tabular-nums">{pct(p.mora)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Bloque financiero de los EECC */}
      <section className="bg-white border border-ink/15">
        <header className="px-5 py-4 border-b border-ink/10 flex items-start gap-2">
          <Landmark className="w-4 h-4 mt-0.5 text-ink/60" />
          <div>
            <h3 className="font-display text-base font-semibold">Datos financieros del balance</h3>
            <p className="text-xs text-ink/50">
              {bloque ? `Extraídos del balance${bloque.fecha_cierre ? ` al ${bloque.fecha_cierre}` : ''}. Miles de $. Editables con "Editar valores".` : 'Todavía no se extrajeron: usá "Extraer datos financieros del balance" en el pre-chequeo.'}
            </p>
          </div>
        </header>
        {(bloque || editing) && (
          <div className="p-5 grid grid-cols-1 @3xl:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {CAMPOS.map(c => (
              <div key={c.campo} className="flex items-center justify-between gap-3 border-b border-ink/5 py-1.5">
                <span className="text-ink/70">{c.label}</span>
                <span className="tabular-nums font-medium">
                  <EditableNumber path={[...base, c.campo]} value={(bloque as Record<string, unknown> | null)?.[c.campo] as number | null} display={miles((bloque as Record<string, unknown> | null)?.[c.campo] as number | null)} inputClassName="w-28" />
                </span>
              </div>
            ))}
            <div className="@3xl:col-span-2 mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-1">Cartera vencida por tramo (RT 9)</p>
              <table className="w-full text-xs">
                <thead><tr className="text-ink/45"><th className="text-left py-1">Tramo</th><th className="text-right py-1">Desde (días)</th><th className="text-right py-1">Hasta (días)</th><th className="text-right py-1">Monto</th></tr></thead>
                <tbody>
                  {(bloque?.cartera_vencida_por_tramo ?? []).map((t, i, list) => (
                    <tr key={i} className="border-t border-ink/5">
                      <td className="!text-left py-1"><span className="inline-flex items-center gap-1"><RemoveRowButton path={[...base, 'cartera_vencida_por_tramo']} list={list} index={i} /><EditableText path={[...base, 'cartera_vencida_por_tramo', i, 'tramo']} value={t.tramo} /></span></td>
                      <td className="py-1"><EditableNumber path={[...base, 'cartera_vencida_por_tramo', i, 'desde_dias']} value={t.desde_dias} inputClassName="w-16" /></td>
                      <td className="py-1"><EditableNumber path={[...base, 'cartera_vencida_por_tramo', i, 'hasta_dias']} value={t.hasta_dias} display={t.hasta_dias ?? 'sin tope'} inputClassName="w-16" /></td>
                      <td className="py-1"><EditableNumber path={[...base, 'cartera_vencida_por_tramo', i, 'monto']} value={t.monto} display={miles(t.monto)} inputClassName="w-24" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AddRowButton path={[...base, 'cartera_vencida_por_tramo']} list={bloque?.cartera_vencida_por_tramo} newItem={{ tramo: '', desde_dias: null, hasta_dias: null, monto: null }} label="Agregar tramo" />
            </div>
            <div className="@3xl:col-span-2 mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-1">Fuentes de fondeo</p>
              {(bloque?.fondeo ?? []).map((x, i, list) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b border-ink/5 py-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <RemoveRowButton path={[...base, 'fondeo']} list={list} index={i} />
                    <EditableSelect path={[...base, 'fondeo', i, 'fuente']} value={x.fuente} options={[...FUENTES_FONDEO]} display={x.fuente.replace(/_/g, ' ')} />
                  </span>
                  <EditableNumber path={[...base, 'fondeo', i, 'monto']} value={x.monto} display={miles(x.monto)} inputClassName="w-24" />
                </div>
              ))}
              <AddRowButton path={[...base, 'fondeo']} list={bloque?.fondeo} newItem={{ fuente: 'bancos', monto: null }} label="Agregar fuente" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

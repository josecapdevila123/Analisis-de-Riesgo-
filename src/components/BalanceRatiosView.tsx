import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Calculator, Minus } from 'lucide-react';
import { RawExtraction } from '../features/extraction/schemas';
import { ComputedRatios, RatioStatus } from '../features/ratios/calculations';
import { bloquesDelPerfil, RatioKind } from '../features/ratios/blocks';
import { PerfilEfectivo, perfilEfectivo } from '../features/risk/policy';
import { DocumentoSectorial } from '../features/sectorDocs/tipos';
import { FinancieraDatos } from './FinancieraDatos';
import { RatioLink } from './CalculoRatio';
import { fmtNumero, Insumos, insumosDelEjercicio, Termino } from '../features/ratios/definiciones';
import { EditableNumber, EditableText, Path, useEdit } from '../features/editing/editing';
import { STATUS, Status, StatusBadge } from './riskColors';

// Pestaña "Balance y Ratios": estados contables comparativos (editables en modo
// edición, con análisis vertical) y ratios por bloque con semáforo y fórmula.

type Year = RawExtraction['ejercicio_actual'];
type Line = {
  concepto: string;
  get: (y: Year) => number | null | undefined;
  // Path dentro del ejercicio (sin el prefijo del año) para editar.
  path?: Path;
  nullable?: boolean;
  total?: boolean;
  calculado?: 'ebitda';
  // En análisis vertical, muestra además qué % del pasivo total representa.
  shareOfPasivo?: boolean;
};
type Section = { titulo?: string; lines: Line[] };

const ESP: Section[] = [
  { titulo: 'Activo', lines: [
    { concepto: 'Activo corriente', get: y => y.estado_situacion_patrimonial.activo_corriente.total, path: ['estado_situacion_patrimonial', 'activo_corriente', 'total'] },
    { concepto: 'Activo no corriente', get: y => y.estado_situacion_patrimonial.activo_no_corriente.total, path: ['estado_situacion_patrimonial', 'activo_no_corriente', 'total'] },
    { concepto: 'Activo total', get: y => y.estado_situacion_patrimonial.total_activo, path: ['estado_situacion_patrimonial', 'total_activo'], total: true },
  ]},
  { titulo: 'Pasivo', lines: [
    { concepto: 'Pasivo corriente', get: y => y.estado_situacion_patrimonial.pasivo_corriente.total, path: ['estado_situacion_patrimonial', 'pasivo_corriente', 'total'], shareOfPasivo: true },
    { concepto: 'Pasivo no corriente', get: y => y.estado_situacion_patrimonial.pasivo_no_corriente.total, path: ['estado_situacion_patrimonial', 'pasivo_no_corriente', 'total'], shareOfPasivo: true },
    { concepto: 'Pasivo total', get: y => y.estado_situacion_patrimonial.total_pasivo, path: ['estado_situacion_patrimonial', 'total_pasivo'], total: true },
  ]},
  { titulo: 'Patrimonio', lines: [
    { concepto: 'Patrimonio neto', get: y => y.estado_situacion_patrimonial.patrimonio_neto, path: ['estado_situacion_patrimonial', 'patrimonio_neto'], total: true },
  ]},
  // Cierre del lado del financiamiento: tiene que igualar al activo total (= 100% en vertical).
  { lines: [
    {
      concepto: 'Pasivo + patrimonio neto',
      get: y => y.estado_situacion_patrimonial.total_pasivo + y.estado_situacion_patrimonial.patrimonio_neto,
      total: true,
    },
  ]},
];

const ER: Section[] = [
  { lines: [
    { concepto: 'Ventas netas', get: y => y.estado_resultados.ventas_netas, path: ['estado_resultados', 'ventas_netas'], total: true },
    { concepto: 'Resultado bruto', get: y => y.estado_resultados.resultado_bruto, path: ['estado_resultados', 'resultado_bruto'] },
    { concepto: 'Resultado ordinario', get: y => y.estado_resultados.resultado_ordinario, path: ['estado_resultados', 'resultado_ordinario'] },
    { concepto: 'Resultados financieros y por tenencia', get: y => y.estado_resultados.resultado_financiero_y_tenencia, path: ['estado_resultados', 'resultado_financiero_y_tenencia'], nullable: true },
    { concepto: 'Resultado del ejercicio', get: y => y.estado_resultados.resultado_neto, path: ['estado_resultados', 'resultado_neto'], total: true },
  ]},
];

const RATIO_STATUS: Record<RatioStatus, { status: Status; label: string }> = {
  healthy: { status: 'good', label: 'Sano' },
  alert: { status: 'warning', label: 'Alerta' },
  critical: { status: 'critical', label: 'Crítico' },
};

const fmtNum = (v: number, dec = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const variation = (a: number | null | undefined, b: number | null | undefined) =>
  a === null || a === undefined || b === null || b === undefined || b === 0 ? null : ((a - b) / Math.abs(b)) * 100;

const fmtRatio = (v: number | null | undefined, kind: RatioKind) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (kind === 'pct') return `${fmtNum(v * 100, 1)}%`;
  if (kind === 'x') return `${fmtNum(v, 2)}x`;
  if (kind === 'dias') return `${fmtNum(v, 0)} d`;
  return fmtNum(v, 0); // montos en miles de $, sin signo para que entren en la columna
};

const Variation = ({ value, unit = '%' }: { value: number | null; unit?: '%' | 'p.p.' }) => {
  if (value === null || !Number.isFinite(value)) return <span className="text-ink/30">—</span>;
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center justify-end gap-0.5 text-ink/70 tabular-nums whitespace-nowrap">
      <Icon className="w-3 h-3" />
      {value > 0 ? '+' : ''}{fmtNum(value, 1)}{unit === 'p.p.' ? ' p.p.' : '%'}
    </span>
  );
};

// Activo = pasivo + PN (tolerancia 1%), como en los sanity checks.
const cuadra = (y: Year | null | undefined) => {
  if (!y) return null;
  const e = y.estado_situacion_patrimonial;
  const esperado = e.total_pasivo + e.patrimonio_neto;
  const denom = Math.max(Math.abs(e.total_activo), Math.abs(esperado));
  return denom === 0 ? true : Math.abs(e.total_activo - esperado) / denom <= 0.01;
};

// ---------- Estado contable ----------

function Statement({ title, sections, extraction, ratios, base, baseLabel, vertical, badge }: {
  title: string;
  baseLabel: string;
  sections: Section[];
  extraction: RawExtraction;
  ratios: ComputedRatios;
  base: (y: Year) => number;
  vertical: boolean;
  badge?: React.ReactNode;
}) {
  const { editing } = useEdit();
  const act = extraction.ejercicio_actual;
  const ant = extraction.ejercicio_anterior;
  const anioAct = extraction.company_profile.anio_actual || 'Actual';
  const anioAnt = extraction.company_profile.anio_anterior || 'Anterior';

  const valueOf = (line: Line, y: Year | null, which: 'actual' | 'anterior') => {
    if (!y) return null;
    return line.calculado === 'ebitda' ? ratios.ebitda[which] : line.get(y) ?? null;
  };

  const cell = (line: Line, y: Year | null, which: 'actual' | 'anterior') => {
    const v = valueOf(line, y, which);
    if (!y) return <span className="text-ink/30">—</span>;
    if (editing && line.path) {
      const prefix = which === 'actual' ? 'ejercicio_actual' : 'ejercicio_anterior';
      return <EditableNumber path={[prefix, ...line.path]} value={v} required={!line.nullable} />;
    }
    if (v === null || v === undefined) return <span className="text-ink/30">—</span>;
    if (vertical) {
      const b = base(y);
      const main = b ? `${fmtNum((v / b) * 100, 1)}%` : '—';
      const tp = y.estado_situacion_patrimonial.total_pasivo;
      if (line.shareOfPasivo && tp) {
        return (
          <span className="inline-flex flex-col items-end leading-tight">
            {main}
            <span className="text-[10px] text-ink/45 whitespace-nowrap">{fmtNum((v / tp) * 100, 0)}% del pasivo</span>
          </span>
        );
      }
      return main;
    }
    return fmtNum(v, 0);
  };

  // Variación: en vertical, cambio del peso en puntos porcentuales; si no, variación del monto.
  const variationOf = (line: Line) => {
    const a = valueOf(line, act, 'actual');
    const p = valueOf(line, ant, 'anterior');
    if (!vertical) return { value: variation(a, p), unit: '%' as const };
    if (a === null || a === undefined || p === null || p === undefined || !ant) return { value: null, unit: 'p.p.' as const };
    const ba = base(act);
    const bp = base(ant);
    if (!ba || !bp) return { value: null, unit: 'p.p.' as const };
    return { value: (a / ba - p / bp) * 100, unit: 'p.p.' as const };
  };

  return (
    <section className="bg-white border border-ink/15 flex flex-col">
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink/10">
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          {vertical && <p className="text-[11px] text-ink/50">Base: {baseLabel} = 100%</p>}
        </div>
        {badge}
      </header>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-ink/50">
            <th className="text-left font-semibold px-5 py-2.5">Concepto</th>
            <th className="text-right font-semibold px-3 py-2.5">{anioAnt}</th>
            <th className="text-right font-semibold px-3 py-2.5">{anioAct}</th>
            <th className="text-right font-semibold px-5 py-2.5">{vertical ? 'Var. p.p.' : 'Var.'}</th>
          </tr>
        </thead>
        {sections.map((section, si) => (
          <tbody key={si}>
            {section.titulo && (
              <tr>
                <td colSpan={4} className="!text-left px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-ink/40">
                  {section.titulo}
                </td>
              </tr>
            )}
            {section.lines.map(line => {
              const v = variationOf(line);
              return (
                <tr key={line.concepto} className={line.total ? 'border-t border-ink/15 font-semibold' : 'hover:bg-ink/[0.02]'}>
                  <td className="!text-left px-5 py-2">
                    <span className={line.total ? 'text-ink' : 'text-body'}>{line.concepto}</span>
                    {line.calculado && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-ink/45" title="Calculado por el sistema, no editable">
                        <Calculator className="w-3 h-3" /> calculado
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink/60">{cell(line, ant, 'anterior')}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{cell(line, act, 'actual')}</td>
                  <td className="px-5 py-2 text-xs"><Variation value={v.value} unit={v.unit} /></td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
      </div>
    </section>
  );
}

// ---------- Vista ----------

// ---------- Datos de entrada: las cifras del balance que usan los ratios ----------

const ENTRADAS: Array<{ k: keyof Insumos; grupo: string }> = [
  { k: 'ac', grupo: 'Balance' }, { k: 'pc', grupo: 'Balance' }, { k: 'anc', grupo: 'Balance' }, { k: 'activo', grupo: 'Balance' },
  { k: 'pasivo', grupo: 'Balance' }, { k: 'pn', grupo: 'Balance' }, { k: 'bc', grupo: 'Balance' },
  { k: 'disponibilidades', grupo: 'Renglones del balance' }, { k: 'creditos', grupo: 'Renglones del balance' },
  { k: 'deudasComerciales', grupo: 'Renglones del balance' }, { k: 'anticiposTotal', grupo: 'Renglones del balance' },
  { k: 'deudaCorriente', grupo: 'Deuda bancaria' }, { k: 'deudaNoCorriente', grupo: 'Deuda bancaria' },
  { k: 'ventas', grupo: 'Resultados' }, { k: 'costo', grupo: 'Resultados' }, { k: 'rb', grupo: 'Resultados' },
  { k: 'gfin', grupo: 'Resultados' }, { k: 'impuestos', grupo: 'Resultados' }, { k: 'rn', grupo: 'Resultados' },
  { k: 'depreciacion', grupo: 'Flujo de efectivo' }, { k: 'pagosBdU', grupo: 'Flujo de efectivo' }, { k: 'flujoOperativo', grupo: 'Flujo de efectivo' },
];

function DatosEntrada({ extraction }: { extraction: RawExtraction }) {
  const act = insumosDelEjercicio(extraction.ejercicio_actual, extraction.deuda_bancaria_actual.corriente.total, extraction.deuda_bancaria_actual.no_corriente.total);
  const ant = extraction.ejercicio_anterior && extraction.deuda_bancaria_anterior
    ? insumosDelEjercicio(extraction.ejercicio_anterior, extraction.deuda_bancaria_anterior.corriente.total, extraction.deuda_bancaria_anterior.no_corriente.total)
    : null;
  const grupos = [...new Set(ENTRADAS.map(e => e.grupo))];
  const anioAct = extraction.company_profile.anio_actual || 'Actual';
  const anioAnt = extraction.company_profile.anio_anterior || 'Anterior';
  return (
    <section className="bg-white border border-ink/15">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink/50">
              <th className="text-left font-semibold px-5 py-2.5">Dato</th>
              <th className="text-right font-semibold px-3 py-2.5">{anioAnt}</th>
              <th className="text-right font-semibold px-3 py-2.5">{anioAct}</th>
              <th className="text-left font-semibold px-5 py-2.5">De dónde sale</th>
            </tr>
          </thead>
          {grupos.map(g => (
            <tbody key={g}>
              <tr><td colSpan={4} className="!text-left px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-ink/40">{g}</td></tr>
              {ENTRADAS.filter(e => e.grupo === g).map(({ k }) => {
                const a = act[k] as Termino;
                const p = ant ? (ant[k] as Termino) : null;
                const rg = a.renglones;
                return (
                  <tr key={String(k)} className="align-top hover:bg-ink/[0.02]">
                    <td className="!text-left px-5 py-2 text-body">{a.label}</td>
                    <td className="px-3 py-2 tabular-nums text-ink/60">{p ? fmtNumero(p.valor) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">{fmtNumero(a.valor)}</td>
                    <td className="!text-left px-5 py-2 text-[11px] text-ink/50 max-w-[360px]">
                      {a.origen}{a.nota ? ` · ${a.nota}` : ''}
                      {rg && (rg.incluidos.length > 0 || rg.excluidos.length > 0) && (
                        <span className="block mt-0.5">
                          {rg.incluidos.map(r => `+ ${r.rubro} (${fmtNumero(r.monto)})`).join(' · ')}
                          {rg.excluidos.length > 0 && <span className="text-ink/35"> · excluidos: {rg.excluidos.map(r => `${r.rubro} (${fmtNumero(r.monto)})`).join(', ')}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

export function BalanceRatiosView({ extraction, ratios, perfil = perfilEfectivo('generico'), pendienteRubro = false, documentos = [], cabecera = null }: {
  extraction: RawExtraction;
  ratios: ComputedRatios;
  // Perfil del rubro (umbrales, "no aplica" y KPIs prioritarios) y portón.
  perfil?: PerfilEfectivo;
  pendienteRubro?: boolean;
  documentos?: DocumentoSectorial[];
  // Recuadro "Perfil de evaluación" (con qué criterios se miden estos ratios).
  cabecera?: React.ReactNode;
}) {
  const { editing } = useEdit();
  const [modo, setModo] = useState<'absolutos' | 'vertical' | 'entrada'>('absolutos');
  const vertical = modo === 'vertical' && !editing; // en edición se editan valores absolutos
  const entrada = modo === 'entrada' && !editing;
  const anioAct = extraction.company_profile.anio_actual || 'Actual';
  const anioAnt = extraction.company_profile.anio_anterior || 'Anterior';

  const cuadraAct = cuadra(extraction.ejercicio_actual);
  const cuadraAnt = cuadra(extraction.ejercicio_anterior);
  const balanceBadge = (
    <div className="flex flex-wrap gap-1.5 justify-end">
      {[[anioAnt, cuadraAnt], [anioAct, cuadraAct]].map(([anio, ok]) => ok === null ? null : (
        <StatusBadge key={String(anio)} status={ok ? 'good' : 'critical'} label={`${anio} ${ok ? 'cuadra' : 'no cuadra'}`} />
      ))}
    </div>
  );

  return (
    <div className="@container space-y-6 font-sans">
      {cabecera}
      {/* Estados contables */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Estados contables</h2>
          <p className="text-xs text-ink/50">
            {vertical
              ? 'Análisis vertical: cada rubro como % del activo total (que es igual a pasivo + patrimonio) y cada resultado como % de las ventas. La variación muestra cuánto cambió el peso, en puntos porcentuales.'
              : entrada
                ? 'Las cifras del balance que alimentan todos los ratios. Son las únicas que hace falta verificar contra el documento; los ratios salen de acá.'
                : 'Valores en miles de pesos.'}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-ink/15 bg-white p-1">
          {([['Valores absolutos', 'absolutos'], ['Análisis vertical', 'vertical'], ['Datos de entrada', 'entrada']] as const).map(([label, m]) => (
            <button
              key={label}
              onClick={() => setModo(m)}
              disabled={editing && m !== 'absolutos'}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${(editing ? 'absolutos' : modo) === m ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink disabled:opacity-40'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {entrada && <DatosEntrada extraction={extraction} />}

      {/* Dos columnas solo con espacio suficiente; misma altura para que los bordes inferiores coincidan */}
      <div className={`grid grid-cols-1 @5xl:grid-cols-2 gap-6 items-stretch ${entrada ? 'hidden' : ''}`}>
        <Statement
          title="Situación patrimonial"
          sections={ESP}
          extraction={extraction}
          ratios={ratios}
          base={y => y.estado_situacion_patrimonial.total_activo}
          baseLabel="activo total (= pasivo + patrimonio)"
          vertical={vertical}
          badge={balanceBadge}
        />
        <Statement
          title="Estado de resultados"
          sections={ER}
          extraction={extraction}
          ratios={ratios}
          base={y => y.estado_resultados.ventas_netas}
          baseLabel="ventas netas"
          vertical={vertical}
        />
      </div>

      {/* Ratios */}
      <div className="pt-2">
        <h2 className="font-display text-xl font-semibold">Ratios por bloque</h2>
        <p className="text-xs text-ink/50">
          Semáforo según la política de riesgos. Montos en miles de $; en ratios porcentuales, la variación está en puntos porcentuales.
        </p>
      </div>

      {perfil.modelo === 'financiera' && <FinancieraDatos extraction={extraction} documentos={documentos} perfil={perfil} />}

      {/* Anexo de bienes de uso (si el balance lo trae) */}
      {extraction.anexo_bienes_de_uso && extraction.anexo_bienes_de_uso.length > 0 && (
        <section className="bg-white border border-ink/15">
          <header className="px-5 py-4 border-b border-ink/10">
            <h3 className="font-display text-base font-semibold">Anexo de bienes de uso</h3>
            <p className="text-xs text-ink/50">Valor residual al cierre del ejercicio actual. Miles de $.</p>
          </header>
          <ul className="divide-y divide-ink/5 text-sm">
            {extraction.anexo_bienes_de_uso.map((b, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-2">
                <EditableText path={['anexo_bienes_de_uso', i, 'rubro']} value={b.rubro} />
                <span className="tabular-nums font-medium">
                  <EditableNumber path={['anexo_bienes_de_uso', i, 'valor_residual']} value={b.valor_residual} display={b.valor_residual === null ? '—' : fmtNum(b.valor_residual, 0)} inputClassName="w-28" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Columnas tipo mampostería: cada columna apila sus tarjetas sin huecos */}
      <div className="columns-1 @5xl:columns-2 gap-x-6">
        {bloquesDelPerfil(perfil).map(block => {
          const rows = block.ratios.filter(spec => ratios[spec.key]);
          const conteo = pendienteRubro ? [] : (['critical', 'alert', 'healthy'] as RatioStatus[])
            .map(st => ({ st, n: rows.filter(r => !r.noAplica && ratios[r.key].status === st).length }))
            .filter(c => c.n > 0);
          if (block.colapsado) {
            if (rows.length === 0) return null;
            return (
              <details key={block.bloque} className="bg-white border border-ink/15 mb-6 break-inside-avoid group">
                <summary className="px-5 py-4 cursor-pointer select-none flex items-center justify-between gap-3">
                  <span>
                    <span className="font-display text-base font-semibold">{block.bloque}</span>
                    <span className="block text-xs text-ink/50">{block.descripcion} ({rows.length})</span>
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/45">No aplica</span>
                </summary>
                <ul className="divide-y divide-ink/5 border-t border-ink/10 text-sm">
                  {rows.map(spec => (
                    <li key={spec.key} className="px-5 py-2 flex items-start justify-between gap-4">
                      <span>
                        {spec.name}
                        <span className="block text-[11px] text-ink/40">{spec.noAplica}</span>
                      </span>
                      <span className="tabular-nums text-ink/50 whitespace-nowrap">{fmtRatio(ratios[spec.key].actual, spec.kind)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          }
          return (
            <section key={block.bloque} className="bg-white border border-ink/15 mb-6 break-inside-avoid">
              <header className="px-5 py-4 border-b border-ink/10 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold">{block.bloque}</h3>
                  <p className="text-xs text-ink/50">{block.descripcion}</p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {conteo.map(({ st, n }) => (
                    <StatusBadge key={st} status={RATIO_STATUS[st].status} label={`${n} ${RATIO_STATUS[st].label.toLowerCase()}`} />
                  ))}
                </div>
              </header>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-ink/50">
                    <th className="text-left font-semibold px-5 py-2.5">Indicador</th>
                    <th className="text-right font-semibold px-2 py-2.5">{anioAnt}</th>
                    <th className="text-right font-semibold px-2 py-2.5">{anioAct}</th>
                    <th className="text-right font-semibold px-2 py-2.5">Var.</th>
                    <th className="text-right font-semibold px-5 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {rows.map(spec => {
                    const r = ratios[spec.key];
                    const st = !pendienteRubro && !spec.noAplica && r.status ? RATIO_STATUS[r.status] : null;
                    const varValue = spec.kind === 'pct'
                      ? (r.actual !== null && r.anterior !== null ? (r.actual - r.anterior) * 100 : null)
                      : r.variacion_pct;
                    return (
                      <tr key={spec.key} className="hover:bg-ink/[0.02]" title={spec.formula}>
                        <td className="!text-left px-5 py-2.5" style={st ? { boxShadow: `inset 3px 0 0 ${STATUS[st.status]}` } : undefined}>
                          <RatioLink ratioKey={spec.key} className="text-ink">{spec.name}</RatioLink>
                          <span className="block text-[11px] text-ink/40 leading-snug">{spec.formula}</span>
                        </td>
                        <td className="px-2 py-2.5 tabular-nums text-ink/60 whitespace-nowrap">{fmtRatio(r.anterior, spec.kind)}</td>
                        <td className="px-2 py-2.5 tabular-nums font-semibold whitespace-nowrap">{fmtRatio(r.actual, spec.kind)}</td>
                        <td className="px-2 py-2.5 text-xs whitespace-nowrap"><Variation value={varValue} unit={spec.kind === 'pct' ? 'p.p.' : '%'} /></td>
                        <td className="px-5 py-2.5">
                          {spec.noAplica ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 whitespace-nowrap" title={spec.noAplica}>No aplica</span>
                          ) : st ? (
                            <StatusBadge status={st.status} label={st.label} />
                          ) : pendienteRubro && r.status ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/35 bg-ink/[0.05] px-1.5 py-0.5 rounded-sm whitespace-nowrap" title="Confirmá el rubro para ver el semáforo">Pendiente de rubro</span>
                          ) : <span className="text-ink/25">—</span>}
                          {spec.noAplica && <span className="block text-[10px] text-ink/40 leading-snug max-w-[220px] ml-auto">{spec.noAplica}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, Building2, ChevronDown, FileSpreadsheet, Landmark, Loader2, ShieldCheck, ListChecks } from 'lucide-react';
import { ExtractionResult } from '../types';
import { RatioKey, RatioStatus } from '../features/ratios/calculations';
import { CATEGORY_LABEL, SEVERIDAD_LABEL } from '../features/risk/score';
import { stripRiskConclusion } from '../features/risk/summary';
import { formatCurrencyThousands } from '../lib/utils';
import { CATEGORY_STATUS, SEVERIDAD_STATUS, STATUS, Status, StatusBadge } from './riskColors';

// Resumen ejecutivo como "una carilla": lo más importante de todo el análisis
// en una sola vista, con enlaces a cada pestaña para el detalle.

type Props = {
  result: ExtractionResult;
  riskBusy: boolean;
  onOpenTab: (tab: string) => void;
  onGeneratePdf: () => void;
};

const POSTURA = {
  favorable: { label: 'Favorable', status: 'good' as Status },
  favorable_con_condiciones: { label: 'Favorable con condiciones', status: 'warning' as Status },
  desfavorable: { label: 'Desfavorable', status: 'critical' as Status },
};
const RATIO_STATUS: Record<RatioStatus, { status: Status; label: string }> = {
  healthy: { status: 'good', label: 'Sano' },
  alert: { status: 'warning', label: 'Alerta' },
  critical: { status: 'critical', label: 'Crítico' },
};

const fmtNum = (v: number, dec = 2) => v.toLocaleString('es-AR', { maximumFractionDigits: dec });
const money = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatCurrencyThousands(v));
const variation = (a: number | null | undefined, b: number | null | undefined) =>
  a === null || a === undefined || b === null || b === undefined || b === 0 ? null : ((a - b) / Math.abs(b)) * 100;

// ---------- Piezas ----------

const Block = ({ title, icon: Icon, tab, onOpenTab, children, className = '' }: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  tab?: string;
  onOpenTab: (tab: string) => void;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={`bg-white border border-ink/15 p-5 ${className}`}>
    <div className="flex items-center justify-between mb-4">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink/70">
        {Icon && <Icon className="w-4 h-4" />}
        {title}
      </h3>
      {tab && (
        <button onClick={() => onOpenTab(tab)} className="text-xs font-medium text-ink/50 hover:text-ink inline-flex items-center gap-1">
          Ver detalle <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
    {children}
  </section>
);

const Trend = ({ value, suffix = 'interanual', invert = false }: { value: number | null; suffix?: string; invert?: boolean }) => {
  if (value === null) return <span className="text-[11px] text-ink/40">Sin comparativo</span>;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span className="text-[11px] text-ink/60 inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: good ? STATUS.good : STATUS.critical }} />
      {value > 0 ? '+' : ''}{fmtNum(value, 1)}% {suffix}
    </span>
  );
};

const Figure = ({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) => (
  <div className="p-3 border border-ink/10">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 mb-1">{label}</p>
    <p className="text-lg font-semibold tabular-nums text-ink leading-tight">{value}</p>
    <div className="mt-1">{sub}</div>
  </div>
);

// ---------- Vista ----------

export function ExecutiveSummaryView({ result, riskBusy, onOpenTab, onGeneratePdf }: Props) {
  const [showSynthesis, setShowSynthesis] = useState(false);
  const extraction = result.extraction!;
  const ratios = result.ratios!;
  const risk = result.riskAssessment;
  const history = result.companyHistory;
  const nosis = extraction.extraccion_nosis;
  const er = extraction.ejercicio_actual.estado_resultados;
  const erAnt = extraction.ejercicio_anterior?.estado_resultados;
  const esp = extraction.ejercicio_actual.estado_situacion_patrimonial;
  const espAnt = extraction.ejercicio_anterior?.estado_situacion_patrimonial;

  // Ventas post balance: variación interanual de los meses con comparativo.
  const meses = (extraction.analisis_post_cierre?.detalle_ventas_mensuales ?? []).filter(v => v.monto_anio_anterior);
  const ventasPostVar = meses.length
    ? variation(meses.reduce((a, v) => a + v.monto, 0), meses.reduce((a, v) => a + (v.monto_anio_anterior ?? 0), 0))
    : null;
  const ventasPostTotal = extraction.analisis_post_cierre?.total_ventas_post_cierre ?? null;

  const indicadores: Array<{ key: RatioKey; label: string; kind: 'x' | 'pct' }> = [
    { key: 'dscr', label: 'DSCR', kind: 'x' },
    { key: 'deuda_neta_ebitda', label: 'Deuda neta / EBITDA', kind: 'x' },
    { key: 'cobertura_intereses', label: 'Cobertura de intereses', kind: 'x' },
    { key: 'calidad_ganancia', label: 'Calidad de la ganancia', kind: 'pct' },
    { key: 'liquidez_corriente', label: 'Liquidez corriente', kind: 'x' },
    { key: 'liquidez_acida', label: 'Prueba ácida', kind: 'x' },
    { key: 'solvencia', label: 'Solvencia', kind: 'x' },
    { key: 'roe', label: 'ROE', kind: 'pct' },
  ];
  const fmtRatio = (v: number | null | undefined, kind: 'x' | 'pct') =>
    v === null || v === undefined || !Number.isFinite(v) ? '—' : kind === 'pct' ? `${fmtNum(v * 100, 1)}%` : `${fmtNum(v, 2)}x`;

  const peor = nosis?.situacion_bcra_peor_estado ?? null;
  const peor24 = nosis?.peor_situacion_24_meses ?? null;
  const sitStatus = (s: number | null): Status => (s === null || s <= 1 ? 'good' : s === 2 ? 'warning' : s === 3 ? 'serious' : 'critical');
  const cross = result.crossCheck;

  return (
    <div className="@container space-y-5 font-sans">
      {/* 1. Dictamen de riesgo */}
      <section className="bg-ink text-white p-6 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-green" />
        {risk ? (
          <div className="grid grid-cols-1 @2xl:grid-cols-[auto_1fr] gap-6 items-center">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Riesgo</p>
                <p className="font-display text-5xl font-semibold leading-none tabular-nums">
                  {risk.puntaje.final}<span className="text-base font-normal text-white/50">/100</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <span
                  className="inline-flex px-2 py-0.5 rounded-sm text-xs font-bold uppercase tracking-wider text-ink"
                  style={{ backgroundColor: STATUS[CATEGORY_STATUS[risk.puntaje.categoria]] }}
                >
                  {CATEGORY_LABEL[risk.puntaje.categoria]}
                </span>
                {risk.opinion.postura && (
                  <p className="text-xs text-white/80">Postura: <strong className="text-white">{POSTURA[risk.opinion.postura].label}</strong></p>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm leading-relaxed text-white/90 line-clamp-4">{risk.opinion.dictamen}</p>
              <button onClick={() => onOpenTab('Opinión de riesgos')} className="mt-2 text-xs font-medium text-brand-green hover:underline inline-flex items-center gap-1">
                Ver opinión de riesgos completa <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/70 inline-flex items-center gap-2">
            {riskBusy ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando la opinión de riesgo...</> : 'Este caso todavía no tiene opinión de riesgo.'}
            {!riskBusy && (
              <button onClick={() => onOpenTab('Opinión de riesgos')} className="text-brand-green hover:underline">Generarla</button>
            )}
          </p>
        )}
      </section>

      {/* 2. Qué hace la empresa */}
      <Block title="Qué hace la empresa" icon={Building2} tab="Historia y actividad de la empresa" onOpenTab={onOpenTab}>
        <p className="text-sm leading-relaxed text-body line-clamp-4">
          {history?.core_business || extraction.company_profile.activity || 'Sin descripción de la actividad.'}
        </p>
      </Block>

      {/* 3. Cifras clave */}
      <Block title="Cifras clave (miles de $)" tab="Balance y Ratios" onOpenTab={onOpenTab}>
        <div className="grid grid-cols-2 @3xl:grid-cols-3 gap-3">
          <Figure label="Ventas netas" value={money(er.ventas_netas)} sub={<Trend value={variation(er.ventas_netas, erAnt?.ventas_netas)} />} />
          <Figure
            label="EBITDA"
            value={money(ratios.ebitda.actual)}
            sub={<span className="text-[11px] text-ink/60">Margen {fmtRatio(ratios.margen_ebitda.actual, 'pct')}</span>}
          />
          <Figure
            label="Resultado neto"
            value={money(er.resultado_neto)}
            sub={<span className="text-[11px] text-ink/60">Margen {fmtRatio(ratios.margen_neto.actual, 'pct')}</span>}
          />
          <Figure
            label="Deuda bancaria"
            value={money(ratios.deuda_bancaria_total.actual)}
            sub={<Trend value={ratios.deuda_bancaria_total.variacion_pct} invert />}
          />
          <Figure label="Patrimonio neto" value={money(esp.patrimonio_neto)} sub={<Trend value={variation(esp.patrimonio_neto, espAnt?.patrimonio_neto)} />} />
          <Figure
            label="Ventas post balance"
            value={ventasPostTotal ? money(ventasPostTotal) : '—'}
            sub={ventasPostTotal ? <Trend value={ventasPostVar} suffix="vs. año anterior" /> : <span className="text-[11px] text-ink/40">Sin información</span>}
          />
        </div>
      </Block>

      {/* 4. Indicadores clave */}
      <Block title="Indicadores clave" tab="Balance y Ratios" onOpenTab={onOpenTab}>
        <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
          {indicadores.map(({ key, label, kind }) => {
            const r = ratios[key];
            const st = r?.status ? RATIO_STATUS[r.status] : null;
            return (
              <div key={key} className="p-3 border border-ink/10" style={st ? { borderLeft: `3px solid ${STATUS[st.status]}` } : undefined}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 mb-1">{label}</p>
                <p className="text-lg font-semibold tabular-nums text-ink leading-tight">{fmtRatio(r?.actual, kind)}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink/45 tabular-nums">Ant. {fmtRatio(r?.anterior, kind)}</span>
                  {st && <StatusBadge status={st.status} label={st.label} />}
                </div>
              </div>
            );
          })}
        </div>
      </Block>

      {/* 5. Sistema financiero */}
      <Block title="Sistema financiero" icon={Landmark} tab="Sistema Financiero (Nosis)" onOpenTab={onOpenTab}>
        {nosis ? (
          <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 mb-1">Score Nosis</p>
              <p className="text-lg font-semibold tabular-nums">{nosis.score_crediticio ?? '—'}</p>
              {risk?.pce_proxy !== null && risk?.pce_proxy !== undefined && (
                <p className="text-[11px] text-ink/60">Pérdida esperada {risk.pce_proxy}/100</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 mb-1.5">Situación BCRA</p>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={sitStatus(peor)} label={`Hoy ${peor ?? '—'}`} />
                {peor24 !== null && <StatusBadge status={sitStatus(peor24)} label={`24 m: ${peor24}`} />}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 mb-1">Cheques rechazados</p>
              <p className="text-lg font-semibold tabular-nums">{nosis.cheques_rechazados_cantidad ?? 0}</p>
              {(nosis.cheques_rechazados_cantidad ?? 0) > 0 && (
                <p className="text-[11px] text-ink/60">{money(nosis.cheques_rechazados_monto)}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 mb-1.5">Deuda balance vs. Nosis</p>
              {cross && cross.nosis_debt !== null ? (
                <>
                  <StatusBadge status={cross.match ? 'good' : 'critical'} label={cross.match ? 'Consistente' : 'Discrepancia'} />
                  <p className="text-[11px] text-ink/60 mt-1 tabular-nums">
                    {money(cross.balance_debt)} vs. {money(cross.nosis_debt)}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-ink/40">Sin dato de Nosis</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink/50 italic">No se recibió informe Nosis.</p>
        )}
      </Block>

      {/* 6. Riesgos, fortalezas y condiciones */}
      {risk && (
        <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-5">
          <Block title="Principales riesgos" tab="Opinión de riesgos" onOpenTab={onOpenTab}>
            <ul className="space-y-2.5">
              {risk.opinion.riesgos.slice(0, 4).map((r, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <StatusBadge status={SEVERIDAD_STATUS[r.severidad]} label={SEVERIDAD_LABEL[r.severidad]} />
                  <span className="text-sm text-ink leading-snug">{r.titulo}</span>
                </li>
              ))}
              {risk.opinion.riesgos.length === 0 && <li className="text-sm text-ink/50 italic">Sin riesgos relevantes.</li>}
            </ul>
          </Block>
          <Block title="Fortalezas y condiciones" icon={ShieldCheck} onOpenTab={onOpenTab}>
            <ul className="space-y-2 mb-4">
              {risk.opinion.fortalezas.slice(0, 3).map((f, i) => (
                <li key={i} className="text-sm text-ink leading-snug flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: STATUS.good }} />
                  {f}
                </li>
              ))}
            </ul>
            {risk.opinion.condiciones_sugeridas.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 mb-2 flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" /> Condiciones sugeridas
                </p>
                <ul className="space-y-1.5">
                  {risk.opinion.condiciones_sugeridas.slice(0, 3).map((c, i) => (
                    <li key={i} className="text-sm text-body leading-snug pl-3 border-l-2 border-ink/15">{c}</li>
                  ))}
                </ul>
              </>
            )}
          </Block>
        </div>
      )}

      {/* 7. Síntesis del analista IA */}
      {result.verification?.executive_summary && (
        <section className="bg-white border border-ink/15 p-5">
          <button
            onClick={() => setShowSynthesis(v => !v)}
            className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink/70"
          >
            Síntesis del análisis
            <ChevronDown className={`w-4 h-4 transition-transform ${showSynthesis ? 'rotate-180' : ''}`} />
          </button>
          <div className={`mt-3 prose prose-sm max-w-none text-left text-body prose-p:mb-3 ${showSynthesis ? '' : 'line-clamp-3'}`}>
            <ReactMarkdown>{stripRiskConclusion(result.verification.executive_summary)}</ReactMarkdown>
          </div>
        </section>
      )}

      {/* Informe */}
      <div className="flex flex-col items-center justify-center pt-4">
        <button
          onClick={onGeneratePdf}
          className="bg-brand-green text-ink px-8 py-4 rounded-full text-sm font-semibold hover:brightness-95 transition flex items-center gap-3 shadow-sm"
        >
          <FileSpreadsheet className="w-5 h-5" />
          Generar informe para comité
        </button>
        <p className="text-xs text-ink/50 mt-3">Portada con el dictamen, este resumen y el detalle de cada sección</p>
      </div>
    </div>
  );
}

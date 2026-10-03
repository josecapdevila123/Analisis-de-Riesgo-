import React from 'react';
import { BookOpen, ClipboardList, Cpu, Gauge, Hourglass, Scale, Sigma, X } from 'lucide-react';
import {
  DIMENSION_WEIGHTS,
  MODEL_CRITERIA,
  PCE_TRAMOS,
  PENDING_ITEMS,
  POLICY_STATUS,
  RATIO_ASSUMPTIONS,
  RATIO_THRESHOLDS,
  RatioThreshold,
  SCORE_BANDS,
  SIGNAL_RULES,
} from '../features/risk/policy';
import { CATEGORY_LABEL, categoryOf, SEVERIDAD_LABEL } from '../features/risk/score';
import { RiskDimension, SeveridadRiesgo } from '../features/extraction/schemas';
import { CATEGORY_STATUS, SEVERIDAD_STATUS, STATUS, StatusBadge, tint } from './riskColors';

// Página de política de riesgos: muestra los umbrales TAL CUAL los usa el código
// (src/features/risk/policy.ts), para revisarlos y definirlos con el área de Riesgos.

const fmtNum = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
const fmtThreshold = (v: number, unidad: RatioThreshold['unidad']) =>
  unidad === '%' ? `${fmtNum(v * 100)}%` : `${fmtNum(v)}x`;

const Section = ({ n, title, icon: Icon, children }: {
  n: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) => (
  <section className="bg-white border border-[#141414] p-6 print:break-inside-avoid">
    <h3 className="flex items-center gap-3 text-base font-bold uppercase tracking-widest mb-5 text-[#141414]">
      <span className="w-7 h-7 flex items-center justify-center bg-[#141414] text-[#E4E3E0] text-xs font-mono">{n}</span>
      <Icon className="w-4 h-4 opacity-60" />
      {title}
    </h3>
    {children}
  </section>
);

const th = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#141414]/70 bg-[#F0EFED] border-b border-[#141414]/15';
const td = 'px-3 py-2.5 align-top border-b border-[#141414]/10';

const severidadBadge = (sev: SeveridadRiesgo | 'media / alta') =>
  sev === 'media / alta' ? (
    <span className="inline-flex gap-1">
      <StatusBadge status="warning" label="Media" />
      <StatusBadge status="serious" label="Alta" />
    </span>
  ) : (
    <StatusBadge status={SEVERIDAD_STATUS[sev]} label={SEVERIDAD_LABEL[sev]} />
  );

export function RiskPolicyView({ onClose }: { onClose: () => void }) {
  const maxPeso = Math.max(...Object.values(DIMENSION_WEIGHTS).map(d => d.weight));
  const reglasPorDimension = (Object.keys(DIMENSION_WEIGHTS) as RiskDimension[])
    .map(dim => ({ dim, reglas: SIGNAL_RULES.filter(r => r.dimension === dim) }))
    .filter(g => g.reglas.length > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8 font-sans pb-12">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#141414]/50 mb-1">Documento de trabajo</p>
          <h1 className="text-3xl font-bold text-[#141414]">Política de riesgos</h1>
          <p className="text-sm text-[#141414]/70 mt-2 max-w-2xl leading-relaxed">
            Umbrales, reglas y pesos que usa el sistema para la Opinión de riesgos. Esta página lee los mismos valores que el
            código, así que lo que se ve acá es exactamente lo que se aplica.
          </p>
          <div className="mt-3">
            <span
              className="inline-flex items-center gap-2 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#141414] border"
              style={{ borderColor: STATUS.warning, backgroundColor: tint(STATUS.warning, 0.15) }}
            >
              <Hourglass className="w-3.5 h-3.5" /> {POLICY_STATUS}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 border border-[#141414] text-xs font-bold uppercase hover:bg-[#141414] hover:text-[#E4E3E0] transition-all print:hidden"
        >
          <X className="w-4 h-4" /> Cerrar
        </button>
      </div>

      {/* 1. Cómo se calcula */}
      <Section n={1} title="Cómo se calcula el puntaje" icon={Gauge}>
        <ol className="text-sm text-[#141414] space-y-2 list-decimal pl-5 mb-6 leading-relaxed">
          <li><strong>Reglas fijas</strong> detectan señales objetivas (sección 4). Las graves fijan un <strong>piso</strong>: el puntaje final no puede quedar por debajo.</li>
          <li>El <strong>modelo</strong> lee toda la información y puntúa cada dimensión de 1 (riesgo mínimo) a 100 (máximo).</li>
          <li>El <strong>sistema</strong> pondera las dimensiones con los pesos de abajo (las que no tienen datos no cuentan) y aplica el piso más alto.</li>
        </ol>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#141414]/60 mb-3">Bandas de la escala</h4>
            <div className="flex h-9 rounded-sm overflow-hidden gap-[2px] bg-white">
              {SCORE_BANDS.map((b, i) => {
                const desde = i === 0 ? 1 : SCORE_BANDS[i - 1].hasta + 1;
                const ancho = b.hasta - (i === 0 ? 0 : SCORE_BANDS[i - 1].hasta);
                return (
                  <div
                    key={b.categoria}
                    className="flex items-center justify-center text-[11px] font-bold text-[#141414]"
                    style={{ width: `${ancho}%`, backgroundColor: tint(STATUS[CATEGORY_STATUS[b.categoria]], 0.55) }}
                    title={`${desde}–${b.hasta}`}
                  >
                    {desde}–{b.hasta}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {SCORE_BANDS.map(b => (
                <StatusBadge key={b.categoria} status={CATEGORY_STATUS[b.categoria]} label={CATEGORY_LABEL[b.categoria]} />
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#141414]/60 mb-3">Peso de cada dimensión</h4>
            <div className="space-y-2.5">
              {(Object.keys(DIMENSION_WEIGHTS) as RiskDimension[]).map(dim => {
                const { label, weight } = DIMENSION_WEIGHTS[dim];
                return (
                  <div key={dim} className="grid grid-cols-[1fr_auto] gap-x-3 items-center">
                    <span className="text-sm text-[#141414]">{label}</span>
                    <span className="text-sm font-mono font-bold tabular-nums text-[#141414]">{weight}%</span>
                    <div className="col-span-2 h-2 rounded-sm bg-[#141414]/[0.06] overflow-hidden">
                      <div className="h-full rounded-r bg-[#141414]/70" style={{ width: `${(weight / maxPeso) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* 2. Semáforo de ratios */}
      <Section n={2} title="Semáforo de ratios" icon={Scale}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={`${th} !text-left`}>Ratio</th>
                <th className={th}><StatusBadge status="good" label="Sano" /></th>
                <th className={th}><StatusBadge status="warning" label="Alerta" /></th>
                <th className={th}><StatusBadge status="critical" label="Crítico" /></th>
                <th className={`${th} !text-left`}>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(RATIO_THRESHOLDS).map((t: RatioThreshold) => {
                const s = fmtThreshold(t.sano, t.unidad);
                const a = fmtThreshold(t.alerta, t.unidad);
                const [sano, alerta, critico] = t.mejorSi === 'mayor'
                  ? [`> ${s}`, `${a} – ${s}`, `< ${a}`]
                  : [`≤ ${s}`, `${s} – ${a}`, `> ${a}`];
                return (
                  <tr key={t.label}>
                    <td className={`${td} !text-left font-semibold text-[#141414]`}>{t.label}</td>
                    <td className={`${td} font-mono`}>{sano}</td>
                    <td className={`${td} font-mono`}>{alerta}</td>
                    <td className={`${td} font-mono`}>{critico}</td>
                    <td className={`${td} !text-left text-xs text-[#141414]/60`}>{t.nota ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. Supuestos */}
      <Section n={3} title="Supuestos de cálculo" icon={Sigma}>
        <ul className="space-y-2 text-sm text-[#141414] list-disc pl-5 leading-relaxed">
          {RATIO_ASSUMPTIONS.map(a => <li key={a}>{a}</li>)}
        </ul>
      </Section>

      {/* 4. Señales automáticas */}
      <Section n={4} title="Señales automáticas (reglas fijas)" icon={Cpu}>
        <div className="space-y-6">
          {reglasPorDimension.map(({ dim, reglas }) => (
            <div key={dim}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#141414]/60 mb-2">{DIMENSION_WEIGHTS[dim].label}</h4>
              <table className="w-full text-sm">
                <tbody>
                  {reglas.map(r => (
                    <tr key={r.regla}>
                      <td className={`${td} !text-left text-[#141414]`}>{r.regla}</td>
                      <td className={`${td} w-44`}>{severidadBadge(r.severidad)}</td>
                      <td className={`${td} w-24 font-mono font-bold text-[#141414] whitespace-nowrap`}>
                        {r.piso !== null ? (
                          <span title={`Puntaje mínimo: ${r.piso} (${CATEGORY_LABEL[categoryOf(r.piso)]})`}>piso {r.piso}</span>
                        ) : (
                          <span className="text-[#141414]/30 font-normal">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Section>

      {/* 5. Pérdida esperada */}
      <Section n={5} title="Pérdida esperada (proxy por score Nosis)" icon={BookOpen}>
        <p className="text-sm text-[#141414]/70 mb-5 leading-relaxed">
          Transitorio, hasta tener la pérdida crediticia esperada propia. Relación inversa y no lineal: a más score, menos pérdida,
          y cada punto de score pesa más en la zona media-baja. Índice relativo 0–100, no es un porcentaje de pérdida.
        </p>
        <div className="space-y-2">
          {PCE_TRAMOS.map((t, i) => {
            const hasta = i === 0 ? 999 : PCE_TRAMOS[i - 1].desde - 1;
            const status = CATEGORY_STATUS[categoryOf(Math.max(1, t.pce))];
            return (
              <div key={t.desde} className="grid grid-cols-[110px_1fr_40px] items-center gap-3">
                <span className="text-xs font-mono text-[#141414]/70 text-right">Score {t.desde}–{hasta}</span>
                <div className="h-4 rounded-sm bg-[#141414]/[0.06] overflow-hidden">
                  <div className="h-full rounded-r" style={{ width: `${t.pce}%`, backgroundColor: STATUS[status] }} />
                </div>
                <span className="text-sm font-mono font-bold tabular-nums text-[#141414]">{t.pce}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 6. Criterios del modelo */}
      <Section n={6} title="Criterios que evalúa el modelo (sin regla fija)" icon={ClipboardList}>
        <ul className="space-y-2 text-sm text-[#141414] list-disc pl-5 leading-relaxed">
          {MODEL_CRITERIA.map(c => <li key={c}>{c}</li>)}
        </ul>
      </Section>

      {/* 7. Pendientes */}
      <Section n={7} title="Pendientes: requieren datos que hoy no entran a la app" icon={Hourglass}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PENDING_ITEMS.map(p => (
            <div key={p.tema} className="border border-dashed border-[#141414]/30 p-4">
              <p className="text-sm font-bold text-[#141414] mb-1">{p.tema}</p>
              <p className="text-xs text-[#141414]/70 leading-relaxed">{p.detalle}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

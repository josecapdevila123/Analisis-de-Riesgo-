import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  FileSearch,
  ListChecks,
  Cpu,
} from 'lucide-react';
import { RiskAssessment } from '../features/risk/assessment';
import { CATEGORY_LABEL, DIMENSIONS, RiskCategory, SEVERIDAD_LABEL, categoryOf } from '../features/risk/score';
import { RiskDimension, SeveridadRiesgo } from '../features/extraction/schemas';
import { cn } from '../lib/utils';

// Paleta de estados (fija, reservada para estado): bueno / advertencia / serio / crítico.
// Siempre va acompañada de ícono + etiqueta; el texto queda en tinta, nunca en el color.
const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;
type Status = keyof typeof STATUS;

const CATEGORY_STATUS: Record<RiskCategory, Status> = {
  bajo: 'good', moderado: 'warning', alto: 'serious', critico: 'critical',
};
const SEVERIDAD_STATUS: Record<SeveridadRiesgo, Status> = {
  baja: 'good', media: 'warning', alta: 'serious', critica: 'critical',
};
const STATUS_ICON: Record<Status, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  good: CheckCircle2, warning: AlertCircle, serious: AlertTriangle, critical: AlertOctagon,
};

const POSTURA = {
  favorable: { label: 'Favorable', icon: ShieldCheck, status: 'good' as Status },
  favorable_con_condiciones: { label: 'Favorable con condiciones', icon: ShieldAlert, status: 'warning' as Status },
  desfavorable: { label: 'Desfavorable', icon: ShieldAlert, status: 'critical' as Status },
};

const tint = (hex: string, alpha: number) => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

const StatusBadge = ({ status, label }: { status: Status; label: string }) => {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-bold uppercase tracking-wider text-[#141414]"
      style={{ backgroundColor: tint(STATUS[status], 0.18) }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: STATUS[status] }} />
      {label}
    </span>
  );
};

// ---------- Velocímetro 1–100 ----------

const BANDS: Array<{ from: number; to: number; status: Status }> = [
  { from: 0, to: 25, status: 'good' },
  { from: 25, to: 50, status: 'warning' },
  { from: 50, to: 75, status: 'serious' },
  { from: 75, to: 100, status: 'critical' },
];

const CX = 120, CY = 118, R = 92, STROKE = 20;
const point = (value: number, radius = R) => {
  const a = Math.PI - (value / 100) * Math.PI;
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) };
};
const arc = (from: number, to: number) => {
  const p1 = point(from);
  const p2 = point(to);
  return `M ${p1.x} ${p1.y} A ${R} ${R} 0 0 1 ${p2.x} ${p2.y}`;
};

const RiskGauge = ({ score }: { score: number }) => {
  const needle = point(score, R - STROKE / 2 - 10);
  const tip = point(score, R + STROKE / 2 + 2);
  const status = CATEGORY_STATUS[categoryOf(score)];
  return (
    <svg viewBox="0 0 240 172" className="w-full max-w-[300px]" role="img" aria-label={`Puntaje de riesgo ${score} de 100`}>
      {BANDS.map(b => (
        // 0,8 de separación entre bandas = espacio de superficie entre segmentos
        <path
          key={b.from}
          d={arc(b.from + (b.from === 0 ? 0 : 0.8), b.to - (b.to === 100 ? 0 : 0.8))}
          fill="none"
          stroke={STATUS[b.status]}
          strokeWidth={STROKE}
          opacity={b.status === status ? 1 : 0.28}
        />
      ))}
      {[0, 25, 50, 75, 100].map(v => {
        const p = point(v, R + STROKE / 2 + 9);
        return (
          <text key={v} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#14141499" fontFamily="JetBrains Mono, monospace">
            {v}
          </text>
        );
      })}
      <line x1={CX} y1={CY} x2={needle.x} y2={needle.y} stroke="#141414" strokeWidth="3" strokeLinecap="round" />
      <circle cx={tip.x} cy={tip.y} r="4" fill="#141414" stroke="#fff" strokeWidth="2" />
      <circle cx={CX} cy={CY} r="6" fill="#141414" />
      {/* Número debajo del eje para que la aguja nunca lo tape */}
      <text x={CX} y={CY + 44} textAnchor="middle" fontSize="40" fontWeight="700" fill="#141414" fontFamily="Poppins, sans-serif">
        {score}
      </text>
    </svg>
  );
};

// ---------- Barras ----------

const ScoreBar = ({ value }: { value: number }) => {
  const status = CATEGORY_STATUS[categoryOf(value)];
  return (
    <div className="relative h-3 w-full rounded-sm bg-[#141414]/[0.06] overflow-hidden">
      {/* marcas de banda en 25/50/75 */}
      {[25, 50, 75].map(t => (
        <div key={t} className="absolute top-0 bottom-0 w-px bg-white" style={{ left: `${t}%` }} />
      ))}
      <div
        className="absolute left-0 top-0 bottom-0 rounded-r"
        style={{ width: `${value}%`, backgroundColor: STATUS[status] }}
      />
    </div>
  );
};

const Card = ({ title, icon: Icon, children, className }: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('bg-white border border-[#141414] p-6', className)}>
    <h3 className="flex items-center gap-2 text-base font-bold uppercase tracking-widest mb-5 text-[#141414]">
      {Icon && <Icon className="w-4 h-4 opacity-60" />}
      {title}
    </h3>
    {children}
  </div>
);

// ---------- Vista ----------

interface RiskOpinionViewProps {
  assessment: RiskAssessment | null;
  isGenerating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  editedAt?: string;
}

export function RiskOpinionView({ assessment, isGenerating, canGenerate, onGenerate, editedAt }: RiskOpinionViewProps) {
  const generateButton = (label: string) => (
    <button
      onClick={onGenerate}
      disabled={!canGenerate || isGenerating}
      className="inline-flex items-center gap-2 px-4 py-2 border border-[#141414] text-xs font-bold uppercase hover:bg-[#141414] hover:text-[#E4E3E0] transition-all disabled:opacity-40 disabled:pointer-events-none"
    >
      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      {label}
    </button>
  );

  if (!assessment) {
    return (
      <div className="bg-white border border-[#141414] p-12 text-center font-sans space-y-4">
        {isGenerating ? (
          <p className="inline-flex items-center gap-2 text-sm font-mono text-[#141414]/70">
            <Loader2 className="w-4 h-4 animate-spin" />
            Integrando ratios, Memoria, mercado, post balance, deuda y Nosis...
          </p>
        ) : (
          <>
            <ShieldQuestion className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm text-[#141414]/70">Este caso todavía no tiene opinión de riesgo.</p>
            {generateButton('Generar opinión de riesgo')}
          </>
        )}
      </div>
    );
  }

  const { opinion, senales, puntaje, pce_proxy } = assessment;
  const status = CATEGORY_STATUS[puntaje.categoria];
  const postura = opinion.postura ? POSTURA[opinion.postura] : null;
  const desactualizada = !!editedAt && editedAt > assessment.generado;

  const conteo = (['critica', 'alta', 'media', 'baja'] as SeveridadRiesgo[])
    .map(sev => ({ sev, n: opinion.riesgos.filter(r => r.severidad === sev).length }))
    .filter(c => c.n > 0);

  const dimensiones = (Object.keys(DIMENSIONS) as RiskDimension[]).map(dim => {
    const d = opinion.dimensiones.find(x => x.dimension === dim);
    return { dim, puntaje: d?.puntaje ?? null, comentario: d?.comentario ?? '' };
  });

  return (
    // Container queries: el ancho real depende de las barras laterales, no de la ventana.
    <div className="@container space-y-8 font-sans">
      {desactualizada && (
        <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 flex items-center justify-between gap-4">
          <span>Los valores se editaron después de generar esta opinión. Regenerala para que tome los datos nuevos.</span>
          {generateButton('Regenerar')}
        </div>
      )}

      {/* Encabezado: puntaje + dictamen */}
      <div className="bg-white border border-[#141414] relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-2" style={{ backgroundColor: STATUS[status] }} />
        <div className="grid grid-cols-1 @2xl:grid-cols-[minmax(220px,280px)_1fr] gap-6 p-6 pl-8 items-center">
          <div className="flex flex-col items-center">
            <RiskGauge score={puntaje.final} />
            <div className="-mt-1 flex flex-col items-center gap-2">
              <StatusBadge status={status} label={CATEGORY_LABEL[puntaje.categoria]} />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#141414]/50">
                Escala 1 (mínimo) – 100 (máximo)
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#141414]/60">Opinión de riesgo</h3>
              {postura && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#141414] border"
                  style={{ borderColor: STATUS[postura.status], backgroundColor: tint(STATUS[postura.status], 0.12) }}
                >
                  <postura.icon className="w-4 h-4" style={{ color: STATUS[postura.status] }} />
                  {postura.label}
                </span>
              )}
            </div>
            <p className="text-base leading-relaxed font-medium text-[#141414]">{opinion.dictamen}</p>
            {puntaje.piso && puntaje.ponderado !== null && puntaje.piso.piso > puntaje.ponderado && (
              <p className="text-xs text-[#141414]/70 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                El promedio de las dimensiones da {puntaje.ponderado}; el puntaje sube a {puntaje.final} por regla automática: <strong>{puntaje.piso.motivo}</strong>.
              </p>
            )}
            {conteo.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {conteo.map(({ sev, n }) => (
                  <StatusBadge key={sev} status={SEVERIDAD_STATUS[sev]} label={`${n} ${SEVERIDAD_LABEL[sev]}${n > 1 ? 's' : ''}`} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 @4xl:grid-cols-[1fr_280px] gap-8">
        {/* Dimensiones */}
        <Card title="Riesgo por dimensión">
          <div className="space-y-5">
            {dimensiones.map(({ dim, puntaje: p, comentario }) => (
              <div key={dim} className="group" title={comentario}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-sm font-semibold text-[#141414]">
                    {DIMENSIONS[dim].label}
                    <span className="ml-2 text-[10px] font-mono text-[#141414]/40">peso {DIMENSIONS[dim].weight}%</span>
                  </span>
                  <span className="text-sm font-mono font-bold text-[#141414] tabular-nums">
                    {p === null ? 'Sin datos' : p}
                  </span>
                </div>
                {p === null ? (
                  <div className="h-3 w-full rounded-sm border border-dashed border-[#141414]/20" />
                ) : (
                  <ScoreBar value={p} />
                )}
                {comentario && <p className="text-xs text-[#141414]/60 mt-1.5 leading-relaxed">{comentario}</p>}
              </div>
            ))}
          </div>
        </Card>

        {/* Pérdida esperada (proxy) */}
        <div className="space-y-8">
          <Card title="Pérdida esperada">
            {pce_proxy === null ? (
              <p className="text-sm text-[#141414]/50 italic">Sin score Nosis.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl font-bold text-[#141414] tabular-nums">{pce_proxy}</span>
                  <span className="text-sm text-[#141414]/50">/ 100</span>
                </div>
                <ScoreBar value={pce_proxy} />
                <p className="text-[11px] text-[#141414]/60 mt-3 leading-relaxed">
                  Proxy transitorio basado en el score Nosis (1–999, más alto = mejor pagador). Índice relativo, no es un porcentaje de pérdida.
                </p>
              </>
            )}
          </Card>
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-[#141414]/50 uppercase tracking-wider">
              Generada el {new Date(assessment.generado).toLocaleString('es-AR')}
            </p>
            {generateButton('Regenerar opinión')}
          </div>
        </div>
      </div>

      {/* Lectura integral */}
      <Card title="Lectura integral" icon={FileSearch}>
        <p className="text-sm leading-relaxed text-justify text-[#141414] whitespace-pre-line">{opinion.lectura_integral}</p>
      </Card>

      {/* Riesgos detectados */}
      <Card title="Riesgos detectados" icon={AlertTriangle}>
        {opinion.riesgos.length === 0 ? (
          <p className="text-sm text-[#141414]/50 italic">No se detectaron riesgos relevantes.</p>
        ) : (
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
            {opinion.riesgos.map((r, i) => {
              const st = SEVERIDAD_STATUS[r.severidad];
              return (
                <div key={i} className="border border-[#141414]/15 border-l-4 p-4 space-y-2" style={{ borderLeftColor: STATUS[st] }}>
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-bold text-[#141414] leading-snug">{r.titulo}</h4>
                    <StatusBadge status={st} label={SEVERIDAD_LABEL[r.severidad]} />
                  </div>
                  {r.dimension && (
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[#141414]/40">{DIMENSIONS[r.dimension].label}</p>
                  )}
                  <p className="text-sm text-[#141414]/80 leading-relaxed">{r.evidencia}</p>
                  {r.mitigante && (
                    <p className="text-xs text-[#141414]/70 flex items-start gap-1.5 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: STATUS.good }} />
                      <span><strong>Mitigante:</strong> {r.mitigante}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Señales automáticas */}
      <Card title="Señales automáticas (reglas fijas)" icon={Cpu}>
        {senales.length === 0 ? (
          <p className="text-sm text-[#141414]/50 italic">Ninguna regla de alerta se disparó.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[#141414]/10">
              {senales.map(s => (
                <tr key={s.id}>
                  <td className="py-2.5 pr-3 align-top w-32"><StatusBadge status={SEVERIDAD_STATUS[s.severidad]} label={SEVERIDAD_LABEL[s.severidad]} /></td>
                  <td className="py-2.5 pr-3 align-top !text-left">
                    <span className="font-semibold text-[#141414]">{s.titulo}</span>
                    <span className="block text-xs text-[#141414]/60 mt-0.5">{s.detalle}</span>
                  </td>
                  <td className="py-2.5 align-top text-xs font-mono text-[#141414]/50 whitespace-nowrap">
                    {s.piso !== null ? `piso ${s.piso}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid grid-cols-1 @4xl:grid-cols-3 gap-8">
        <Card title="Fortalezas" icon={ShieldCheck}>
          <ItemList items={opinion.fortalezas} empty="Sin fortalezas destacadas." icon={CheckCircle2} color={STATUS.good} />
        </Card>
        <Card title="Condiciones sugeridas" icon={ListChecks}>
          <ItemList items={opinion.condiciones_sugeridas} empty="Sin condiciones sugeridas." icon={ListChecks} color="#141414" />
        </Card>
        <Card title="Información faltante" icon={FileSearch}>
          <ItemList items={opinion.informacion_faltante} empty="No falta información relevante." icon={Info} color="#14141480" />
        </Card>
      </div>
    </div>
  );
}

const ItemList = ({ items, empty, icon: Icon, color }: {
  items: string[];
  empty: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}) =>
  items.length === 0 ? (
    <p className="text-sm text-[#141414]/50 italic">{empty}</p>
  ) : (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-[#141414] leading-relaxed">
          <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
          {item}
        </li>
      ))}
    </ul>
  );

import React from 'react';
import {
  AlertTriangle,
  ArrowUpToLine,
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
import { EstadoPorton, SectorCaso, VERSION_PREVIA } from '../features/risk/porton';
import { perfilEfectivo } from '../features/risk/policy';
import { PerfilAviso } from './PerfilAviso';
import type { FuenteMora } from '../features/ratios/financieras';
import type { DocumentoSectorial } from '../features/sectorDocs/tipos';
import { CATEGORY_LABEL, DIMENSIONS, FormacionPuntaje, SEVERIDAD_LABEL, categoryOf, formacionPuntaje } from '../features/risk/score';
import { RiskDimension, SeveridadRiesgo } from '../features/extraction/schemas';
import { cn } from '../lib/utils';
import { CATEGORY_STATUS, SEVERIDAD_STATUS, STATUS, Status, StatusBadge, tint } from './riskColors';

const POSTURA = {
  favorable: { label: 'Favorable', icon: ShieldCheck, status: 'good' as Status },
  favorable_con_condiciones: { label: 'Favorable con condiciones', icon: ShieldAlert, status: 'warning' as Status },
  desfavorable: { label: 'Desfavorable', icon: ShieldAlert, status: 'critical' as Status },
};

// ---------- Escala continua 0–100 ----------
// Sin cortes de bandas dibujados: si la política cambia las bandas, el dibujo no
// cambia; la categoría llega como etiqueta. Muestra cómo se formó el puntaje:
// el promedio de las dimensiones y, si un piso lo subió, el tramo hasta el final.

const EscalaPuntaje = ({ f }: { f: FormacionPuntaje }) => {
  const pct = (v: number) => `${Math.min(100, Math.max(0, v))}%`;
  const promedioLejos = f.promedio !== null && Math.abs(f.final - f.promedio) >= 12;
  return (
    <div className="w-full" role="img" aria-label={f.subePorPiso ? `Promedio ${f.promedio}, puntaje final ${f.final} de 100 por piso` : `Puntaje ${f.final} de 100`}>
      <div className="relative h-7">
        {f.subePorPiso && f.promedio !== null && (
          <span className={cn('absolute bottom-0 text-[11px] text-ink/55 whitespace-nowrap', promedioLejos ? '-translate-x-1/2' : '-translate-x-full -ml-2')} style={{ left: pct(f.promedio) }}>
            Promedio {f.promedio}
          </span>
        )}
        <span className={cn('absolute bottom-0 text-[11px] font-semibold text-ink whitespace-nowrap', f.final > 85 ? '-translate-x-full' : f.subePorPiso && !promedioLejos ? 'ml-2' : '-translate-x-1/2')} style={{ left: pct(f.final) }}>
          Final {f.final}
        </span>
      </div>
      <div className="relative h-3 mt-1.5">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-ink/15" />
        {f.subePorPiso && f.promedio !== null && (
          <>
            <div className="absolute top-1/2 h-1 -translate-y-1/2 bg-ink/45" style={{ left: pct(f.promedio), width: `${f.final - f.promedio}%` }} />
            <div className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-ink/45" style={{ left: pct(f.promedio) }} />
          </>
        )}
        <div className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-white" style={{ left: pct(f.final) }} />
      </div>
      <div className="flex justify-between text-[11px] text-ink/40 tabular-nums mt-2">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  );
};

// ---------- Barras ----------

const ScoreBar = ({ value }: { value: number }) => {
  const status = CATEGORY_STATUS[categoryOf(value)];
  return (
    <div className="relative h-3 w-full rounded-sm bg-ink/[0.06] overflow-hidden">
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
  <div className={cn('bg-white border border-ink/15 p-6', className)}>
    <h3 className="flex items-center gap-2 text-base font-bold uppercase tracking-widest mb-5 text-ink">
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
  porton: EstadoPorton;
  sector?: SectorCaso | null;
  mora?: FuenteMora | null;
  documentos?: DocumentoSectorial[] | null;
  onVerPolitica?: () => void;
}

export function RiskOpinionView({ assessment, isGenerating, canGenerate, onGenerate, editedAt, porton, sector, mora, documentos, onVerPolitica }: RiskOpinionViewProps) {
  const generateButton = (label: string) => (
    <button
      onClick={onGenerate}
      disabled={!canGenerate || !porton.puedeGenerarOpinion || isGenerating}
      title={porton.motivo ?? undefined}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink/20 text-xs font-semibold text-ink hover:border-ink transition-all disabled:opacity-40 disabled:pointer-events-none"
    >
      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      {label}
    </button>
  );

  // Portón: sin rubro confirmado no hay opinión (aunque el caso viejo tenga una).
  if (!porton.rubroConfirmado) {
    return (
      <div className="bg-white border border-ink/15 p-12 text-center font-sans space-y-3">
        <ShieldQuestion className="w-10 h-10 mx-auto opacity-30" />
        <p className="text-sm font-semibold text-ink">Pendiente de rubro</p>
        <p className="text-sm text-ink/60">Confirmá el rubro arriba para habilitar las señales, el puntaje y la opinión de riesgos.</p>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="bg-white border border-ink/15 p-12 text-center font-sans space-y-4">
        {isGenerating ? (
          <p className="inline-flex items-center gap-2 text-sm font-mono text-ink/70">
            <Loader2 className="w-4 h-4 animate-spin" />
            Integrando ratios, Memoria, mercado, post balance, deuda y Nosis...
          </p>
        ) : (
          <>
            <ShieldQuestion className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm text-ink/70">Este caso todavía no tiene opinión de riesgo. Es el último paso: generala cuando termines de revisar el caso.</p>
            {generateButton('Revisé todo: generar opinión de riesgos')}
          </>
        )}
      </div>
    );
  }

  const { opinion, senales, puntaje, pce_proxy } = assessment;
  const status = CATEGORY_STATUS[puntaje.categoria];
  const formacion = formacionPuntaje(puntaje);
  const postura = opinion.postura ? POSTURA[opinion.postura] : null;
  const desactualizada = !!editedAt && editedAt > assessment.generado;

  const conteo = (['critica', 'alta', 'media', 'baja'] as SeveridadRiesgo[])
    .map(sev => ({ sev, n: opinion.riesgos.filter(r => r.severidad === sev).length }))
    .filter(c => c.n > 0);

  // Dimensiones del perfil evaluado (peso > 0) con sus nombres en ese perfil.
  const perfilEval = assessment.perfil ?? perfilEfectivo('generico');
  const etiqueta = (dim: RiskDimension) => perfilEval.etiquetasDimensiones?.[dim] ?? DIMENSIONS[dim].label;
  const dimensiones = (Object.keys(DIMENSIONS) as RiskDimension[]).filter(dim => (perfilEval.pesos[dim] ?? 0) > 0).map(dim => {
    const d = opinion.dimensiones.find(x => x.dimension === dim);
    return { dim, puntaje: d?.puntaje ?? null, comentario: d?.comentario ?? '' };
  });

  return (
    // Container queries: el ancho real depende de las barras laterales, no de la ventana.
    <div className="@container space-y-8 font-sans">
      <PerfilAviso
        perfil={assessment.perfil ?? { ...perfilEfectivo('generico'), version: assessment.politicaVersion ?? VERSION_PREVIA }}
        sector={assessment.sector ?? sector}
        mora={mora}
        documentos={documentos}
        onVerPolitica={onVerPolitica}
      />
      {porton.opinion === 'desactualizada' && (
        <div className="border-l-4 border-brand-blue bg-brand-blue/5 p-3 text-sm text-ink flex items-center justify-between gap-4">
          <span>{porton.motivo}</span>
          {generateButton('Regenerar')}
        </div>
      )}
      {desactualizada && (
        <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 flex items-center justify-between gap-4">
          <span>Los valores se editaron después de generar esta opinión. Regenerala para que tome los datos nuevos.</span>
          {generateButton('Regenerar')}
        </div>
      )}

      {/* Encabezado: puntaje + dictamen */}
      <div className="bg-white border border-ink/15 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-2" style={{ backgroundColor: STATUS[status] }} />
        <div className="grid grid-cols-1 @2xl:grid-cols-[minmax(240px,300px)_1fr] gap-8 p-6 pl-8 items-start">
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50">Puntaje de riesgo</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="font-display text-6xl font-semibold leading-none tabular-nums">{puntaje.final}</span>
                <span className="text-sm text-ink/50">/ 100</span>
              </div>
              <div className="mt-3"><StatusBadge status={status} label={CATEGORY_LABEL[puntaje.categoria]} /></div>
            </div>
            <EscalaPuntaje f={formacion} />
            {formacion.subePorPiso && (
              <p className="text-xs text-ink/70 flex items-start gap-1.5 text-left">
                <ArrowUpToLine className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Sube de {formacion.promedio} a {formacion.final} por regla automática: <strong>{formacion.motivoPiso}</strong>.</span>
              </p>
            )}
            <p className="text-[11px] text-ink/45">1 = riesgo mínimo · 100 = riesgo máximo</p>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-ink/60">Opinión de riesgo</h3>
              {postura && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink border"
                  style={{ borderColor: STATUS[postura.status], backgroundColor: tint(STATUS[postura.status], 0.12) }}
                >
                  <postura.icon className="w-4 h-4" style={{ color: STATUS[postura.status] }} />
                  {postura.label}
                </span>
              )}
            </div>
            <p className="text-base leading-relaxed font-medium text-ink">{opinion.dictamen}</p>
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
                  <span className="text-sm font-semibold text-ink">
                    {etiqueta(dim)}
                    <span className="ml-2 text-[10px] font-mono text-ink/40">peso {perfilEval.pesos[dim]}%</span>
                  </span>
                  <span className="text-sm font-mono font-bold text-ink tabular-nums">
                    {p === null ? 'Sin datos' : p}
                  </span>
                </div>
                {p === null ? (
                  <div className="h-3 w-full rounded-sm border border-dashed border-ink/20" />
                ) : (
                  <ScoreBar value={p} />
                )}
                {comentario && <p className="text-xs text-ink/60 mt-1.5 leading-relaxed">{comentario}</p>}
              </div>
            ))}
          </div>
        </Card>

        {/* Pérdida esperada (proxy) */}
        <div className="space-y-8">
          <Card title="Pérdida esperada">
            {pce_proxy === null ? (
              <p className="text-sm text-ink/50 italic">Sin score Nosis.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl font-bold text-ink tabular-nums">{pce_proxy}</span>
                  <span className="text-sm text-ink/50">/ 100</span>
                </div>
                <ScoreBar value={pce_proxy} />
                <p className="text-[11px] text-ink/60 mt-3 leading-relaxed">
                  Proxy transitorio basado en el score Nosis (1–999, más alto = mejor pagador). Índice relativo, no es un porcentaje de pérdida.
                </p>
              </>
            )}
          </Card>
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-ink/50 uppercase tracking-wider">
              Generada el {new Date(assessment.generado).toLocaleString('es-AR')}
            </p>
            {generateButton('Regenerar opinión')}
          </div>
        </div>
      </div>

      {/* Lectura integral */}
      <Card title="Lectura integral" icon={FileSearch}>
        <p className="text-sm leading-relaxed text-left text-ink whitespace-pre-line">{opinion.lectura_integral}</p>
      </Card>

      {/* Riesgos detectados */}
      <Card title="Riesgos detectados" icon={AlertTriangle}>
        {opinion.riesgos.length === 0 ? (
          <p className="text-sm text-ink/50 italic">No se detectaron riesgos relevantes.</p>
        ) : (
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
            {opinion.riesgos.map((r, i) => {
              const st = SEVERIDAD_STATUS[r.severidad];
              return (
                <div key={i} className="border border-ink/15 border-l-4 p-4 space-y-2" style={{ borderLeftColor: STATUS[st] }}>
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-bold text-ink leading-snug">{r.titulo}</h4>
                    <StatusBadge status={st} label={SEVERIDAD_LABEL[r.severidad]} />
                  </div>
                  {r.dimension && (
                    <p className="text-[10px] font-mono uppercase tracking-wider text-ink/40">{etiqueta(r.dimension)}</p>
                  )}
                  <p className="text-sm text-ink/80 leading-relaxed">{r.evidencia}</p>
                  {r.mitigante && (
                    <p className="text-xs text-ink/70 flex items-start gap-1.5 pt-1">
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
          <p className="text-sm text-ink/50 italic">Ninguna regla de alerta se disparó.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-ink/10">
              {senales.map(s => (
                <tr key={s.id}>
                  <td className="py-2.5 pr-3 align-top w-32"><StatusBadge status={SEVERIDAD_STATUS[s.severidad]} label={SEVERIDAD_LABEL[s.severidad]} /></td>
                  <td className="py-2.5 pr-3 align-top !text-left">
                    <span className="font-semibold text-ink">{s.titulo}</span>
                    <span className="block text-xs text-ink/60 mt-0.5">{s.detalle}</span>
                  </td>
                  <td className="py-2.5 align-top text-xs font-mono text-ink/50 whitespace-nowrap">
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
          <ItemList items={opinion.condiciones_sugeridas} empty="Sin condiciones sugeridas." icon={ListChecks} color="#000000" />
        </Card>
        <Card title="Información faltante" icon={FileSearch}>
          <ItemList items={opinion.informacion_faltante} empty="No falta información relevante." icon={Info} color="#00000080" />
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
    <p className="text-sm text-ink/50 italic">{empty}</p>
  ) : (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-ink leading-relaxed">
          <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
          {item}
        </li>
      ))}
    </ul>
  );

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Calculator, Check, FileText, Globe2, ScanText, ShieldCheck, Sparkles } from 'lucide-react';
import { CaseState } from '../features/extraction/pipeline';
import { cn } from '../lib/utils';

// Animación del análisis en curso: los documentos "fluyen" hacia un núcleo que
// procesa, y debajo se ve en qué etapa real del pipeline está el caso. Las
// etapas salen de `processingStage` (no se simulan); los mensajes que rotan
// describen lo que hace cada etapa, no un avance medido.

type Paso = { id: 'leer' | 'calcular' | 'verificar'; label: string; icon: React.ElementType };

const PASOS: Paso[] = [
  { id: 'leer', label: 'Lectura de documentos', icon: ScanText },
  { id: 'calcular', label: 'Cálculo de ratios', icon: Calculator },
  { id: 'verificar', label: 'Verificación y resumen', icon: ShieldCheck },
];

const pasoActual = (stage: CaseState | null): number => {
  if (stage === 'computing') return 1;
  if (stage === 'verifying') return 2;
  return 0; // processing / extracting / desconocido (p. ej. al recargar)
};

const MENSAJES: Record<number, string[]> = {
  0: [
    'Leyendo el estado de situación patrimonial',
    'Identificando el estado de resultados',
    'Buscando la deuda bancaria',
    'Revisando el informe Nosis',
    'Leyendo la Memoria del Directorio',
    'Ubicando accionistas y directorio',
  ],
  1: [
    'Calculando 27 ratios en código',
    'Corriendo chequeos de consistencia contable',
    'Cruzando deuda del balance contra Nosis',
  ],
  2: [
    'Interpretando los ratios calculados',
    'Explicando las inconsistencias',
    'Redactando el resumen ejecutivo',
    'Analizando el sector en paralelo',
  ],
};

const MAX_ARCHIVOS = 4;
const ALTO_HACES = 120;

const mmss = (seg: number) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

export function AnalysisFlow({ stage, fileNames, startedAt }: { stage: CaseState | null; fileNames: string[]; startedAt: string }) {
  const paso = pasoActual(stage);
  const mensajes = MENSAJES[paso];

  // Mensaje rotativo de la etapa (vuelve al primero al cambiar de etapa).
  const [iMensaje, setIMensaje] = useState(0);
  useEffect(() => {
    setIMensaje(0);
    const id = setInterval(() => setIMensaje(i => (i + 1) % mensajes.length), 2800);
    return () => clearInterval(id);
  }, [paso, mensajes.length]);

  // Tiempo transcurrido desde que arrancó el caso.
  const inicio = new Date(startedAt).getTime();
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const transcurrido = Math.max(0, Math.round((ahora - inicio) / 1000));

  // Haces de los archivos al núcleo: se dibujan en píxeles con el ancho real.
  const zonaRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = zonaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibles = fileNames.slice(0, MAX_ARCHIVOS);
  const resto = fileNames.length - visibles.length;
  const columnas = visibles.length + (resto > 0 ? 1 : 0) || 1;
  const centro = ancho / 2;
  const haces = Array.from({ length: columnas }, (_, i) => {
    const x = ((i + 0.5) / columnas) * ancho;
    return `M ${x} 0 C ${x} ${ALTO_HACES * 0.55}, ${centro} ${ALTO_HACES * 0.45}, ${centro} ${ALTO_HACES}`;
  });

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-ink text-white shadow-xl"
      role="status"
      aria-live="polite"
      aria-label={`Analizando: ${PASOS[paso].label}`}
    >
      {/* Fondo: grilla tenue y halo verde detrás del núcleo */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at 50% 45%, black 20%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, black 20%, transparent 70%)',
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-[42%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-green/10 blur-3xl" />

      <div className="relative px-6 py-10 sm:px-10">
        {/* Encabezado */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
            <Sparkles className="h-3.5 w-3.5 text-brand-green" />
            Análisis en curso
          </div>
          <div className="font-mono text-xs text-white/40" aria-label="Tiempo transcurrido">{mmss(transcurrido)}</div>
        </div>

        {/* Documentos que entran */}
        <div ref={zonaRef} className="mx-auto max-w-2xl">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
            {visibles.map((nombre, i) => (
              <div
                key={nombre + i}
                className="flujo-entra mx-auto flex w-full max-w-[160px] items-center justify-center gap-2 sm:justify-start rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2"
                style={{ animationDelay: `${i * 90}ms` }}
                title={nombre}
              >
                <FileText className="h-4 w-4 shrink-0 text-brand-green" />
                <span className="hidden truncate text-xs text-white/70 sm:inline">{nombre}</span>
              </div>
            ))}
            {resto > 0 && (
              <div className="mx-auto flex w-full max-w-[160px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white/50">
                +{resto}<span className="hidden sm:inline">&nbsp;más</span>
              </div>
            )}
          </div>

          {/* Haces con partículas que viajan hacia el núcleo */}
          <svg width={ancho} height={ALTO_HACES} className="block overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id="flujo-haz" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#35EEC8" stopOpacity="0.45" />
              </linearGradient>
            </defs>
            {ancho > 0 && haces.map((d, i) => (
              <g key={i}>
                <path d={d} fill="none" stroke="url(#flujo-haz)" strokeWidth="1.5" />
                {[0, 1].map(k => (
                  <circle key={k} r="2.5" fill="#35EEC8" className="motion-reduce:hidden">
                    <animateMotion dur="2.4s" repeatCount="indefinite" begin={`${(i * 0.37 + k * 1.2) % 2.4}s`} path={d} />
                    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="2.4s" repeatCount="indefinite" begin={`${(i * 0.37 + k * 1.2) % 2.4}s`} />
                  </circle>
                ))}
              </g>
            ))}
          </svg>
        </div>

        {/* Núcleo */}
        <div className="relative mx-auto -mt-5 flex h-36 w-36 items-center justify-center">
          <div className="flujo-onda absolute inset-6 rounded-full border border-brand-green/40" />
          <div className="flujo-onda absolute inset-6 rounded-full border border-brand-green/30" style={{ animationDelay: '1.4s' }} />
          <div className="flujo-respira absolute inset-3 rounded-full bg-brand-green/25 blur-xl" />
          <div
            className="flujo-giro absolute inset-5 rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0deg, #35EEC8 90deg, transparent 180deg, rgb(255 255 255 / 0.6) 270deg, transparent 360deg)',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))',
            }}
          />
          <div className="flujo-giro-lento absolute inset-9 rounded-full border border-dashed border-white/15" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/15 backdrop-blur">
            {React.createElement(PASOS[paso].icon, { className: 'h-6 w-6 text-brand-green' })}
          </div>
        </div>

        {/* Qué está haciendo ahora */}
        <div className="mt-4 text-center">
          <p className="font-display text-xl font-semibold sm:text-2xl">
            <span className="flujo-texto-brillo">{PASOS[paso].label}</span>
          </p>
          <p key={`${paso}-${iMensaje}`} className="flujo-entra mt-2 h-5 text-sm text-white/55">
            {mensajes[iMensaje]}…
          </p>
        </div>

        {/* Etapas del pipeline */}
        <ol className="mx-auto mt-10 flex max-w-2xl items-start">
          {PASOS.map((p, i) => {
            const hecho = i < paso;
            const activo = i === paso;
            return (
              <li key={p.id} className="flex flex-1 items-start last:flex-none">
                <div className="flex w-24 flex-col items-center gap-2 text-center sm:w-32">
                  <div
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-500',
                      hecho && 'border-brand-green bg-brand-green text-ink',
                      activo && 'border-brand-green text-brand-green',
                      !hecho && !activo && 'border-white/15 text-white/30',
                    )}
                  >
                    {activo && <span className="flujo-onda absolute inset-0 rounded-full border border-brand-green/60" />}
                    {hecho ? <Check className="h-4 w-4" strokeWidth={3} /> : React.createElement(p.icon, { className: 'h-4 w-4' })}
                  </div>
                  <span className={cn('text-[11px] leading-tight', activo ? 'font-semibold text-white' : hecho ? 'text-white/60' : 'text-white/35')}>
                    {p.label}
                  </span>
                </div>
                {i < PASOS.length - 1 && (
                  <div className="relative mt-[18px] h-px flex-1 overflow-hidden bg-white/15">
                    <div className={cn('absolute inset-y-0 left-0 bg-brand-green transition-all duration-700', hecho ? 'w-full' : 'w-0')} />
                    {activo && <div className="flujo-avance absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-brand-green to-transparent" />}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* Tareas en paralelo: arrancan junto con la verificación */}
        <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-[11px]">
          <span className="uppercase tracking-[0.14em] text-white/35">En paralelo</span>
          {[
            { label: 'Análisis de mercado', icon: Globe2 },
            { label: 'Historia y actividad', icon: BookOpen },
          ].map(t => (
            <span
              key={t.label}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors duration-500',
                paso === 2 ? 'border-brand-green/40 text-white/80' : 'border-white/10 text-white/30',
              )}
            >
              <t.icon className={cn('h-3 w-3', paso === 2 && 'text-brand-green')} />
              {t.label}
            </span>
          ))}
          <span className="text-white/30">· después, opinión de riesgos</span>
        </div>
      </div>
    </div>
  );
}

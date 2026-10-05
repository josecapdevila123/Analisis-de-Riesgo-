import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import { CaseState } from '../features/extraction/pipeline';
import { cn } from '../lib/utils';

// Animación del análisis en curso, pensada para relajar la espera: cada
// documento se "lee" y de él salen partículas grises (los datos en bruto) que
// viajan a una gota que respira; al entrar se tiñen de turquesa y salen de la
// gota hacia el informe ya transformadas. Todo lento y suave. La etapa sale de `processingStage` (no se
// simula); los mensajes que rotan describen la etapa, no miden el avance.

const PASOS = ['Leyendo los documentos', 'Calculando los ratios', 'Verificando y redactando'];

const pasoActual = (stage: CaseState | null): number => {
  if (stage === 'computing') return 1;
  if (stage === 'verifying') return 2;
  return 0; // processing / extracting / desconocido (p. ej. al recargar)
};

const MENSAJES: string[][] = [
  [
    'Estado de situación patrimonial',
    'Estado de resultados',
    'Deuda bancaria',
    'Informe Nosis',
    'Memoria del Directorio',
    'Accionistas y directorio',
  ],
  [
    '27 ratios, calculados en código',
    'Chequeos de consistencia contable',
    'Deuda del balance contra Nosis',
  ],
  [
    'Interpretando los ratios',
    'Redactando el resumen ejecutivo',
    'Mirando el sector y la historia de la empresa',
  ],
];

// Partículas que caen de la gota al informe: desvío horizontal (px), tamaño,
// demora y duración. Fijas para que el dibujo no cambie en cada render.
const PARTICULAS = [
  { x: -24, tam: 4, delay: 0, dur: 4.2 },
  { x: 12, tam: 3, delay: 0.7, dur: 4.8 },
  { x: -6, tam: 5, delay: 1.4, dur: 4.4 },
  { x: 28, tam: 3, delay: 2.1, dur: 5.2 },
  { x: -34, tam: 2.5, delay: 2.8, dur: 4.6 },
  { x: 4, tam: 4, delay: 3.4, dur: 4.3 },
  { x: 20, tam: 2.5, delay: 4.0, dur: 5.0 },
  { x: -14, tam: 3, delay: 1.0, dur: 4.9 },
  { x: 34, tam: 2, delay: 3.0, dur: 4.5 },
  { x: -28, tam: 3.5, delay: 4.6, dur: 4.7 },
];
const CAIDA = 92;

const MAX_ARCHIVOS = 4;
const ALTO = 104;
// Partículas por documento hacia la gota: desvío lateral del recorrido (px),
// radio, duración y desfase. Fijas para que el dibujo no cambie en cada render.
const DATOS = [
  { dx: 0, r: 2, dur: 3.6, desfase: 0 },
  { dx: -5, r: 1.4, dur: 4.4, desfase: 0.6 },
  { dx: 5, r: 1.6, dur: 4.0, desfase: 1.3 },
  { dx: -2, r: 2.4, dur: 5.0, desfase: 1.9 },
  { dx: 3, r: 1.2, dur: 3.8, desfase: 2.6 },
  { dx: -6, r: 1.8, dur: 4.6, desfase: 3.2 },
  { dx: 6, r: 1.3, dur: 5.4, desfase: 3.9 },
  { dx: -3, r: 1.6, dur: 4.2, desfase: 4.5 },
  { dx: 2, r: 2, dur: 4.8, desfase: 5.1 },
  { dx: -7, r: 1.1, dur: 5.2, desfase: 2.2 },
];
const GRIS = '#9a9a9a';
const TURQUESA = '#35EEC8';

export function AnalysisFlow({ stage, fileNames }: { stage: CaseState | null; fileNames: string[] }) {
  const paso = pasoActual(stage);
  const mensajes = MENSAJES[paso];

  const [iMensaje, setIMensaje] = useState(0);
  useEffect(() => {
    setIMensaje(0);
    const id = setInterval(() => setIMensaje(i => (i + 1) % mensajes.length), 4000);
    return () => clearInterval(id);
  }, [paso, mensajes.length]);

  // Los hilos se dibujan en píxeles con el ancho real de la fila de documentos.
  const zonaRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = zonaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Con "reducir movimiento" no se dibujan partículas (SMIL no respeta la media query de CSS).
  const [quieto] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const visibles = fileNames.slice(0, MAX_ARCHIVOS);
  const columnas = visibles.length || 1;
  const centro = ancho / 2;
  const camino = (i: number, dx: number) => {
    const x = ((i + 0.5) / columnas) * ancho + dx;
    return `M ${x} 0 C ${x} ${ALTO * 0.6}, ${centro + dx / 2} ${ALTO * 0.4}, ${centro + dx / 4} ${ALTO}`;
  };

  return (
    <div
      className="w-full rounded-2xl border border-ink/10 bg-white px-6 py-14 sm:px-10"
      role="status"
      aria-live="polite"
      aria-label={`Analizando: ${PASOS[paso]}`}
    >
      <div ref={zonaRef} className="mx-auto max-w-xl">
        {/* Documentos: una franja suave los recorre, como si se leyeran */}
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
          {visibles.map((nombre, i) => (
            <div
              key={nombre + i}
              className="agua-aparece relative mx-auto flex w-full max-w-[150px] items-center justify-center gap-2 overflow-hidden rounded-xl border border-ink/10 bg-panel px-2.5 py-2.5 sm:justify-start"
              style={{ animationDelay: `${i * 150}ms` }}
              title={nombre}
            >
              <span
                className="agua-lee pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent via-brand-green/25 to-transparent"
                style={{ animationDelay: `${i * 0.9}s` }}
              />
              <FileText className="relative h-4 w-4 shrink-0 text-ink/40" />
              <span className="relative hidden truncate text-xs text-ink/60 sm:inline">{nombre}</span>
            </div>
          ))}
        </div>

        {/* Datos en bruto (grises) que viajan de cada documento a la gota y se tiñen al entrar */}
        <svg width={ancho} height={ALTO} className="block overflow-visible" aria-hidden="true">
          {ancho > 0 && !quieto && Array.from({ length: columnas }, (_, i) => (
            <g key={i}>
              {DATOS.map((d, k) => {
                const desfase = -((d.desfase + i * 0.45) % d.dur);
                return (
                  <circle key={k} r={d.r} fill={GRIS} opacity="0">
                    <animateMotion
                      path={camino(i, d.dx)}
                      dur={`${d.dur}s`}
                      begin={`${desfase}s`}
                      repeatCount="indefinite"
                      calcMode="spline"
                      keyPoints="0;1"
                      keyTimes="0;1"
                      keySplines="0.45 0 0.75 1"
                    />
                    <animate attributeName="opacity" values="0;0.75;0.75;0" keyTimes="0;0.15;0.85;1" dur={`${d.dur}s`} begin={`${desfase}s`} repeatCount="indefinite" />
                    <animate attributeName="fill" values={`${GRIS};${GRIS};${TURQUESA}`} keyTimes="0;0.7;1" dur={`${d.dur}s`} begin={`${desfase}s`} repeatCount="indefinite" />
                  </circle>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      {/* La gota: respira y deja ondas, como agua que se asienta */}
      <div className="relative mx-auto -mt-9 flex h-36 w-36 items-center justify-center">
        <span className="agua-onda absolute inset-6 rounded-full border border-brand-green/50" />
        <span className="agua-onda absolute inset-6 rounded-full border border-brand-green/40" style={{ animationDelay: '3s' }} />
        <span
          className="agua-gota absolute inset-7 opacity-55 blur-[1px]"
          style={{ background: 'radial-gradient(circle at 35% 30%, #c9fbef 0%, #35EEC8 55%, #1fc9a6 100%)' }}
        />
        <span
          className="agua-gota absolute inset-9 opacity-50 mix-blend-multiply"
          style={{ background: 'radial-gradient(circle at 60% 65%, #35EEC8 0%, #9af5e1 70%)', animationDelay: '-5s', animationDuration: '15s' }}
        />
        <span className="absolute left-[38%] top-[34%] h-4 w-4 rounded-full bg-white/80 blur-[3px]" />
      </div>

      {/* Partículas que caen de la gota y nutren el informe */}
      <div className="relative mx-auto -mt-7 w-32" style={{ height: CAIDA }} aria-hidden="true">
        {PARTICULAS.map((e, i) => (
          <span
            key={i}
            className="agua-particula absolute left-1/2 top-0 block rounded-full bg-brand-green"
            style={{
              '--x': `${e.x}px`,
              '--caida': `${CAIDA - 4}px`,
              width: e.tam,
              height: e.tam,
              marginLeft: -e.tam / 2,
              boxShadow: '0 0 6px 1px rgb(53 238 200 / 0.6)',
              animationDelay: `${e.delay}s`,
              animationDuration: `${e.dur}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* El informe que se va formando: una línea más por etapa */}
      <div className="agua-nutre mx-auto w-52 rounded-xl border border-ink/10 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ink/50" />
          <span className="text-xs font-semibold text-ink/70">Informe de riesgo</span>
        </div>
        <div className="mt-2.5 space-y-1.5">
          {['w-full', 'w-4/5', 'w-3/5'].map((w, i) => (
            <div key={w} className={cn('h-1 overflow-hidden rounded-full bg-ink/[0.06]', w)}>
              <div className={cn('h-full rounded-full bg-brand-green/70 transition-all duration-[1500ms] ease-out', i < paso ? 'w-full' : i === paso ? 'w-1/2' : 'w-0')} />
            </div>
          ))}
        </div>
      </div>

      {/* Qué está haciendo */}
      <div className="mt-8 text-center">
        <p key={paso} className="agua-late font-display text-lg font-medium text-ink">{PASOS[paso]}</p>
        <p key={`${paso}-${iMensaje}`} className="agua-aparece mt-1.5 h-5 text-sm text-ink/45">
          {mensajes[iMensaje]}
        </p>
      </div>

      {/* Avance: tres puntos, el actual se estira */}
      <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden="true">
        {PASOS.map((p, i) => (
          <span
            key={p}
            className={cn(
              'h-1.5 rounded-full transition-all duration-700',
              i < paso && 'w-1.5 bg-ink/40',
              i === paso && 'w-6 bg-brand-green',
              i > paso && 'w-1.5 bg-ink/10',
            )}
          />
        ))}
      </div>
    </div>
  );
}

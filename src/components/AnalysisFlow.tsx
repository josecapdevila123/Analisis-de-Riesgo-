import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { CaseState } from '../features/extraction/pipeline';
import { cn } from '../lib/utils';

// Animación del análisis en curso, pensada para relajar la espera: cada
// documento se "lee" y de él baja un hilo de agua que desemboca en una gota que
// respira. Todo lento y suave. La etapa sale de `processingStage` (no se
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

const MAX_ARCHIVOS = 4;
const ALTO = 104;
// Hilos por documento: desplazamiento, patrón de gotas y velocidad. Los
// patrones suman 16 o 32 para que el loop de 64 px no salte.
const HILOS = [
  { dx: 0, dash: '6 10', dur: 3.2, ancho: 2 },
  { dx: -4, dash: '2 14', dur: 4.4, ancho: 1.5 },
  { dx: 4, dash: '12 20', dur: 5.6, ancho: 1 },
];

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

  const visibles = fileNames.slice(0, MAX_ARCHIVOS);
  const resto = fileNames.length - visibles.length;
  const columnas = visibles.length + (resto > 0 ? 1 : 0) || 1;
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
          {resto > 0 && (
            <div className="mx-auto flex w-full max-w-[150px] items-center justify-center rounded-xl border border-ink/10 bg-panel px-2.5 py-2.5 text-xs text-ink/40">
              +{resto}
            </div>
          )}
        </div>

        {/* Hilos de agua hacia la gota */}
        <svg width={ancho} height={ALTO} className="block" aria-hidden="true">
          <defs>
            <linearGradient id="agua-hilo" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={ALTO}>
              <stop offset="0%" stopColor="#35EEC8" stopOpacity="0" />
              <stop offset="35%" stopColor="#35EEC8" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#35EEC8" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="agua-cauce" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={ALTO}>
              <stop offset="0%" stopColor="#000" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#35EEC8" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          {ancho > 0 && Array.from({ length: columnas }, (_, i) => (
            <g key={i}>
              <path d={camino(i, 0)} fill="none" stroke="url(#agua-cauce)" strokeWidth="5" opacity="0.7" strokeLinecap="round" />
              {HILOS.map((h, k) => (
                <path
                  key={k}
                  d={camino(i, h.dx)}
                  fill="none"
                  stroke="url(#agua-hilo)"
                  strokeWidth={h.ancho}
                  strokeLinecap="round"
                  strokeDasharray={h.dash}
                  className="agua-corre"
                  style={{ animationDuration: `${h.dur}s`, animationDelay: `-${(i * 0.7 + k) % h.dur}s` }}
                />
              ))}
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

      {/* Qué está haciendo */}
      <div className="mt-8 text-center">
        <p className="font-display text-lg font-medium text-ink">{PASOS[paso]}</p>
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

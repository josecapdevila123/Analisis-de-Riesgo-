import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Pencil, ShieldCheck, Sparkles } from 'lucide-react';
import { RUBROS, RubroDisponible, SECTOR_PROFILES, SubSegmento, SUBSEGMENTOS, subsegmentoLabel } from '../features/risk/policy';
import { EstadoPorton, MOTIVO_MINIMO, SectorCaso, validarConfirmacion } from '../features/risk/porton';

// Banner del rubro, arriba del caso: el analista confirma el rubro (portón) y,
// cuando terminó de revisar todo, genera la opinión de riesgos (último paso).

type Props = {
  sector: SectorCaso;
  porton: EstadoPorton;
  generando: boolean;
  bloqueadoPorEdicion: boolean;
  onConfirmar: (rubro: RubroDisponible, motivo: string, nota: string, subsegmento: SubSegmento | null) => void;
  onGenerarOpinion: () => void;
  // Resumen del pre-chequeo (vive en la pestaña Opinión de riesgos).
  prechequeo?: { faltantes: number; alertas: number } | null;
  onVerPrechequeo?: () => void;
};

export function SectorBanner({ sector, porton, generando, bloqueadoPorEdicion, onConfirmar, onGenerarOpinion, prechequeo, onVerPrechequeo }: Props) {
  const [editando, setEditando] = useState(!sector.confirmado);
  const [elegido, setElegido] = useState<RubroDisponible | null>(sector.confirmado ?? sector.sugerido ?? null);
  const [motivo, setMotivo] = useState(sector.motivoCambio ?? '');
  const [nota, setNota] = useState(sector.nota ?? '');
  const [subsegmento, setSubsegmento] = useState<SubSegmento | null>(sector.subsegmento ?? null);
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    setEditando(!sector.confirmado);
    setElegido(sector.confirmado ?? sector.sugerido ?? null);
    setMotivo(sector.motivoCambio ?? '');
    setNota(sector.nota ?? '');
    setSubsegmento(sector.subsegmento ?? null);
    setIntento(false);
  }, [sector.confirmado, sector.sugerido, sector.motivoCambio, sector.nota, sector.subsegmento]);

  const error = validarConfirmacion(sector, elegido, motivo, subsegmento);
  const pideSubsegmento = elegido !== null && SECTOR_PROFILES[elegido].requiereSubsegmento === true;
  const pideMotivo = sector.sugerido !== null && elegido !== null && elegido !== sector.sugerido;
  const porque = sector.coincidencias.filter(c => c.rubro === sector.sugerido).map(c => `"${c.palabra}"`);

  if (!editando && sector.confirmado) {
    const perfil = SECTOR_PROFILES[sector.confirmado];
    const necesitaOpinion = porton.opinion !== 'vigente';
    return (
      <div className="bg-white border border-ink/15 px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm flex-1 min-w-[240px]">
          <CheckCircle2 className="w-4 h-4 text-ink shrink-0" />
          <span>Rubro confirmado: <strong className="font-semibold">{perfil.label}</strong>{sector.subsegmento && <> · {subsegmentoLabel(sector.subsegmento)}</>}</span>
          <button onClick={() => setEditando(true)} className="text-xs text-ink/50 hover:text-ink inline-flex items-center gap-1 ml-1 shrink-0 whitespace-nowrap">
            <Pencil className="w-3 h-3" /> Cambiar
          </button>
        </div>
        {porton.opinion === 'desactualizada' && (
          <span className="text-xs font-medium text-ink bg-brand-blue/10 px-2 py-1 rounded-sm">Opinión desactualizada</span>
        )}
        {prechequeo && onVerPrechequeo && (
          <button onClick={onVerPrechequeo} className="text-xs text-ink/60 hover:text-ink underline underline-offset-2">
            Pre-chequeo: {prechequeo.faltantes === 0 && prechequeo.alertas === 0
              ? 'todo en orden'
              : [prechequeo.faltantes ? `${prechequeo.faltantes} faltante${prechequeo.faltantes === 1 ? '' : 's'}` : null, prechequeo.alertas ? `${prechequeo.alertas} alerta${prechequeo.alertas === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
          </button>
        )}
        <button
          onClick={onGenerarOpinion}
          disabled={generando || bloqueadoPorEdicion}
          title={bloqueadoPorEdicion ? 'Guardá o descartá la edición de valores antes de generar la opinión.' : 'Último paso: genera la opinión con todo lo revisado y el rubro confirmado.'}
          className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${necesitaOpinion ? 'bg-brand-green text-ink hover:brightness-95' : 'border border-ink/20 text-ink hover:border-ink'}`}
        >
          {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generando ? 'Generando opinión…' : porton.opinion === 'sin_opinion' ? 'Revisé todo: generar opinión de riesgos' : 'Regenerar opinión de riesgos'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-ink/15 border-l-4 border-l-brand-blue px-5 py-4 space-y-3 print:hidden">
      <div className="flex items-start gap-2">
        <ShieldCheck className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" />
        <div>
          <p className="font-display text-base font-semibold">Confirmá el rubro para evaluar el caso</p>
          <p className="text-xs text-ink/60 mt-0.5">
            {sector.sugerido
              ? <>Sugerido: <strong className="text-ink">{SECTOR_PROFILES[sector.sugerido].label}</strong>, porque la actividad menciona {porque.join(', ')}.</>
              : 'Sin sugerencia: elegí el rubro.'}{' '}
            Hasta confirmarlo, los semáforos, el puntaje, la opinión y el PDF quedan pendientes.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink/60">
          Rubro (el de mayor peso en las ventas)
          <select
            value={elegido ?? ''}
            onChange={e => setElegido((e.target.value || null) as RubroDisponible | null)}
            className="border border-ink/20 rounded px-2 py-1.5 text-sm text-ink bg-white min-w-[220px]"
          >
            <option value="">Elegí un rubro…</option>
            {RUBROS.map(r => (
              <option key={r} value={r}>{SECTOR_PROFILES[r].label}{r === sector.sugerido ? ' (sugerido)' : ''}</option>
            ))}
          </select>
        </label>
        {pideSubsegmento && (
          <label className="flex flex-col gap-1 text-xs text-ink/60">
            Sub-segmento (obligatorio: define los umbrales de mora)
            <select
              value={subsegmento ?? ''}
              onChange={e => setSubsegmento((e.target.value || null) as SubSegmento | null)}
              className="border border-ink/20 rounded px-2 py-1.5 text-sm text-ink bg-white min-w-[220px]"
            >
              <option value="">Elegí el sub-segmento…</option>
              {SUBSEGMENTOS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-ink/60 flex-1 min-w-[220px]">
          Nota (opcional, ej. negocio mixto)
          <input value={nota} onChange={e => setNota(e.target.value)} className="border border-ink/20 rounded px-2 py-1.5 text-sm text-ink" />
        </label>
      </div>
      {elegido && <p className="text-xs text-ink/55">{SECTOR_PROFILES[elegido].descripcion}</p>}
      {pideMotivo && (
        <label className="flex flex-col gap-1 text-xs text-ink/60">
          Motivo del cambio (obligatorio, mínimo {MOTIVO_MINIMO} caracteres)
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} className="border border-ink/20 rounded px-2 py-1.5 text-sm text-ink" />
        </label>
      )}
      {intento && error && <p className="text-xs font-medium text-ink bg-brand-blue/10 inline-block px-2 py-1 rounded-sm">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setIntento(true);
            if (error || !elegido) return;
            onConfirmar(elegido, motivo, nota, pideSubsegmento ? subsegmento : null);
            // Si se reconfirma sin cambios, el efecto de arriba no corre: se cierra acá.
            setEditando(false);
          }}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-brand-green text-ink text-sm font-semibold hover:brightness-95 transition"
        >
          <CheckCircle2 className="w-4 h-4" /> Confirmar rubro
        </button>
        {sector.confirmado && (
          <button onClick={() => setEditando(false)} className="text-xs text-ink/50 hover:text-ink">Cancelar</button>
        )}
        {porton.opinion === 'vigente' && sector.confirmado && (
          <span className="text-[11px] text-ink/50">Si cambiás el rubro o el sub-segmento, la opinión queda desactualizada hasta regenerarla.</span>
        )}
      </div>
    </div>
  );
}

import { PerfilEfectivo, perfilEfectivo, POLICY_VERSION, RubroDisponible, SECTOR_PROFILES } from './policy';
import { Coincidencia, sugerirRubro } from './sector';
import type { RawExtraction } from '../extraction/schemas';

// Portón del rubro: hasta que el analista confirma el rubro no hay semáforos,
// señales, puntaje, opinión ni PDF. Lógica pura (la usa App y se testea sola).

export type SectorCaso = {
  sugerido: RubroDisponible | null;
  coincidencias: Coincidencia[];
  confirmado: RubroDisponible | null;
  confirmadoPor: string | null;
  confirmadoEn: string | null; // ISO
  motivoCambio: string | null;
  nota: string | null;
};

// Caso nuevo o viejo sin rubro: se sugiere y queda "genérico" sin confirmar.
export const sectorInicial = (extraction: Pick<RawExtraction, 'company_profile'> | null | undefined): SectorCaso => {
  const s = sugerirRubro(extraction);
  return { sugerido: s.rubro, coincidencias: s.coincidencias, confirmado: null, confirmadoPor: null, confirmadoEn: null, motivoCambio: null, nota: null };
};

export const MOTIVO_MINIMO = 10;

// Error de validación de la confirmación, o null si se puede confirmar.
export function validarConfirmacion(sector: SectorCaso, elegido: RubroDisponible | null, motivo: string): string | null {
  if (!elegido) return 'Elegí un rubro.';
  const sugerido = sector.sugerido ?? null;
  if (sugerido !== null && elegido !== sugerido && motivo.trim().length < MOTIVO_MINIMO) {
    return `Elegiste un rubro distinto del sugerido (${SECTOR_PROFILES[sugerido].label}): explicá el motivo (mínimo ${MOTIVO_MINIMO} caracteres).`;
  }
  return null;
}

export function confirmarRubro(
  sector: SectorCaso,
  elegido: RubroDisponible,
  motivo: string,
  nota: string,
  email: string | null,
  ahora = new Date(),
): SectorCaso {
  const error = validarConfirmacion(sector, elegido, motivo);
  if (error) throw new Error(error);
  const cambio = sector.sugerido !== null && elegido !== sector.sugerido;
  return {
    ...sector,
    confirmado: elegido,
    confirmadoPor: email,
    confirmadoEn: ahora.toISOString(),
    motivoCambio: cambio ? motivo.trim() : null,
    nota: nota.trim() || null,
  };
}

// Foto con la que se evaluó una opinión. Las opiniones anteriores al
// versionado no la tienen: se consideran evaluadas con el genérico v1.0.0.
export type FotoEvaluacion = { perfil: PerfilEfectivo; politicaVersion: string; sector: SectorCaso | null };
export const VERSION_PREVIA = '1.0.0';

export type EstadoOpinion = 'sin_opinion' | 'vigente' | 'desactualizada';

export type EstadoPorton = {
  rubroConfirmado: boolean;
  opinion: EstadoOpinion;
  puedeVerSemaforos: boolean;
  puedeGenerarOpinion: boolean;
  puedeExportarPdf: boolean;
  motivo: string | null;          // por qué está bloqueado (tooltip)
  politicaEvaluada: string | null; // versión con la que se evaluó la opinión
  politicaDesactualizada: boolean; // la vigente es más nueva que la evaluada
};

export function estadoPorton(
  sector: SectorCaso | null | undefined,
  opinion: { perfil?: PerfilEfectivo; politicaVersion?: string } | null | undefined,
): EstadoPorton {
  const confirmado = sector?.confirmado ?? null;
  const rubroEvaluado = opinion ? (opinion.perfil?.rubro ?? 'generico') : null;
  const politicaEvaluada = opinion ? (opinion.politicaVersion ?? VERSION_PREVIA) : null;
  const estadoOpinion: EstadoOpinion = !opinion ? 'sin_opinion' : confirmado !== null && rubroEvaluado !== confirmado ? 'desactualizada' : 'vigente';

  let motivo: string | null = null;
  if (confirmado === null) motivo = 'Pendiente de rubro: confirmá el rubro para habilitar semáforos, puntaje, opinión y PDF.';
  else if (estadoOpinion === 'desactualizada') motivo = 'Cambió el rubro después de generar la opinión: volvé a generarla para habilitar el PDF.';

  return {
    rubroConfirmado: confirmado !== null,
    opinion: confirmado === null && opinion ? 'vigente' : estadoOpinion,
    puedeVerSemaforos: confirmado !== null,
    puedeGenerarOpinion: confirmado !== null,
    puedeExportarPdf: confirmado !== null && estadoOpinion !== 'desactualizada',
    motivo,
    politicaEvaluada,
    politicaDesactualizada: politicaEvaluada !== null && politicaEvaluada !== POLICY_VERSION,
  };
}

// Perfil con el que se muestra el caso: el de la foto si la opinión está
// vigente; si no, el del rubro confirmado; sin confirmar, el genérico.
export function perfilDelCaso(
  sector: SectorCaso | null | undefined,
  opinion: { perfil?: PerfilEfectivo } | null | undefined,
): PerfilEfectivo {
  const confirmado = sector?.confirmado ?? null;
  if (opinion?.perfil && (confirmado === null || opinion.perfil.rubro === confirmado)) return opinion.perfil;
  return perfilEfectivo(confirmado ?? 'generico');
}

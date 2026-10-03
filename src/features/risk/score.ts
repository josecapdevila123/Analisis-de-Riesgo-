import { RiskDimension, SeveridadRiesgo } from '../extraction/schemas';

// Escala de riesgo: 1 = riesgo mínimo, 100 = riesgo máximo.

export type RiskCategory = 'bajo' | 'moderado' | 'alto' | 'critico';

export const DIMENSIONS: Record<RiskDimension, { label: string; weight: number }> = {
  nosis_bcra: { label: 'Nosis / BCRA', weight: 25 },
  endeudamiento: { label: 'Endeudamiento', weight: 20 },
  liquidez_solvencia: { label: 'Liquidez y solvencia', weight: 15 },
  rentabilidad: { label: 'Rentabilidad y ventas', weight: 15 },
  ventas_post_balance: { label: 'Ventas y deuda post balance', weight: 10 },
  negocio_mercado: { label: 'Negocio y mercado', weight: 10 },
  calidad_informacion: { label: 'Calidad de la información', weight: 5 },
};

export const categoryOf = (score: number): RiskCategory => {
  if (score <= 25) return 'bajo';
  if (score <= 50) return 'moderado';
  if (score <= 75) return 'alto';
  return 'critico';
};

export const CATEGORY_LABEL: Record<RiskCategory, string> = {
  bajo: 'Riesgo bajo',
  moderado: 'Riesgo moderado',
  alto: 'Riesgo alto',
  critico: 'Riesgo crítico',
};

export const SEVERIDAD_LABEL: Record<SeveridadRiesgo, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

// Pérdida crediticia esperada: transitoriamente se aproxima con el score Nosis.
// Supuesto: score Nosis en escala 1–999, donde más alto = mejor pagador.
// Devuelve un índice relativo 0–100 (100 = mayor pérdida esperada), NO un %.
export const NOSIS_SCORE_MIN = 1;
export const NOSIS_SCORE_MAX = 999;

export const pceProxy = (nosisScore: number | null | undefined): number | null => {
  if (nosisScore === null || nosisScore === undefined || !Number.isFinite(nosisScore)) return null;
  const s = Math.min(NOSIS_SCORE_MAX, Math.max(NOSIS_SCORE_MIN, nosisScore));
  return Math.round(((NOSIS_SCORE_MAX - s) / (NOSIS_SCORE_MAX - NOSIS_SCORE_MIN)) * 100);
};

export type DimensionScore = { dimension: RiskDimension; puntaje: number | null };
export type Floor = { piso: number; motivo: string };

export type AggregatedScore = {
  // Promedio ponderado de las dimensiones con datos (null si ninguna tiene puntaje).
  ponderado: number | null;
  // Piso más alto disparado por las señales automáticas.
  piso: Floor | null;
  final: number;
  categoria: RiskCategory;
};

export function aggregateScore(dimensiones: DimensionScore[], pisos: Floor[]): AggregatedScore {
  let sum = 0;
  let weights = 0;
  for (const d of dimensiones) {
    if (d.puntaje === null) continue;
    const w = DIMENSIONS[d.dimension].weight;
    sum += d.puntaje * w;
    weights += w;
  }
  const ponderado = weights > 0 ? sum / weights : null;

  const piso = pisos.reduce<Floor | null>((max, p) => (max === null || p.piso > max.piso ? p : max), null);

  // Sin dimensiones puntuadas no hay lectura: se toma el punto medio (50) o el piso.
  const base = ponderado ?? 50;
  const final = Math.min(100, Math.max(1, Math.round(Math.max(base, piso?.piso ?? 0))));
  return {
    ponderado: ponderado === null ? null : Math.round(ponderado),
    piso,
    final,
    categoria: categoryOf(final),
  };
}

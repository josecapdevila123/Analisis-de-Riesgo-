import { RiskDimension, SeveridadRiesgo } from '../extraction/schemas';
import { DIMENSION_WEIGHTS, PCE_TRAMOS, SCORE_BANDS } from './policy';

// Escala de riesgo: 1 = riesgo mínimo, 100 = riesgo máximo.

export type RiskCategory = 'bajo' | 'moderado' | 'alto' | 'critico';

// Pesos y bandas vienen de la política de riesgos.
export const DIMENSIONS = DIMENSION_WEIGHTS;

export const categoryOf = (score: number): RiskCategory =>
  (SCORE_BANDS.find(b => score <= b.hasta) ?? SCORE_BANDS[SCORE_BANDS.length - 1]).categoria;

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

// Pérdida crediticia esperada: proxy transitorio por tramos de score Nosis
// (relación inversa y no lineal, ver PCE_TRAMOS en la política).
// Índice relativo 0–100 (100 = mayor pérdida esperada), NO un %.
export const pceProxy = (nosisScore: number | null | undefined): number | null => {
  if (nosisScore === null || nosisScore === undefined || !Number.isFinite(nosisScore)) return null;
  const tramo = PCE_TRAMOS.find(t => nosisScore >= t.desde) ?? PCE_TRAMOS[PCE_TRAMOS.length - 1];
  return tramo.pce;
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

// Pesos: los del perfil del rubro si se pasan; si no, los de la política base.
export function aggregateScore(dimensiones: DimensionScore[], pisos: Floor[], pesos?: Record<RiskDimension, number>): AggregatedScore {
  let sum = 0;
  let weights = 0;
  for (const d of dimensiones) {
    if (d.puntaje === null) continue;
    const w = pesos?.[d.dimension] ?? DIMENSIONS[d.dimension].weight;
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

// Cómo se formó el puntaje, para dibujarlo en la escala continua 0–100 (pantalla y PDF).
// `promedio` es el ponderado de las dimensiones; `subePorPiso` solo si el piso lo movió de verdad.
export type FormacionPuntaje = {
  final: number;
  promedio: number | null;
  subePorPiso: boolean;
  motivoPiso: string | null;
};

export function formacionPuntaje(p: Pick<AggregatedScore, 'ponderado' | 'piso' | 'final'>): FormacionPuntaje {
  const subePorPiso = !!p.piso && p.ponderado !== null && p.final > p.ponderado;
  return {
    final: p.final,
    promedio: p.ponderado,
    subePorPiso,
    motivoPiso: subePorPiso ? p.piso!.motivo : null,
  };
}

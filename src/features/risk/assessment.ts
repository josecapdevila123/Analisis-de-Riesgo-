import { runRiskOpinion } from '../extraction/geminiClient';
import { CompanyHistory, RawExtraction, RiskDimension, RiskOpinion, VerificationResult } from '../extraction/schemas';
import { ComputedRatios } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';
import { detectSignals, RiskSignal } from './signals';
import { aggregateScore, AggregatedScore, DIMENSIONS, pceProxy } from './score';

// Etapa final del pipeline: lectura integral de riesgo.
// 1. Reglas fijas detectan señales objetivas (algunas con piso de puntaje).
// 2. Gemini lee todo y puntúa 7 dimensiones + redacta la opinión.
// 3. El código pondera las dimensiones y aplica el piso → puntaje final 1–100.

export type RiskAssessment = {
  opinion: RiskOpinion;
  senales: RiskSignal[];
  puntaje: AggregatedScore;
  pce_proxy: number | null;
  generado: string; // ISO
};

export type RiskAssessmentInput = {
  extraction: RawExtraction;
  ratios: ComputedRatios;
  inconsistencias: Inconsistencia[];
  crossCheck: CrossCheckResult | null;
  verification: VerificationResult | null;
  marketAnalysis: string | null;
  companyHistory: CompanyHistory | null;
};

// El análisis de mercado puede ser largo; alcanza con el inicio para el contexto sectorial.
const MAX_MARKET_CHARS = 15_000;

export async function runRiskAssessment(input: RiskAssessmentInput): Promise<RiskAssessment> {
  const { extraction, ratios, inconsistencias, crossCheck, verification, marketAnalysis, companyHistory } = input;
  const senales = detectSignals({ extraction, ratios, inconsistencias, crossCheck, companyHistory });
  const pce = pceProxy(extraction.extraccion_nosis?.score_crediticio);

  const context = {
    empresa: extraction.company_profile,
    estados_contables: {
      ejercicio_actual: extraction.ejercicio_actual,
      ejercicio_anterior: extraction.ejercicio_anterior,
    },
    ratios,
    deuda_bancaria: {
      actual: extraction.deuda_bancaria_actual,
      anterior: extraction.deuda_bancaria_anterior,
    },
    post_balance: extraction.analisis_post_cierre,
    nosis: extraction.extraccion_nosis,
    cruce_balance_nosis: crossCheck,
    inconsistencias,
    verificacion: verification
      ? { alertas_coherencia: verification.alertas_coherencia, resumen_ejecutivo: verification.executive_summary }
      : null,
    historia_y_actividad: companyHistory,
    analisis_mercado: marketAnalysis ? marketAnalysis.slice(0, MAX_MARKET_CHARS) : null,
    pce_proxy: {
      valor: pce,
      supuesto: 'Pérdida esperada aproximada por el score Nosis (1–999, más alto = mejor). Índice relativo 0–100, no es un porcentaje.',
    },
    senales_automaticas: senales,
  };

  const opinion = await runRiskOpinion(JSON.stringify(context, null, 2));

  const porDimension = new Map(opinion.dimensiones.map(d => [d.dimension, d.puntaje]));
  const dimensiones = (Object.keys(DIMENSIONS) as RiskDimension[]).map(dimension => ({
    dimension,
    puntaje: porDimension.get(dimension) ?? null,
  }));
  const pisos = senales
    .filter(s => s.piso !== null)
    .map(s => ({ piso: s.piso as number, motivo: s.titulo }));

  return {
    opinion,
    senales,
    puntaje: aggregateScore(dimensiones, pisos),
    pce_proxy: pce,
    generado: new Date().toISOString(),
  };
}

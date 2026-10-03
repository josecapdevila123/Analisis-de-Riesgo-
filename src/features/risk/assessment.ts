import { runRiskOpinion } from '../extraction/geminiClient';
import { CompanyHistory, RawExtraction, RiskDimension, RiskOpinion, VerificationResult } from '../extraction/schemas';
import { computeRatios } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';
import { detectSignals, RiskSignal } from './signals';
import { aggregateScore, AggregatedScore, DIMENSIONS, pceProxy } from './score';
import { armarContextoOpinion } from './contextoOpinion';
import { PerfilEfectivo, perfilEfectivo, POLICY_VERSION } from './policy';
import { SectorCaso } from './porton';
import { DocumentoSectorial, firmaDocumentos } from '../sectorDocs/tipos';

// Último paso, a pedido del analista (botón), con el rubro ya confirmado:
// 1. Reglas fijas detectan señales objetivas con el perfil del rubro (algunas con piso).
// 2. Gemini lee todo y puntúa 7 dimensiones + redacta la opinión, empezando por
//    los KPIs prioritarios y la variable crítica del rubro.
// 3. El código pondera con los pesos del perfil y aplica el piso → puntaje 1–100.
// Se guarda la foto del perfil y la versión de la política.

export type RiskAssessment = {
  opinion: RiskOpinion;
  senales: RiskSignal[];
  puntaje: AggregatedScore;
  pce_proxy: number | null;
  generado: string; // ISO
  // Foto de la evaluación: perfil efectivo y versión de la política. Las
  // opiniones anteriores al versionado no la tienen (genérico, v1.0.0).
  perfil?: PerfilEfectivo;
  politicaVersion?: string;
  sector?: SectorCaso | null;
  // Documentos sectoriales considerados (firma para detectar cambios posteriores).
  documentosFirma?: string;
};

export type RiskAssessmentInput = {
  extraction: RawExtraction;
  inconsistencias: Inconsistencia[];
  crossCheck: CrossCheckResult | null;
  verification: VerificationResult | null;
  marketAnalysis: string | null;
  companyHistory: CompanyHistory | null;
  // Rubro confirmado por el analista (el portón no deja llegar acá sin él).
  sector: SectorCaso;
  documentos?: DocumentoSectorial[] | null;
};

export async function runRiskAssessment(input: RiskAssessmentInput): Promise<RiskAssessment> {
  const { extraction, inconsistencias, crossCheck, companyHistory, sector } = input;
  if (!sector.confirmado) throw new Error('Confirmá el rubro antes de generar la opinión de riesgos.');
  const documentos = (input.documentos ?? []).filter(d => d.estado === 'ok');
  const perfil = perfilEfectivo(sector.confirmado, sector.subsegmento ?? null);
  const ratios = computeRatios(extraction, perfil, documentos);
  const senales = detectSignals({ extraction, ratios, inconsistencias, crossCheck, companyHistory, perfil, documentos });
  const pce = pceProxy(extraction.extraccion_nosis?.score_crediticio);

  const context = armarContextoOpinion({ ...input, ratios, senales, pce, perfil, sector, documentos });
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
    puntaje: aggregateScore(dimensiones, pisos, perfil.pesos),
    pce_proxy: pce,
    generado: new Date().toISOString(),
    perfil,
    politicaVersion: POLICY_VERSION,
    sector,
    documentosFirma: firmaDocumentos(documentos),
  };
}

import {
  UploadedFile,
  runExtraction,
  runVerification,
  runMarketAnalysis,
  runCompanyHistory,
} from './geminiClient';
import { CompanyHistory, RawExtraction, VerificationResult } from './schemas';
import { ComputedRatios, computeRatios } from '../ratios/calculations';
import { Inconsistencia, runSanityChecks } from '../ratios/sanityChecks';
import { sugerirRubro } from '../risk/sector';
import { SECTOR_PROFILES } from '../risk/policy';
import { CrossCheckResult, runCrossCheck } from '../ratios/crossCheck';

export type CaseState =
  | 'processing'
  | 'extracting'
  | 'computing'
  | 'verifying'
  | 'completed'
  | 'completed_partial'
  | 'error';

export type PipelineFailure = {
  stage: 'extraction' | 'verification';
  message: string;
};

export type PipelineResult = {
  state: CaseState;
  extraction: RawExtraction | null;
  ratios: ComputedRatios | null;
  inconsistencias: Inconsistencia[];
  crossCheck: CrossCheckResult | null;
  verification: VerificationResult | null;
  failure?: PipelineFailure;
};

export type PipelineCallbacks = {
  onStateChange?: (state: CaseState) => void;
  onMarketAnalysis?: (text: string | null, error?: Error) => void;
  onCompanyHistory?: (history: CompanyHistory | null, error?: Error) => void;
};

const emptyFailure = (state: 'error', failure: PipelineFailure): PipelineResult => ({
  state,
  extraction: null,
  ratios: null,
  inconsistencias: [],
  crossCheck: null,
  verification: null,
  failure,
});

export async function runPipeline(
  files: UploadedFile[],
  callbacks?: PipelineCallbacks
): Promise<PipelineResult> {
  // Etapa 1 — extracción cruda (Gemini)
  callbacks?.onStateChange?.('extracting');
  let extraction: RawExtraction;
  try {
    extraction = await runExtraction(files);
  } catch (err) {
    const failure: PipelineFailure = {
      stage: 'extraction',
      message: err instanceof Error ? err.message : String(err),
    };
    callbacks?.onStateChange?.('error');
    return emptyFailure('error', failure);
  }

  // Etapa 2 — cálculo determinístico (código)
  callbacks?.onStateChange?.('computing');
  const ratios = computeRatios(extraction);
  const inconsistencias = runSanityChecks(extraction);
  const crossCheck = runCrossCheck(extraction);

  const toError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));

  // Etapa 4 (lanzada en paralelo a la 3; no bloquea el resultado)
  const marketPromise = runMarketAnalysis(files, extraction)
    .then(text => { callbacks?.onMarketAnalysis?.(text); return text; })
    .catch(err => { callbacks?.onMarketAnalysis?.(null, toError(err)); return null; });

  // Etapa 4b — historia y actividad desde la Memoria (también en paralelo)
  const historyPromise = runCompanyHistory(files, extraction)
    .then(history => { callbacks?.onCompanyHistory?.(history); return history; })
    .catch(err => { callbacks?.onCompanyHistory?.(null, toError(err)); return null; });

  // Etapa 3 — verificación + síntesis cualitativa (Gemini)
  callbacks?.onStateChange?.('verifying');
  let verification: VerificationResult | null = null;
  let finalState: CaseState = 'completed';
  try {
    // Todavía no hay rubro confirmado: se pasa el sugerido, marcado como tal.
    const sugerido = sugerirRubro(extraction).rubro;
    verification = await runVerification(files, extraction, ratios, inconsistencias, crossCheck,
      sugerido ? { rubro: SECTOR_PROFILES[sugerido].label, confirmado: false } : null);
  } catch {
    finalState = 'completed_partial';
  }
  callbacks?.onStateChange?.(finalState);

  // Etapa 5 — la opinión de riesgos ya NO se lanza sola: es el último paso,
  // con el rubro confirmado y a pedido del analista (botón en el caso).
  void Promise.all([marketPromise, historyPromise]);

  return {
    state: finalState,
    extraction,
    ratios,
    inconsistencias,
    crossCheck,
    verification,
  };
}

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

  // Etapa 4 (lanzada en paralelo a la 3, fire-and-forget; no bloquea)
  void runMarketAnalysis(files, extraction)
    .then(text => callbacks?.onMarketAnalysis?.(text))
    .catch(err => callbacks?.onMarketAnalysis?.(null, err instanceof Error ? err : new Error(String(err))));

  // Etapa 4b — historia y actividad desde la Memoria (también en paralelo, no bloquea)
  void runCompanyHistory(files, extraction)
    .then(history => callbacks?.onCompanyHistory?.(history))
    .catch(err => callbacks?.onCompanyHistory?.(null, err instanceof Error ? err : new Error(String(err))));

  // Etapa 3 — verificación + síntesis cualitativa (Gemini)
  callbacks?.onStateChange?.('verifying');
  let verification: VerificationResult | null = null;
  let finalState: CaseState = 'completed';
  try {
    verification = await runVerification(files, extraction, ratios, inconsistencias, crossCheck);
  } catch {
    finalState = 'completed_partial';
  }
  callbacks?.onStateChange?.(finalState);

  return {
    state: finalState,
    extraction,
    ratios,
    inconsistencias,
    crossCheck,
    verification,
  };
}

import type { RawExtraction, VerificationResult } from './features/extraction/schemas';
import type { ComputedRatios } from './features/ratios/calculations';
import type { Inconsistencia } from './features/ratios/sanityChecks';
import type { CrossCheckResult } from './features/ratios/crossCheck';

export interface Shareholder {
  nombre: string;
  dni_cuit: string;
  participacion: number;
  subAccionistas?: Shareholder[];
}

export type CaseStatus =
  | 'processing'
  | 'completed'
  | 'completed_partial'
  | 'error';

export interface ExtractionResult {
  id: string;
  timestamp: string;
  fileNames: string[];
  schemaVersion: 2;
  status: CaseStatus;
  extraction: RawExtraction | null;
  ratios: ComputedRatios | null;
  inconsistencias: Inconsistencia[];
  crossCheck: CrossCheckResult | null;
  verification: VerificationResult | null;
  marketAnalysis: string | null;
  error?: string;
}

import type { CompanyHistory, RawExtraction, VerificationResult } from './features/extraction/schemas';
import type { ComputedRatios } from './features/ratios/calculations';
import type { Inconsistencia } from './features/ratios/sanityChecks';
import type { CrossCheckResult } from './features/ratios/crossCheck';
import type { RiskAssessment } from './features/risk/assessment';

export interface Shareholder {
  nombre: string;
  dni_cuit: string;
  participacion: number | null;
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
  // Historia, core business y proyecciones leídas de la Memoria. null en casos viejos.
  companyHistory: CompanyHistory | null;
  // Opinión de riesgo integral (último paso). null en casos viejos o si falló.
  riskAssessment: RiskAssessment | null;
  // Fecha ISO de la última edición manual de valores en el dashboard.
  editedAt?: string;
  error?: string;
}

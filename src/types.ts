import type { CompanyHistory, RawExtraction, VerificationResult } from './features/extraction/schemas';
import type { ComputedRatios } from './features/ratios/calculations';
import type { Inconsistencia } from './features/ratios/sanityChecks';
import type { CrossCheckResult } from './features/ratios/crossCheck';
import type { RiskAssessment } from './features/risk/assessment';
import type { ProyeccionesGuardadas } from './features/projections/types';
import type { SectorCaso } from './features/risk/porton';
import type { DocumentoSectorial } from './features/sectorDocs/tipos';
import type { BloqueTexto } from './features/textos/bloques';

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
  // Supuestos editados de la pestaña Proyecciones (no tocan la extracción).
  proyecciones: ProyeccionesGuardadas | null;
  // Rubro sugerido y confirmado por el analista (portón de la evaluación).
  // Casos viejos: se sugiere al cargar y queda sin confirmar.
  sector?: SectorCaso | null;
  // Documentos propios del rubro (ej. reporte de mora): declarados, no auditados.
  // Se guarda lo extraído y los datos del archivo, no el archivo.
  documentosSectoriales?: DocumentoSectorial[];
  // Versiones editadas por el analista (por bloques) de Historia y de Mercado.
  // El original de la IA no se toca; null = se usa el original.
  historiaEditada?: BloqueTexto[] | null;
  mercadoEditado?: BloqueTexto[] | null;
  // Fecha ISO de la última edición manual de valores en el dashboard.
  editedAt?: string;
  error?: string;
}

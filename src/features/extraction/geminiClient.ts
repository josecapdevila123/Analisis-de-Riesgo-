import { FINANCIAL_BLOCK_PROMPT, SECTOR_DOC_PROMPTS } from '../../lib/prompts/sectorDocs';
import { ExtraccionDocumento, SCHEMAS_DOCUMENTOS, TipoDocumentoSectorial } from '../sectorDocs/tipos';
import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_MODELS,
  GeminiStage,
  GEMINI_GENERATION_CONFIG,
  GEMINI_MAX_RETRIES,
  GEMINI_BASE_DELAY_MS,
} from '../../lib/gemini';
import { EXTRACTION_PROMPT } from '../../lib/prompts/extraction';
import { VERIFICATION_PROMPT } from '../../lib/prompts/verification';
import { MARKET_ANALYSIS_PROMPT } from '../../lib/prompts/marketAnalysis';
import { COMPANY_HISTORY_PROMPT } from '../../lib/prompts/companyHistory';
import { RISK_OPINION_PROMPT } from '../../lib/prompts/riskOpinion';
import {
  RawExtraction,
  RawExtractionSchema,
  ExtraccionFinancieraSchema,
  ExtraccionFinanciera,
  VerificationResult,
  VerificationResultSchema,
  MarketAnalysisResultSchema,
  CompanyHistory,
  CompanyHistorySchema,
  RiskOpinion,
  RiskOpinionSchema,
} from './schemas';
import { ComputedRatios } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';

// `texto`: contenido de una planilla (Excel/CSV) ya convertida a texto, porque
// Gemini no lee esos formatos como archivo.
export type UploadedFile = { file: File; preview: string; texto?: string };

type GeminiPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

const buildClient = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const filesToParts = (files: UploadedFile[]): GeminiPart[] =>
  files.map(f => f.texto !== undefined
    ? { text: `\n\nARCHIVO "${f.file.name}" (planilla convertida a texto: una tabla CSV por hoja):\n${f.texto}` }
    : {
        inlineData: {
          data: f.preview.split(',')[1],
          mimeType: f.file.type,
        },
      });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 429 (cuota), 500/503/504 (saturación o falla temporal de Google) se reintentan.
const isRetryableError = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status;
  if (status !== undefined) return [429, 500, 503, 504].includes(status);
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|500|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(message);
};

async function generateWithRetry(model: string, parts: GeminiPart[]): Promise<string> {
  const ai = buildClient();
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ parts }],
        config: GEMINI_GENERATION_CONFIG,
      });
      const text = response.text;
      if (!text) throw new Error('Respuesta vacía del modelo.');
      return text;
    } catch (err) {
      if (!isRetryableError(err) || attempt >= GEMINI_MAX_RETRIES) throw err;
      // Backoff exponencial con jitter: ~2s, 4s, 8s, 16s.
      const delay = GEMINI_BASE_DELAY_MS * 2 ** attempt + Math.random() * 1000;
      console.warn(`Gemini ${model} no disponible (intento ${attempt + 1}), reintentando en ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
}

async function callGemini(stage: GeminiStage, parts: GeminiPart[]): Promise<string> {
  const { primary, fallback } = GEMINI_MODELS[stage];
  try {
    return await generateWithRetry(primary, parts);
  } catch (err) {
    if (!isRetryableError(err)) throw err;
    console.warn(`Gemini ${primary} saturado, usando ${fallback}`);
    try {
      return await generateWithRetry(fallback, parts);
    } catch (fallbackErr) {
      if (!isRetryableError(fallbackErr)) throw fallbackErr;
      throw new Error('El servicio de IA de Google está saturado en este momento. Probá de nuevo en unos minutos.');
    }
  }
}

export async function runExtraction(files: UploadedFile[]): Promise<RawExtraction> {
  const text = await callGemini('extraction', [{ text: EXTRACTION_PROMPT }, ...filesToParts(files)]);
  const parsed = JSON.parse(text);
  return RawExtractionSchema.parse(parsed);
}

export async function runVerification(
  files: UploadedFile[],
  extraction: RawExtraction,
  ratios: ComputedRatios,
  inconsistencias: Inconsistencia[],
  crossCheck: CrossCheckResult,
  // Rubro como contexto (durante el análisis es solo la sugerencia, sin confirmar).
  rubro: { rubro: string; confirmado: boolean } | null = null
): Promise<VerificationResult> {
  const context = JSON.stringify({ extraction, ratios, inconsistencias, crossCheck, rubro }, null, 2);
  const text = await callGemini('verification', [
    { text: VERIFICATION_PROMPT },
    { text: `\n\nDATOS A VERIFICAR:\n${context}` },
    ...filesToParts(files),
  ]);
  const parsed = JSON.parse(text);
  return VerificationResultSchema.parse(parsed);
}

export async function runMarketAnalysis(
  files: UploadedFile[],
  extraction: RawExtraction
): Promise<string> {
  const profile = JSON.stringify(extraction.company_profile, null, 2);
  const text = await callGemini('marketAnalysis', [
    { text: MARKET_ANALYSIS_PROMPT },
    { text: `\n\nPERFIL DE LA EMPRESA:\n${profile}` },
    ...filesToParts(files),
  ]);
  const parsed = JSON.parse(text);
  const validated = MarketAnalysisResultSchema.parse(parsed);
  return validated.analisis_mercado;
}


export async function runCompanyHistory(
  files: UploadedFile[],
  extraction: RawExtraction
): Promise<CompanyHistory> {
  const profile = JSON.stringify(extraction.company_profile, null, 2);
  const text = await callGemini('companyHistory', [
    { text: COMPANY_HISTORY_PROMPT },
    { text: `\n\nPERFIL DE LA EMPRESA:\n${profile}` },
    ...filesToParts(files),
  ]);
  return CompanyHistorySchema.parse(JSON.parse(text));
}

// Solo texto: toda la información ya fue extraída, no hace falta reenviar los archivos.
export async function runRiskOpinion(contextJson: string): Promise<RiskOpinion> {
  const text = await callGemini('riskOpinion', [
    { text: RISK_OPINION_PROMPT },
    { text: `\n\nINFORMACIÓN DEL ANÁLISIS:\n${contextJson}` },
  ]);
  return RiskOpinionSchema.parse(JSON.parse(text));
}

// Bloque financiero de los EECC (financieras): a demanda, con el balance.
export async function runFinancialBlockExtraction(files: UploadedFile[]): Promise<ExtraccionFinanciera> {
  const text = await callGemini('financialBlock', [{ text: FINANCIAL_BLOCK_PROMPT }, ...filesToParts(files)]);
  const parsed = ExtraccionFinancieraSchema.parse(JSON.parse(text));
  if (!parsed) throw new Error('No se pudo leer el bloque financiero del balance.');
  return parsed;
}

// Documento sectorial (reporte de mora, etc.): schema y prompt según el tipo.
export async function runSectorDocExtraction(tipo: TipoDocumentoSectorial, files: UploadedFile[]): Promise<ExtraccionDocumento> {
  const text = await callGemini('sectorDoc', [{ text: SECTOR_DOC_PROMPTS[tipo] }, ...filesToParts(files)]);
  return SCHEMAS_DOCUMENTOS[tipo].parse(JSON.parse(text)) as ExtraccionDocumento;
}

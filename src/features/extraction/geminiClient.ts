import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL, GEMINI_GENERATION_CONFIG } from '../../lib/gemini';
import { EXTRACTION_PROMPT } from '../../lib/prompts/extraction';
import { VERIFICATION_PROMPT } from '../../lib/prompts/verification';
import { MARKET_ANALYSIS_PROMPT } from '../../lib/prompts/marketAnalysis';
import {
  RawExtraction,
  RawExtractionSchema,
  VerificationResult,
  VerificationResultSchema,
  MarketAnalysisResultSchema,
} from './schemas';
import { ComputedRatios } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';

export type UploadedFile = { file: File; preview: string };

type GeminiPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

const buildClient = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const filesToParts = (files: UploadedFile[]): GeminiPart[] =>
  files.map(f => ({
    inlineData: {
      data: f.preview.split(',')[1],
      mimeType: f.file.type,
    },
  }));

async function callGemini(parts: GeminiPart[]): Promise<string> {
  const ai = buildClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ parts }],
    config: GEMINI_GENERATION_CONFIG,
  });
  const text = response.text;
  if (!text) throw new Error('Respuesta vacía del modelo.');
  return text;
}

export async function runExtraction(files: UploadedFile[]): Promise<RawExtraction> {
  const text = await callGemini([{ text: EXTRACTION_PROMPT }, ...filesToParts(files)]);
  const parsed = JSON.parse(text);
  return RawExtractionSchema.parse(parsed);
}

export async function runVerification(
  files: UploadedFile[],
  extraction: RawExtraction,
  ratios: ComputedRatios,
  inconsistencias: Inconsistencia[],
  crossCheck: CrossCheckResult
): Promise<VerificationResult> {
  const context = JSON.stringify({ extraction, ratios, inconsistencias, crossCheck }, null, 2);
  const text = await callGemini([
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
  const text = await callGemini([
    { text: MARKET_ANALYSIS_PROMPT },
    { text: `\n\nPERFIL DE LA EMPRESA:\n${profile}` },
    ...filesToParts(files),
  ]);
  const parsed = JSON.parse(text);
  const validated = MarketAnalysisResultSchema.parse(parsed);
  return validated.analisis_mercado;
}

// ---------------------------------------------------------------------------
// Legacy: App.tsx aún importa extractFromFiles. Se removerá cuando se rewire
// el consumidor al nuevo runPipeline.
// ---------------------------------------------------------------------------

export type ExtractionPayload = { data: any; dashboardData: any };

export async function extractFromFiles(files: UploadedFile[]): Promise<ExtractionPayload> {
  const extraction = await runExtraction(files);
  return { data: extraction as any, dashboardData: null };
}

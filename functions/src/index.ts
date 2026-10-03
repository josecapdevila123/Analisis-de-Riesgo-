import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import {
  RawExtractionSchema,
  VerificationResultSchema,
  MarketAnalysisResultSchema,
} from '../../src/features/extraction/schemas.js';
import { callGemini, type GeminiPart } from './gemini.js';
import { ALLOWED_MIME_TYPES, MAX_FILES, REGION } from './config.js';
import { EXTRACTION_PROMPT } from './prompts/extraction.js';
import { VERIFICATION_PROMPT } from './prompts/verification.js';
import { MARKET_ANALYSIS_PROMPT } from './prompts/marketAnalysis.js';

// La key vive en Secret Manager: `firebase functions:secrets:set GEMINI_API_KEY`.
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const callableOptions = {
  region: REGION,
  secrets: [GEMINI_API_KEY],
  // Extracción con reintentos y modelo de respaldo puede tardar varios minutos.
  timeoutSeconds: 540,
  memory: '1GiB' as const,
};

// ---------- Entrada ----------

const FileSchema = z.object({
  data: z.string().min(1), // base64 sin el prefijo data:
  mimeType: z.enum(ALLOWED_MIME_TYPES),
});
const FilesSchema = z.array(FileSchema).min(1).max(MAX_FILES);

const ExtractInput = z.object({ files: FilesSchema });

const VerifyInput = z.object({
  files: FilesSchema,
  extraction: RawExtractionSchema,
  ratios: z.record(z.string(), z.unknown()),
  inconsistencias: z.array(z.unknown()),
  crossCheck: z.record(z.string(), z.unknown()),
});

const MarketAnalysisInput = z.object({
  files: FilesSchema,
  profile: z.record(z.string(), z.unknown()),
});

// ---------- Helpers ----------

const requireAuth = (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Tenés que iniciar sesión para usar el análisis.');
  }
};

const parseInput = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpsError('invalid-argument', `Datos de entrada inválidos: ${issue.path.join('.')} ${issue.message}`);
  }
  return result.data;
};

// Valida la respuesta del modelo con los mismos schemas Zod que usa el front.
const parseModelResponse = <T extends z.ZodType>(schema: T, text: string, etapa: string): z.infer<T> => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    logger.error(`Respuesta no JSON en ${etapa}`, { text: text.slice(0, 500) });
    throw new HttpsError('internal', `La respuesta del modelo (${etapa}) no es JSON válido.`);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    logger.error(`Respuesta fuera de schema en ${etapa}`, { issues: result.error.issues.slice(0, 10) });
    throw new HttpsError('internal', `La respuesta del modelo (${etapa}) no tiene el formato esperado.`);
  }
  return result.data;
};

const filesToParts = (files: z.infer<typeof FilesSchema>): GeminiPart[] =>
  files.map(f => ({ inlineData: { data: f.data, mimeType: f.mimeType } }));

// ---------- Funciones callable ----------

export const extract = onCall(callableOptions, async request => {
  requireAuth(request);
  const { files } = parseInput(ExtractInput, request.data);
  const text = await callGemini(GEMINI_API_KEY.value(), [
    { text: EXTRACTION_PROMPT },
    ...filesToParts(files),
  ]);
  return parseModelResponse(RawExtractionSchema, text, 'extracción');
});

export const verify = onCall(callableOptions, async request => {
  requireAuth(request);
  const { files, extraction, ratios, inconsistencias, crossCheck } = parseInput(VerifyInput, request.data);
  const context = JSON.stringify({ extraction, ratios, inconsistencias, crossCheck }, null, 2);
  const text = await callGemini(GEMINI_API_KEY.value(), [
    { text: VERIFICATION_PROMPT },
    { text: `\n\nDATOS A VERIFICAR:\n${context}` },
    ...filesToParts(files),
  ]);
  return parseModelResponse(VerificationResultSchema, text, 'verificación');
});

export const marketAnalysis = onCall(callableOptions, async request => {
  requireAuth(request);
  const { files, profile } = parseInput(MarketAnalysisInput, request.data);
  const text = await callGemini(GEMINI_API_KEY.value(), [
    { text: MARKET_ANALYSIS_PROMPT },
    { text: `\n\nPERFIL DE LA EMPRESA:\n${JSON.stringify(profile, null, 2)}` },
    ...filesToParts(files),
  ]);
  return parseModelResponse(MarketAnalysisResultSchema, text, 'análisis de mercado').analisis_mercado;
});

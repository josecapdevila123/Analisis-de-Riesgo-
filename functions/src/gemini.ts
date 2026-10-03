import { GoogleGenAI } from '@google/genai';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  GEMINI_MODEL,
  GEMINI_FALLBACK_MODEL,
  GEMINI_GENERATION_CONFIG,
  GEMINI_MAX_RETRIES,
  GEMINI_BASE_DELAY_MS,
} from './config.js';

export type GeminiPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 429 (cuota), 500/503/504 (saturación o falla temporal de Google) se reintentan.
const isRetryableError = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status;
  if (status !== undefined) return [429, 500, 503, 504].includes(status);
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|500|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(message);
};

async function generateWithRetry(ai: GoogleGenAI, model: string, parts: GeminiPart[]): Promise<string> {
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
      logger.warn(`Gemini ${model} no disponible (intento ${attempt + 1}), reintentando en ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
}

// Devuelve el texto JSON del modelo. Los errores salen como HttpsError para que
// el front reciba un mensaje legible (los errores no-HttpsError llegan como "INTERNAL").
export async function callGemini(apiKey: string, parts: GeminiPart[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  try {
    return await generateWithRetry(ai, GEMINI_MODEL, parts);
  } catch (err) {
    if (!isRetryableError(err)) {
      logger.error('Gemini falló', err);
      throw new HttpsError('internal', 'Falló la llamada al modelo de IA.');
    }
    logger.warn(`Gemini ${GEMINI_MODEL} saturado, usando ${GEMINI_FALLBACK_MODEL}`);
    try {
      return await generateWithRetry(ai, GEMINI_FALLBACK_MODEL, parts);
    } catch (fallbackErr) {
      logger.error('Gemini (modelo de respaldo) falló', fallbackErr);
      if (!isRetryableError(fallbackErr)) {
        throw new HttpsError('internal', 'Falló la llamada al modelo de IA.');
      }
      throw new HttpsError(
        'unavailable',
        'El servicio de IA de Google está saturado en este momento. Probá de nuevo en unos minutos.'
      );
    }
  }
}

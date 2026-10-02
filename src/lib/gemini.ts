export const GEMINI_MODEL = 'gemini-2.5-flash';
// Se usa solo si el modelo principal sigue saturado después de los reintentos.
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

export const GEMINI_MAX_RETRIES = 4;
export const GEMINI_BASE_DELAY_MS = 2000;

export const GEMINI_GENERATION_CONFIG = {
  responseMimeType: 'application/json',
} as const;

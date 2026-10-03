// Modelo por etapa: { primary, fallback }. El fallback se usa solo si el
// principal sigue saturado después de los reintentos.
// Extracción, verificación e historia definen los números, el dictamen y la
// descripción del negocio: modelo de mayor calidad. Mercado es texto cualitativo: alcanza con Flash-Lite (más rápido).
const FLASH = 'gemini-3.8-flash';
const FLASH_LITE = 'gemini-3.5-flash-lite';

export type GeminiStage = 'extraction' | 'verification' | 'marketAnalysis' | 'companyHistory';

export const GEMINI_MODELS: Record<GeminiStage, { primary: string; fallback: string }> = {
  extraction: { primary: FLASH, fallback: FLASH_LITE },
  verification: { primary: FLASH, fallback: FLASH_LITE },
  marketAnalysis: { primary: FLASH_LITE, fallback: FLASH },
  // Lectura de la Memoria: tiene que ser fiel al documento, mismo modelo que la extracción.
  companyHistory: { primary: FLASH, fallback: FLASH_LITE },
};

export const GEMINI_MAX_RETRIES = 4;
export const GEMINI_BASE_DELAY_MS = 2000;

export const GEMINI_GENERATION_CONFIG = {
  responseMimeType: 'application/json',
} as const;

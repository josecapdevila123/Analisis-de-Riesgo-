export const GEMINI_MODEL = 'gemini-2.5-flash';
// Se usa solo si el modelo principal sigue saturado después de los reintentos.
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

export const GEMINI_MAX_RETRIES = 4;
export const GEMINI_BASE_DELAY_MS = 2000;

export const GEMINI_GENERATION_CONFIG = {
  responseMimeType: 'application/json',
} as const;

// Región de las Cloud Functions. Tiene que coincidir con FUNCTIONS_REGION en src/firebase.ts.
export const REGION = 'us-central1';

// Archivos admitidos y tope por llamada (Cloud Run limita el request a 32 MB).
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_FILES = 20;

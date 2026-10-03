import { httpsCallable } from 'firebase/functions';
import { FirebaseError } from 'firebase/app';
import { functions } from '../../firebase';
import {
  RawExtraction,
  RawExtractionSchema,
  VerificationResult,
  VerificationResultSchema,
} from './schemas';
import { ComputedRatios } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';

// Las llamadas a Gemini corren en Cloud Functions (functions/src/index.ts):
// la API key nunca llega al navegador.

export type UploadedFile = { file: File; preview: string };

type FilePayload = { data: string; mimeType: string };

// Igual al timeoutSeconds de las funciones; el default del SDK (70 s) corta antes.
const CALL_TIMEOUT_MS = 540_000;

// Cloud Run limita el request a 32 MB; el base64 ocupa ~4/3 del archivo.
const MAX_PAYLOAD_BASE64 = 30 * 1024 * 1024;

const filesToPayload = (files: UploadedFile[]): FilePayload[] => {
  const payload = files.map(f => ({
    data: f.preview.split(',')[1],
    mimeType: f.file.type,
  }));
  const total = payload.reduce((acc, f) => acc + f.data.length, 0);
  if (total > MAX_PAYLOAD_BASE64) {
    const mb = (total * 0.75) / (1024 * 1024);
    throw new Error(
      `Los archivos suman ${mb.toFixed(1)} MB y el máximo por análisis es ~22 MB. Comprimí los PDFs o subí menos archivos.`
    );
  }
  return payload;
};

const call = async <Req, Res>(name: string, data: Req): Promise<Res> => {
  const fn = httpsCallable<Req, Res>(functions, name, { timeout: CALL_TIMEOUT_MS });
  try {
    const result = await fn(data);
    return result.data;
  } catch (err) {
    if (err instanceof FirebaseError && err.code === 'functions/deadline-exceeded') {
      throw new Error('El análisis tardó demasiado y se cortó. Probá de nuevo en unos minutos.');
    }
    // Los HttpsError de la función traen un mensaje legible en err.message.
    throw err;
  }
};

export async function runExtraction(files: UploadedFile[]): Promise<RawExtraction> {
  const data = await call<{ files: FilePayload[] }, unknown>('extract', { files: filesToPayload(files) });
  return RawExtractionSchema.parse(data);
}

export async function runVerification(
  files: UploadedFile[],
  extraction: RawExtraction,
  ratios: ComputedRatios,
  inconsistencias: Inconsistencia[],
  crossCheck: CrossCheckResult
): Promise<VerificationResult> {
  const data = await call<object, unknown>('verify', {
    files: filesToPayload(files),
    extraction,
    ratios,
    inconsistencias,
    crossCheck,
  });
  return VerificationResultSchema.parse(data);
}

export async function runMarketAnalysis(
  files: UploadedFile[],
  extraction: RawExtraction
): Promise<string> {
  return call<object, string>('marketAnalysis', {
    files: filesToPayload(files),
    profile: extraction.company_profile,
  });
}

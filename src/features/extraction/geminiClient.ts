import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL, GEMINI_GENERATION_CONFIG } from '../../lib/gemini';
import { EXTRACTION_PROMPT } from '../../lib/prompts/extraction';

export type UploadedFile = { file: File; preview: string };

export type ExtractionPayload = {
  data: any;
  dashboardData: any;
};

export async function extractFromFiles(files: UploadedFile[]): Promise<ExtractionPayload> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = EXTRACTION_PROMPT;

  const contentParts = [
    { text: prompt },
    ...files.map(f => ({
      inlineData: {
        data: f.preview.split(',')[1],
        mimeType: f.file.type
      }
    }))
  ];

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ parts: contentParts }],
    config: GEMINI_GENERATION_CONFIG
  });

  const text = response.text;
  if (!text) throw new Error("No se pudo extraer texto del modelo.");

  return JSON.parse(text);
}

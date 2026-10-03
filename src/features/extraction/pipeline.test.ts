import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExtraction } from '../ratios/__fixtures__/extraction';

// Gemini simulado: solo se controla qué devuelve cada etapa.
const gemini = vi.hoisted(() => ({
  runExtraction: vi.fn(),
  runVerification: vi.fn(),
  runMarketAnalysis: vi.fn(),
  runCompanyHistory: vi.fn(),
  runFinancialBlockExtraction: vi.fn(),
}));
vi.mock('./geminiClient', () => gemini);

import { runPipeline } from './pipeline';

const BLOQUE = {
  fecha_cierre: '2025-12-31', cartera_total: 850, cartera_total_anterior: null, cartera_vencida_por_tramo: [],
  previsiones_incobrabilidad: 30, cargo_incobrabilidad: null, ingresos_financieros: null, egresos_financieros: null,
  creditos_a_vencer_90_dias: null, pasivos_a_vencer_90_dias: null, inversiones_corrientes: null, fondeo: [],
};
const archivos = [{ file: new File(['x'], 'balance.pdf'), preview: 'data:application/pdf;base64,eA==' }];

beforeEach(() => {
  vi.clearAllMocks();
  gemini.runVerification.mockResolvedValue({ alertas_coherencia: [], inconsistencias_explicadas: [], executive_summary: 'x', informe_markdown: 'x' });
  gemini.runMarketAnalysis.mockResolvedValue('mercado');
  gemini.runCompanyHistory.mockResolvedValue(null);
  gemini.runFinancialBlockExtraction.mockResolvedValue(BLOQUE);
});

describe('pipeline: bloque financiero en el mismo análisis', () => {
  it('rubro sugerido Financiera → extrae el bloque con los mismos archivos y lo incorpora', async () => {
    gemini.runExtraction.mockResolvedValue({ ...buildExtraction(), company_profile: { ...buildExtraction().company_profile, activity: 'Servicios financieros y otorgamiento de préstamos' } });
    const r = await runPipeline(archivos);
    expect(gemini.runFinancialBlockExtraction).toHaveBeenCalledWith(archivos);
    expect(r.extraction?.extraccion_financiera).toEqual(BLOQUE);
  });

  it('otro rubro → no lo extrae', async () => {
    gemini.runExtraction.mockResolvedValue(buildExtraction()); // "Venta al por mayor…" → comercio
    const r = await runPipeline(archivos);
    expect(gemini.runFinancialBlockExtraction).not.toHaveBeenCalled();
    expect(r.extraction?.extraccion_financiera ?? null).toBeNull();
  });

  it('si falla el bloque, el análisis sigue (se puede extraer después)', async () => {
    gemini.runExtraction.mockResolvedValue({ ...buildExtraction(), company_profile: { ...buildExtraction().company_profile, activity: 'Factoring y descuento de cheques' } });
    gemini.runFinancialBlockExtraction.mockRejectedValue(new Error('503'));
    const r = await runPipeline(archivos);
    expect(r.state).toBe('completed');
    expect(r.extraction?.extraccion_financiera ?? null).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { FINANCIAL_BLOCK_PROMPT, SECTOR_DOC_PROMPTS } from './sectorDocs';
import { ReporteMoraSchema } from '../../features/sectorDocs/tipos';
import { ExtraccionFinancieraSchema } from '../../features/extraction/schemas';

describe('prompts de documentos sectoriales', () => {
  it('"otro" prohíbe calificar los hechos y pide la cita textual', () => {
    expect(SECTOR_DOC_PROMPTS.otro).toContain('PROHIBIDO calificar');
    expect(SECTOR_DOC_PROMPTS.otro).toContain('cita_textual');
  });

  it('prohíben calcular y piden null si falta', () => {
    for (const p of [FINANCIAL_BLOCK_PROMPT, ...Object.values(SECTOR_DOC_PROMPTS)]) {
      expect(p).toContain('PROHIBIDO calcular');
      expect(p).toContain('devolvé `null`');
    }
  });
});

describe('schemas tolerantes', () => {
  it('reporte de mora: "N/A" y strings con miles → null y números; tramo desconocido → al_dia', () => {
    const r = ReporteMoraSchema.parse({ fecha_corte: '2026-03-31', tramos: [{ tramo: '91-180', monto: '1.234,5' }, { tramo: 'raro', monto: 'N/A' }], previsiones: 'N/A', por_producto: 'no' });
    expect(r.tramos).toEqual([{ tramo: '91-180', monto: 1234.5 }, { tramo: 'al_dia', monto: null }]);
    expect(r.previsiones).toBeNull();
    expect(r.por_producto).toBeNull();
  });

  it('bloque financiero: fuente desconocida → otros; listas ausentes → []', () => {
    const f = ExtraccionFinancieraSchema.parse({ cartera_total: 850, fondeo: [{ fuente: 'cooperativa', monto: 10 }] });
    expect(f?.fondeo[0].fuente).toBe('otros');
    expect(f?.cartera_vencida_por_tramo).toEqual([]);
    expect(f?.previsiones_incobrabilidad).toBeNull();
  });
});

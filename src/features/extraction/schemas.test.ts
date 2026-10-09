import { describe, expect, it } from 'vitest';
import { CompanyHistorySchema } from './schemas';

describe('CompanyHistorySchema', () => {
  it('acepta una respuesta completa', () => {
    const parsed = CompanyHistorySchema.parse({
      memoria_disponible: true,
      core_business: 'Distribuye artículos de iluminación a mayoristas del AMBA.',
      historia: 'Fundada en 2018.',
      datos_relevantes: ['45 empleados'],
      proyecciones: ['Abrir un depósito en Córdoba en 2026'],
      explicaciones_balance: [{ tema: 'Ventas', explicacion: 'Crecieron por nuevos clientes.' }],
    });
    expect(parsed.core_business).toContain('iluminación');
    expect(parsed.explicaciones_balance).toHaveLength(1);
  });

  it('tolera nulls y campos faltantes del modelo', () => {
    const parsed = CompanyHistorySchema.parse({
      memoria_disponible: 'no sé',
      core_business: 'Fabrica envases.',
      historia: null,
      proyecciones: null,
      explicaciones_balance: [{ tema: 'Deuda', explicacion: null }],
    });
    expect(parsed).toEqual({
      memoria_disponible: false,
      core_business: 'Fabrica envases.',
      historia: '',
      datos_relevantes: [],
      proyecciones: [],
      explicaciones_balance: [{ tema: 'Deuda', explicacion: '' }],
    });
  });
});

describe('RawExtractionSchema: perfil de la empresa', () => {
  it('acepta datos de la empresa en null (vacíos) en vez de cortar el caso', async () => {
    const { RawExtractionSchema } = await import('./schemas');
    const { buildExtraction } = await import('../ratios/__fixtures__/extraction');
    const raw = JSON.parse(JSON.stringify(buildExtraction()));
    raw.company_profile = { name: null, cuit: null, activity: null, anio_actual: null, anio_anterior: undefined };
    const r = RawExtractionSchema.safeParse(raw);
    expect(r.success).toBe(true);
    expect(r.success && r.data.company_profile).toEqual({ name: '', cuit: '', activity: '', anio_actual: '', anio_anterior: '' });
  });
});

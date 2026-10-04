import { describe, expect, it } from 'vitest';
import { coreBusinessDe, historiaABloques, markdownABloques } from './bloques';
import { armarContextoOpinion } from '../risk/contextoOpinion';
import { perfilEfectivo } from '../risk/policy';
import { confirmarRubro, sectorInicial } from '../risk/porton';
import { computeRatios } from '../ratios/calculations';
import { buildExtraction } from '../ratios/__fixtures__/extraction';

const historia = { memoria_disponible: true, core_business: 'Distribuye congelados.', historia: 'SECRETO-HISTORIA', datos_relevantes: [], proyecciones: [], explicaciones_balance: [] };
const mercado = '## Sector\nCrece.\n\n## Riesgos\nSECRETO-MERCADO';

describe('lo que el analista saca no llega a la opinión', () => {
  const e = buildExtraction();
  const perfil = perfilEfectivo('comercio');
  const base = {
    extraction: e, ratios: computeRatios(e, perfil), inconsistencias: [], crossCheck: null, verification: null,
    marketAnalysis: mercado, companyHistory: historia, pce: null, perfil, senales: [],
    sector: confirmarRubro(sectorInicial(e), 'comercio', '', '', null),
  };

  it('sin edición, va el original', () => {
    const json = JSON.stringify(armarContextoOpinion(base));
    expect(json).toContain('SECRETO-HISTORIA');
    expect(json).toContain('SECRETO-MERCADO');
  });

  it('con bloques sacados, no van', () => {
    const historiaEditada = historiaABloques(historia).filter(b => b.titulo !== 'Historia');
    const mercadoEditado = markdownABloques(mercado).filter(b => b.titulo !== 'Riesgos');
    const json = JSON.stringify(armarContextoOpinion({ ...base, historiaEditada, mercadoEditado }));
    expect(json).not.toContain('SECRETO-HISTORIA');
    expect(json).not.toContain('SECRETO-MERCADO');
    expect(json).toContain('Distribuye congelados.');
  });
});

describe('qué hace la empresa (resumen y PDF)', () => {
  it('usa el bloque Core business editado; si se sacó, nada', () => {
    const b = historiaABloques(historia);
    expect(coreBusinessDe({ companyHistory: historia })).toBe('Distribuye congelados.');
    expect(coreBusinessDe({ companyHistory: historia, historiaEditada: b.map(x => x.titulo === 'Core business' ? { ...x, texto: 'Editado.' } : x) })).toBe('Editado.');
    expect(coreBusinessDe({ companyHistory: historia, historiaEditada: b.filter(x => x.titulo !== 'Core business') })).toBeNull();
  });
});

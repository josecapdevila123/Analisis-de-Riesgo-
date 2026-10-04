import { describe, expect, it } from 'vitest';
import { agruparPorEmpresa, estadoCorrida, filtrarGrupos } from './historial';
import { buildExtraction } from '../ratios/__fixtures__/extraction';
import { confirmarRubro, sectorInicial } from '../risk/porton';
import { perfilEfectivo, POLICY_VERSION } from '../risk/policy';
import type { ExtractionResult } from '../../types';

const caso = (id: string, timestamp: string, nombre: string | null, cuit: string | null, extra: Partial<ExtractionResult> = {}): ExtractionResult => {
  const e = buildExtraction();
  return {
    id, timestamp, fileNames: ['balance.pdf'], schemaVersion: 2, status: 'completed',
    extraction: nombre === null && cuit === null ? null : { ...e, company_profile: { ...e.company_profile, name: nombre ?? 'N/A', cuit: cuit ?? 'N/A' } },
    ratios: null, inconsistencias: [], crossCheck: null, verification: null, marketAnalysis: null,
    companyHistory: null, riskAssessment: null, proyecciones: null, ...extra,
  };
};

describe('agrupar por empresa', () => {
  const casos = [
    caso('a1', '2026-10-01T10:00:00Z', 'Cedisur S.A.', '30-67281280-8'),
    caso('a2', '2026-10-03T09:00:00Z', 'CEDISUR SA', '30672812808'),
    caso('a3', '2026-06-05T09:00:00Z', 'Cedisur S.A.', null),       // sin CUIT: se suma por nombre
    caso('b1', '2026-10-02T09:00:00Z', 'Akai Energy LED SRL', '30-11111111-1'),
    caso('p1', '2026-10-04T08:00:00Z', null, null, { status: 'processing' }), // sin datos todavía
  ];
  const g = agruparPorEmpresa(casos);

  it('una fila por empresa: CUIT con o sin guiones; sin CUIT, por razón social normalizada', () => {
    const cedisur = g.find(x => x.cuit === '30672812808')!;
    expect(cedisur.corridas.map(c => c.id)).toEqual(['a2', 'a1', 'a3']);
    expect(cedisur.ultima.id).toBe('a2');
  });

  it('ordenadas por la corrida más reciente; lo que está en proceso sin datos va como fila propia', () => {
    expect(g.map(x => x.ultima.id)).toEqual(['p1', 'a2', 'b1']);
    expect(g[0].nombre).toBe('1 archivo(s)');
  });
});

describe('buscador', () => {
  const g = agruparPorEmpresa([
    caso('a1', '2026-10-01T10:00:00Z', 'Cédisur S.A.', '30-67281280-8'),
    caso('b1', '2026-10-02T09:00:00Z', 'Akai Energy LED SRL', '30-11111111-1'),
  ]);
  it('sin mayúsculas ni acentos, por razón social o por CUIT (con o sin guiones)', () => {
    expect(filtrarGrupos(g, 'CEDISUR').map(x => x.nombre)).toEqual(['Cédisur S.A.']);
    expect(filtrarGrupos(g, 'énergy').map(x => x.nombre)).toEqual(['Akai Energy LED SRL']);
    expect(filtrarGrupos(g, '30-6728').length).toBe(1);
    expect(filtrarGrupos(g, '').length).toBe(2);
    expect(filtrarGrupos(g, 'zzz')).toEqual([]);
  });
});

describe('estado de la corrida (igual que el dashboard)', () => {
  const e = buildExtraction();
  const opinion: any = { puntaje: { final: 50, categoria: 'moderado', ponderado: 50, piso: null }, perfil: perfilEfectivo('comercio'), politicaVersion: POLICY_VERSION, documentosFirma: '' };
  const confirmado = confirmarRubro(sectorInicial(e), 'comercio', '', '', null);

  it('en proceso y error', () => {
    expect(estadoCorrida(caso('x', '2026-01-01', null, null, { status: 'processing' })).etiqueta).toBe('En proceso');
    expect(estadoCorrida(caso('x', '2026-01-01', null, null, { status: 'error' })).etiqueta).toBe('Error');
  });
  it('sin rubro confirmado → "Pendiente de documentación", aunque tenga opinión (portón)', () => {
    expect(estadoCorrida(caso('x', '2026-01-01', 'A', null, { riskAssessment: opinion })).etiqueta).toBe('Pendiente de documentación');
  });
  it('rubro confirmado sin opinión → "Sin opinión"; con opinión vigente → score y categoría', () => {
    expect(estadoCorrida(caso('x', '2026-01-01', 'A', null, { sector: confirmado })).etiqueta).toBe('Sin opinión');
    expect(estadoCorrida(caso('x', '2026-01-01', 'A', null, { sector: confirmado, riskAssessment: opinion }))).toMatchObject({ tipo: 'score', score: 50, etiqueta: 'Moderado' });
  });
  it('rubro cambiado después de la opinión → "Desactualizada"', () => {
    const otro = confirmarRubro(confirmado, 'industria', 'Fabrica lo que vende', '', null);
    expect(estadoCorrida(caso('x', '2026-01-01', 'A', null, { sector: otro, riskAssessment: opinion })).etiqueta).toBe('Desactualizada');
  });
});

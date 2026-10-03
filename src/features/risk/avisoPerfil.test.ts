import { describe, expect, it } from 'vitest';
import { avisoPerfil } from './avisoPerfil';
import { perfilEfectivo, POLICY_VERSION } from './policy';
import { confirmarRubro, sectorInicial } from './porton';
import { buildExtraction } from '../ratios/__fixtures__/extraction';

const sector = sectorInicial(buildExtraction()); // sugiere comercio

describe('aviso del perfil de evaluación', () => {
  it('comercio: diferencias calculadas contra el genérico, sin texto a mano', () => {
    const a = avisoPerfil(perfilEfectivo('comercio'), confirmarRubro(sector, 'comercio', '', '', 'ana@bibank.com', new Date('2026-10-03T12:00:00Z')));
    expect(a.titulo).toBe('Perfil de evaluación: Comercio y distribución.');
    expect(a.confirmacion).toBe('Confirmado por ana@bibank.com el 03/10/2026.');
    expect(a.cambio).toBeNull();
    expect(a.diferencias).toContain('Margen EBITDA (sano > 5% vs. 10%; alerta 2% vs. 5%)');
    expect(a.diferencias).toContain('Prueba ácida (sano > 0,8x vs. 1x; alerta 0,5x vs. 0,7x)');
    expect(a.diferencias.some(d => d.startsWith('Señal de pasivo / PN (4x / 6x vs. 3x / 5x)'))).toBe(true);
    expect(a.kpis[0]).toBe('Días de stock');
  });

  it('cambio de rubro: muestra el sugerido y el motivo', () => {
    const a = avisoPerfil(perfilEfectivo('agro'), confirmarRubro(sector, 'agro', 'Es productor de granos', '', null));
    expect(a.cambio).toBe('Sugerido: Comercio y distribución. Motivo del cambio: Es productor de granos');
    expect(a.noAplican.map(n => n.split(' (')[0]).sort()).toEqual(['Calidad de la ganancia', 'Prueba ácida']);
    expect(a.ajustes).toContain('El semáforo del margen EBITDA usa el promedio de los dos ejercicios');
  });

  it('genérico: sin diferencias', () => {
    const a = avisoPerfil(perfilEfectivo('generico'), null);
    expect(a.esGenerico).toBe(true);
    expect(a.diferencias).toEqual([]);
    expect(a.noAplican).toEqual([]);
  });

  it('foto con una versión anterior → aviso de versión', () => {
    const a = avisoPerfil({ ...perfilEfectivo('generico'), version: '1.0.0' }, null);
    expect(a.versionDesactualizada).toBe(`Evaluado con política v1.0.0; vigente v${POLICY_VERSION}.`);
    expect(a.politica).toMatch(/^Política de riesgos v1\.0\.0 — Propuesta inicial/);
  });
});

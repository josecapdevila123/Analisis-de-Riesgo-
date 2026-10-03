import { describe, expect, it } from 'vitest';
import { hayUnidades, serieUnidades, totalesUnidades } from './unidades';

// Azucarera, toneladas: enero 320 vs 300, febrero 280 vs 350, marzo 400 sin comparativo.
// Enero viene además en una fila en dólares sin cantidad.
const ventas = [
  { mes: 'Enero 2025', cantidad: 320, cantidad_anio_anterior: 300 },
  { mes: 'Enero 2025', cantidad: null, cantidad_anio_anterior: null },
  { mes: 'Febrero 2025', cantidad: 280, cantidad_anio_anterior: 350 },
  { mes: 'Marzo 2025', cantidad: 400, cantidad_anio_anterior: null },
];

describe('serieUnidades', () => {
  const serie = serieUnidades(ventas);

  it('un punto por mes, en el orden del documento', () => {
    expect(serie.map(p => p.mes)).toEqual(['Enero 2025', 'Febrero 2025', 'Marzo 2025']);
  });

  it('la fila sin cantidad no pisa ni duplica: enero 320 vs 300', () => {
    expect(serie[0]).toMatchObject({ cantidad: 320, cantidadAnterior: 300 });
  });

  it('variación por mes: enero +6,67%, febrero −20%, marzo sin comparativo', () => {
    expect(serie[0].variacion).toBeCloseTo((20 / 300) * 100, 10);
    expect(serie[1].variacion).toBeCloseTo(-20, 10);
    expect(serie[2].variacion).toBeNull();
  });

  it('si un mes trae cantidades en dos filas, las suma', () => {
    const s = serieUnidades([{ mes: 'Abril', cantidad: 10, cantidad_anio_anterior: 5 }, { mes: 'Abril', cantidad: 2, cantidad_anio_anterior: 1 }]);
    expect(s[0]).toMatchObject({ cantidad: 12, cantidadAnterior: 6 });
  });
});

describe('totalesUnidades', () => {
  it('total 1.000 t; variación solo con meses comparables: (600 − 650) / 650 = −7,69%', () => {
    const t = totalesUnidades(serieUnidades(ventas));
    expect(t.total).toBe(1000);
    expect(t.totalAnterior).toBe(650);
    expect(t.mesesComparables).toBe(2);
    expect(t.variacion).toBeCloseTo((-50 / 650) * 100, 10);
  });
});

describe('hayUnidades', () => {
  it('sin cantidades (caso viejo) → false', () => {
    expect(hayUnidades(serieUnidades([{ mes: 'Enero' }, { mes: 'Febrero', cantidad: null }]))).toBe(false);
    expect(hayUnidades(serieUnidades(ventas))).toBe(true);
  });
});

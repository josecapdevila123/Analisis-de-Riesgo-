import { describe, expect, it } from 'vitest';
import { etiquetaPeriodo, mesesDeSerie, normalizarPeriodo, serieTotal, seriePorEntidad, variacion, variacionTotalPeriodo } from './evolucion';

// Dos bancos durante 13 meses (2024-06 a 2025-06), en miles de $:
// Banco A: 100 todos los meses; situación 2 en 2025-01.
// Banco B: aparece en 2024-12 con 50 y sube 10 por mes hasta 110 en 2025-06.
const filas = [
  ...Array.from({ length: 13 }, (_, i) => {
    const mes = ((5 + i) % 12) + 1;
    const anio = 2024 + Math.floor((5 + i) / 12);
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    return { periodo, entidad: 'Banco A', monto: 100, situacion: periodo === '2025-01' ? 2 : 1 };
  }),
  ...['2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'].map((periodo, i) => ({
    periodo, entidad: 'Banco B', monto: 50 + 10 * i, situacion: 1,
  })),
];

describe('normalizarPeriodo', () => {
  it.each([
    ['2025-06', '2025-06'],
    ['2025/6', '2025-06'],
    ['06/2025', '2025-06'],
    ['6-2025', '2025-06'],
    ['jun-25', '2025-06'],
    ['Junio 2025', '2025-06'],
    ['set-24', '2024-09'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarPeriodo(entrada)).toBe(esperado);
  });

  it('descarta lo que no es un mes', () => {
    expect(normalizarPeriodo('2025-13')).toBeNull();
    expect(normalizarPeriodo('N/A')).toBeNull();
    expect(normalizarPeriodo(null)).toBeNull();
  });
});

describe('serieTotal', () => {
  const serie = serieTotal(filas);

  it('un punto por mes, ordenado', () => {
    expect(serie).toHaveLength(13);
    expect(serie[0].periodo).toBe('2024-06');
    expect(serie[12].periodo).toBe('2025-06');
  });

  it('suma las entidades: 100 hasta nov-24, 150 en dic-24, 210 en jun-25', () => {
    expect(serie[0].total).toBe(100);
    expect(serie[6].total).toBe(150);
    expect(serie[12].total).toBe(210);
  });

  it('peor situación del mes y cantidad de entidades con deuda', () => {
    expect(serie.find(p => p.periodo === '2025-01')?.peorSituacion).toBe(2);
    expect(serie[12].peorSituacion).toBe(1);
    expect(serie[0].entidades).toBe(1);
    expect(serie[12].entidades).toBe(2);
  });

  it('la fila TOTAL se usa solo en meses sin apertura por entidad', () => {
    const s = serieTotal([
      { periodo: '2025-01', entidad: 'TOTAL', monto: 300, situacion: 1 },
      { periodo: '2025-02', entidad: 'TOTAL', monto: 999, situacion: 1 },
      { periodo: '2025-02', entidad: 'Banco A', monto: 320, situacion: 1 },
    ]);
    expect(s.map(p => p.total)).toEqual([300, 320]);
  });

  it('ignora filas sin período válido o sin monto', () => {
    const s = serieTotal([
      { periodo: 'N/A', entidad: 'Banco A', monto: 100, situacion: 1 },
      { periodo: '2025-01', entidad: 'Banco A', monto: null, situacion: 1 },
      { periodo: '2025-01', entidad: 'Banco B', monto: 40, situacion: 1 },
    ]);
    expect(s).toEqual([{ periodo: '2025-01', total: 40, peorSituacion: 1, entidades: 1 }]);
  });
});

describe('seriePorEntidad', () => {
  const series = seriePorEntidad(filas);

  it('ordena por deuda del último mes: B (110) antes que A (100)', () => {
    expect(series.map(s => s.entidad)).toEqual(['Banco B', 'Banco A']);
    expect(series[0].ultimo).toBe(110);
  });

  it('alinea a todos los meses: B vale 0 antes de aparecer', () => {
    expect(series[0].puntos).toHaveLength(13);
    expect(series[0].puntos[0]).toEqual({ periodo: '2024-06', monto: 0, situacion: null });
  });

  it('peor situación de la entidad en todo el período', () => {
    expect(series.find(s => s.entidad === 'Banco A')?.peorSituacion).toBe(2);
  });
});

describe('variaciones', () => {
  const serie = serieTotal(filas);

  it('12 meses: 100 → 210 = +110 (+110%)', () => {
    const v = variacion(serie, 12);
    expect(v).toMatchObject({ desde: '2024-06', hasta: '2025-06', abs: 110 });
    expect(v?.pct).toBeCloseTo(1.1, 10);
  });

  it('6 meses: 150 (dic-24) → 210 = +60 (+40%)', () => {
    const v = variacion(serie, 6);
    expect(v?.abs).toBe(60);
    expect(v?.pct).toBeCloseTo(0.4, 10);
  });

  it('si el mes base no está en la serie → null', () => {
    expect(variacion(serie, 24)).toBeNull();
  });

  it('base 0 → pct null', () => {
    const v = variacion([{ periodo: '2025-01', total: 0 }, { periodo: '2025-02', total: 50 }], 1);
    expect(v).toMatchObject({ abs: 50, pct: null });
  });

  it('punta a punta y meses cubiertos', () => {
    expect(variacionTotalPeriodo(serie)?.abs).toBe(110);
    expect(mesesDeSerie(serie)).toBe(13);
  });
});

describe('etiquetaPeriodo', () => {
  it('2025-06 → jun-25', () => {
    expect(etiquetaPeriodo('2025-06')).toBe('jun-25');
  });
});

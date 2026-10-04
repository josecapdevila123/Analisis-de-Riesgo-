import { describe, expect, it } from 'vitest';
import { aggregateScore, formacionPuntaje } from './score';

describe('formacionPuntaje', () => {
  it('sin piso: el final es el promedio y no sube', () => {
    const f = formacionPuntaje(aggregateScore([{ dimension: 'nosis_bcra', puntaje: 40 }], []));
    expect(f).toEqual({ final: 40, promedio: 40, subePorPiso: false, motivoPiso: null });
  });

  it('el piso sube el puntaje: muestra promedio, final y motivo', () => {
    const f = formacionPuntaje(aggregateScore([{ dimension: 'nosis_bcra', puntaje: 52 }], [{ piso: 65, motivo: 'situación 3 en BCRA' }]));
    expect(f).toEqual({ final: 65, promedio: 52, subePorPiso: true, motivoPiso: 'situación 3 en BCRA' });
  });

  it('piso por debajo del promedio: no cuenta como subida', () => {
    const f = formacionPuntaje(aggregateScore([{ dimension: 'nosis_bcra', puntaje: 70 }], [{ piso: 60, motivo: 'x' }]));
    expect(f.subePorPiso).toBe(false);
    expect(f.final).toBe(70);
  });

  it('sin dimensiones puntuadas no hay promedio', () => {
    const f = formacionPuntaje(aggregateScore([{ dimension: 'nosis_bcra', puntaje: null }], [{ piso: 80, motivo: 'y' }]));
    expect(f).toEqual({ final: 80, promedio: null, subePorPiso: false, motivoPiso: null });
  });
});

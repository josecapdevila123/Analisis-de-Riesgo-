import { describe, expect, it } from 'vitest';
import { faltantes, margenDeudaNueva, proyectar, puntoDeQuiebre } from './model';
import { BaseModelo, Supuestos } from './types';

// Caso de la consigna (miles de $, moneda constante): ventas 10.000, margen 15%,
// capex 200 fijo, CT 15%, deuda corriente 500 y no corriente 1.000 en 2 años,
// tasa 8%, alícuota 35%.
const base: BaseModelo = { ventas: 10000, deudaCorriente: 500, deudaNoCorriente: 1000, deudaPostBalance: 0 };

const supuestos = (over: Partial<Supuestos> = {}): Supuestos => ({
  horizonte: 3,
  crecimiento: [0.05, 0.05, 0.05],
  margenEbitda: 0.15,
  capexPct: null,
  capexMonto: 200,
  capitalTrabajoPct: 0.15,
  liberarCapitalTrabajo: true,
  tasaReal: 0.08,
  alicuota: 0.35,
  aniosAmortizacionNoCorriente: 2,
  aniosAmortizacionPostBalance: 2,
  ...over,
});

describe('proyectar — escenario Base (+5% anual)', () => {
  const r = proyectar(base, supuestos());

  it('CFADS ≈ 861 / 894 / 929', () => {
    [861, 894, 929].forEach((v, i) => expect(Math.abs(r.filas[i].cfads - v)).toBeLessThanOrEqual(1));
  });

  it('servicio 620 / 580 / 540', () => {
    [620, 580, 540].forEach((v, i) => expect(r.filas[i].servicio).toBeCloseTo(v, 6));
  });

  it('DSCR ≈ 1,39 / 1,54 / 1,72', () => {
    [1.39, 1.54, 1.72].forEach((v, i) => expect(Math.abs((r.filas[i].dscr as number) - v)).toBeLessThanOrEqual(0.01));
  });

  it('año 1 en detalle: ventas 10.500, EBITDA 1.575, intereses 120, impuestos 439,25, ΔCT 75', () => {
    const f = r.filas[0];
    expect(f.ventas).toBeCloseTo(10500, 6);
    expect(f.ebitda).toBeCloseTo(1575, 6);
    expect(f.intereses).toBeCloseTo(120, 6);
    expect(f.impuestos).toBeCloseTo(439.25, 6);
    expect(f.deltaCapitalTrabajo).toBeCloseTo(75, 6);
  });

  it('la deuda queda cancelada al final y la caja acumulada es Σ(CFADS − servicio)', () => {
    expect(r.filas[2].saldoFin).toBeCloseTo(0, 6);
    const caja = r.filas.reduce((a, f) => a + f.cfads - f.servicio, 0);
    expect(r.filas[2].cajaAcumulada).toBeCloseTo(caja, 6);
  });

  it('DSCR mínimo 1,39 en el año 1', () => {
    expect(r.dscrMinimo?.anio).toBe(1);
    expect(r.dscrMinimo?.valor).toBeCloseTo(860.75 / 620, 6);
  });
});

describe('proyectar — escenario Estrés (−15%, 0%, 0%; margen 12%; sin liberación de CT)', () => {
  const r = proyectar(base, supuestos({ crecimiento: [-0.15, 0, 0], margenEbitda: 0.12, liberarCapitalTrabajo: false }));

  it('CFADS ≈ 575 / 561 / 547', () => {
    [575, 561, 547].forEach((v, i) => expect(Math.abs(r.filas[i].cfads - v)).toBeLessThanOrEqual(1));
  });

  it('DSCR ≈ 0,93 / 0,97 / 1,01', () => {
    [0.93, 0.97, 1.01].forEach((v, i) => expect(Math.abs((r.filas[i].dscr as number) - v)).toBeLessThanOrEqual(0.01));
  });

  it('la caída de ventas no libera capital de trabajo (ΔCT = 0, no −225)', () => {
    expect(r.filas[0].deltaCapitalTrabajo).toBe(0);
  });
});

describe('proyectar — casos borde', () => {
  it('sin deuda: servicio 0 → DSCR null ("sin deuda") y sin DSCR mínimo', () => {
    const r = proyectar({ ventas: 10000, deudaCorriente: 0, deudaNoCorriente: 0, deudaPostBalance: 0 }, supuestos());
    expect(r.filas.every(f => f.servicio === 0 && f.dscr === null)).toBe(true);
    expect(r.dscrMinimo).toBeNull();
  });

  it('EBITDA ≤ 0 → deuda/EBITDA null e impuestos 0', () => {
    const r = proyectar(base, supuestos({ margenEbitda: -0.01 }));
    expect(r.filas[0].deudaEbitda).toBeNull();
    expect(r.filas[0].impuestos).toBe(0);
  });

  it('deuda post balance: se amortiza en partes iguales desde el año 1 y paga intereses', () => {
    const r = proyectar({ ...base, deudaPostBalance: 600 }, supuestos({ aniosAmortizacionPostBalance: 3 }));
    expect(r.filas[0].intereses).toBeCloseTo((500 + 1000 + 600) * 0.08, 6);
    expect(r.filas[0].amortizacion).toBeCloseTo(500 + 200, 6);
    expect(r.filas[1].amortizacion).toBeCloseTo(500 + 200, 6);
  });

  it('horizonte más corto que la amortización: queda saldo de deuda al final', () => {
    const r = proyectar(base, supuestos({ horizonte: 2, aniosAmortizacionNoCorriente: 4 }));
    expect(r.filas).toHaveLength(2);
    expect(r.filas[1].saldoFin).toBeCloseTo(750, 6);
  });

  it('servicio de deuda nueva (preparado para la propuesta de crédito)', () => {
    const r = proyectar(base, supuestos(), { servicioDeudaNueva: [100, 100, 100] });
    expect(r.filas[0].servicio).toBeCloseTo(720, 6);
  });

  it('con supuestos faltantes no proyecta y dice cuáles faltan', () => {
    const s = supuestos({ margenEbitda: null, crecimiento: [0.05, null, 0.05] });
    expect(faltantes(s)).toEqual(['margen EBITDA', 'crecimiento de ventas']);
    expect(() => proyectar(base, s)).toThrow(/margen EBITDA/);
  });
});

describe('puntoDeQuiebre', () => {
  it('encuentra la caída del año 1 que lleva el DSCR mínimo a 1,0x', () => {
    const s = supuestos();
    const p = puntoDeQuiebre(base, s);
    expect(p.tipo).toBe('valor');
    if (p.tipo !== 'valor') return;
    const crecimiento = [p.crecimientoAnio1, ...s.crecimiento.slice(1)];
    const r = proyectar(base, { ...s, crecimiento, liberarCapitalTrabajo: false });
    expect(r.dscrMinimo?.valor).toBeCloseTo(1, 4);
    expect(p.crecimientoAnio1).toBeLessThan(0);
  });

  it('si ya está debajo de 1x aun creciendo 50% → ya_debajo', () => {
    expect(puntoDeQuiebre(base, supuestos({ margenEbitda: 0.02 })).tipo).toBe('ya_debajo');
  });

  it('sin deuda → sin_deuda', () => {
    expect(puntoDeQuiebre({ ventas: 10000, deudaCorriente: 0, deudaNoCorriente: 0, deudaPostBalance: 0 }, supuestos()).tipo).toBe('sin_deuda');
  });
});

describe('margenDeudaNueva', () => {
  it('Base: min_t(CFADS / 1,25 − servicio) = año 1: 860,75 / 1,25 − 620 = 68,6', () => {
    const r = proyectar(base, supuestos());
    expect(margenDeudaNueva(r, 1.25)).toBeCloseTo(860.75 / 1.25 - 620, 6);
  });

  it('Estrés: negativo → no hay margen', () => {
    const r = proyectar(base, supuestos({ crecimiento: [-0.15, 0, 0], margenEbitda: 0.12, liberarCapitalTrabajo: false }));
    expect(margenDeudaNueva(r, 1.25)).toBeLessThan(0);
  });
});

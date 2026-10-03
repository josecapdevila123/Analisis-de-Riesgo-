import { afterEach, describe, expect, it } from 'vitest';
import { runCrossCheck } from './crossCheck';
import { buildExtraction, extractionWith } from './__fixtures__/extraction';
import { SIGNAL_PARAMS } from '../risk/policy';

const conDeudas = (balanceCorriente: number, balanceNoCorriente: number, nosis: number | null) =>
  extractionWith(x => {
    x.deuda_bancaria_actual.corriente.total = balanceCorriente;
    x.deuda_bancaria_actual.no_corriente.total = balanceNoCorriente;
    x.extraccion_nosis!.deuda_financiera_total_nosis = nosis;
  });

describe('runCrossCheck — deuda balance vs Nosis (umbral 10%)', () => {
  it('fixture: balance 2100 vs Nosis 2000 → +5% → consistente', () => {
    const r = runCrossCheck(buildExtraction());
    expect(r.balance_debt).toBe(2100);
    expect(r.nosis_debt).toBe(2000);
    expect(r.difference_abs).toBe(100);
    expect(r.difference_pct).toBeCloseTo(5, 6);
    expect(r.match).toBe(true);
  });

  it('diferencia exacta de 10% → consistente (umbral inclusivo)', () => {
    const r = runCrossCheck(conDeudas(1100, 1100, 2000));
    expect(r.difference_pct).toBeCloseTo(10, 6);
    expect(r.match).toBe(true);
  });

  it('balance 2300 vs Nosis 2000 → +15% → discrepancia', () => {
    const r = runCrossCheck(conDeudas(800, 1500, 2000));
    expect(r.difference_abs).toBe(300);
    expect(r.difference_pct).toBeCloseTo(15, 6);
    expect(r.match).toBe(false);
  });

  it('balance menor que Nosis (1500 vs 2000) → −25% → discrepancia', () => {
    const r = runCrossCheck(conDeudas(500, 1000, 2000));
    expect(r.difference_abs).toBe(-500);
    expect(r.difference_pct).toBeCloseTo(-25, 6);
    expect(r.match).toBe(false);
  });

  it('sin dato de Nosis → todo null salvo la deuda de balance', () => {
    const r = runCrossCheck(conDeudas(600, 1500, null));
    expect(r).toEqual({
      balance_debt: 2100,
      nosis_debt: null,
      difference_abs: null,
      difference_pct: null,
      match: null,
    });
  });

  it('sin informe Nosis → mismo resultado que sin dato', () => {
    const r = runCrossCheck(extractionWith(x => { x.extraccion_nosis = null; }));
    expect(r.nosis_debt).toBeNull();
    expect(r.match).toBeNull();
  });

  it('Nosis 0 con deuda en balance → discrepancia (no se puede calcular %)', () => {
    const r = runCrossCheck(conDeudas(600, 1500, 0));
    expect(r.difference_abs).toBe(2100);
    expect(r.difference_pct).toBeNull();
    expect(r.match).toBe(false);
  });

  it('balance 0 y Nosis 0 → consistente (ninguna de las dos fuentes informa deuda)', () => {
    const r = runCrossCheck(conDeudas(0, 0, 0));
    expect(r.difference_abs).toBe(0);
    expect(r.match).toBe(true);
  });
});

describe('runCrossCheck — la tolerancia sale de la política', () => {
  const cruce = SIGNAL_PARAMS.cruceNosis as { toleranciaPct: number };
  const original = cruce.toleranciaPct;
  afterEach(() => { cruce.toleranciaPct = original; });

  it('la política vigente es 10%', () => {
    expect(original).toBe(10);
  });

  it('con tolerancia 20%, una diferencia de 15% es consistente (balance 2300 vs Nosis 2000)', () => {
    cruce.toleranciaPct = 20;
    const r = runCrossCheck(conDeudas(1150, 1150, 2000));
    expect(r.difference_pct).toBeCloseTo(15, 6);
    expect(r.match).toBe(true);
  });

  it('con tolerancia 5%, una diferencia de 8% es discrepancia (balance 2160 vs Nosis 2000)', () => {
    cruce.toleranciaPct = 5;
    const r = runCrossCheck(conDeudas(1080, 1080, 2000));
    expect(r.difference_pct).toBeCloseTo(8, 6);
    expect(r.match).toBe(false);
  });
});

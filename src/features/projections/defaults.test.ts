import { describe, expect, it } from 'vitest';
import { resolverProyeccion, sugerirBase, sugerirCrecimiento } from './defaults';
import { proyeccionesVacias, ProyeccionesGuardadas } from './types';
import { computeRatios } from '../ratios/calculations';
import { buildExtraction, extractionWith } from '../ratios/__fixtures__/extraction';
import { RawExtraction } from '../extraction/schemas';

const resolver = (e: RawExtraction, g: ProyeccionesGuardadas = proyeccionesVacias()) => resolverProyeccion(e, computeRatios(e), g);
const conInflacion = (i: number | null): ProyeccionesGuardadas => ({ ...proyeccionesVacias(), base: { inflacionMensual: i } });

// Post cierre: 2 meses en pesos con comparativo, más un mes en USD.
const conPostCierre = () => extractionWith(x => {
  x.analisis_post_cierre = {
    periodo_analizado: null,
    detalle_ventas_mensuales: [
      { mes: 'Enero', monto: 1200, monto_anio_anterior: 1000, moneda: 'ARS' },
      { mes: 'Febrero', monto: 1300, monto_anio_anterior: 1350, moneda: 'ARS' },
      { mes: 'Febrero', monto: 50, monto_anio_anterior: null, moneda: 'USD' },
    ],
    total_ventas_post_cierre: 2500,
    notas_relevantes: null,
    deuda_bancaria_post_balance_detalle: [
      { entidad: 'Banco A', monto: 800, moneda: 'ARS' },
      { entidad: 'Banco B', monto: 10, moneda: 'USD' },
    ],
  };
});

describe('sugerirBase', () => {
  it('sin post cierre y balance RT 6: ventas del ejercicio, sin pedir inflación', () => {
    const s = sugerirBase(buildExtraction(), null);
    expect(s.ventas.valor).toBe(14600);
    expect(s.ventas.aviso).toBeUndefined();
    expect(s.inflacionRequerida).toBe(false);
    expect(s.deudaCorriente.valor).toBe(600);
    expect(s.deudaNoCorriente.valor).toBe(1500);
    expect(s.deudaPostBalance.valor).toBe(0);
  });

  it('ventas post cierre vacías → igual que sin post cierre', () => {
    const e = extractionWith(x => {
      x.analisis_post_cierre = { periodo_analizado: null, detalle_ventas_mensuales: [], total_ventas_post_cierre: 0, notas_relevantes: null, deuda_bancaria_post_balance_detalle: [] };
    });
    expect(sugerirBase(e, null).ventas.valor).toBe(14600);
  });

  it('con post cierre y SIN inflación: ventas base vacía con aviso (no se inventa)', () => {
    const s = sugerirBase(conPostCierre(), null);
    expect(s.inflacionRequerida).toBe(true);
    expect(s.ventas.valor).toBeNull();
    expect(s.ventas.aviso).toMatch(/inflación/);
    expect(s.deudaPostBalance.valor).toBeNull();
  });

  it('últimos 12 meses en moneda de cierre (inflación 2% mensual)', () => {
    // post: 1200/1,02 + 1300/1,02² ; año anterior: 1000·1,02¹¹ + 1350·1,02¹⁰
    const post = 1200 / 1.02 + 1300 / 1.02 ** 2;
    const ant = 1000 * 1.02 ** 11 + 1350 * 1.02 ** 10;
    const s = sugerirBase(conPostCierre(), 0.02);
    expect(s.ventas.valor).toBeCloseTo(14600 + post - ant, 6);
  });

  it('meses y deuda en USD quedan fuera, con aviso', () => {
    const s = sugerirBase(conPostCierre(), 0.02);
    expect(s.avisos.join(' ')).toMatch(/USD/);
    // deuda post balance: 800 nominal, 2 meses después del cierre
    expect(s.deudaPostBalance.valor).toBeCloseTo(800 / 1.02 ** 2, 6);
  });
});

describe('sugerirCrecimiento', () => {
  it('balance RT 6 sin post cierre: variación entre ejercicios, acotada a +15%', () => {
    const g = sugerirCrecimiento(buildExtraction(), null);
    expect(g.valor).toBeCloseTo(0.15, 6); // 14.600 / 10.950 − 1 = 33% → tope
    expect(g.fuente).toMatch(/acotado/);
  });

  it('con post cierre: crecimiento real de los meses post cierre vs. el año anterior', () => {
    const post = 1200 / 1.02 + 1300 / 1.02 ** 2;
    const ant = 1000 * 1.02 ** 11 + 1350 * 1.02 ** 10;
    expect(sugerirCrecimiento(conPostCierre(), 0.02).valor).toBeCloseTo(post / ant - 1, 6);
  });

  it('balance sin RT 6: deflacta con la inflación; sin inflación queda vacío con aviso', () => {
    const e = extractionWith(x => { x.informacion_complementaria!.balance_ajustado_por_inflacion = false; });
    expect(sugerirCrecimiento(e, null).valor).toBeNull();
    const anual = 1.02 ** 12 - 1;
    expect(sugerirCrecimiento(e, 0.02).valor).toBeCloseTo(14600 / (10950 * (1 + anual)) - 1, 6);
  });

  it('sin ejercicio anterior ni post cierre: vacío con aviso', () => {
    const g = sugerirCrecimiento(extractionWith(x => { x.ejercicio_anterior = null; }), null);
    expect(g.valor).toBeNull();
    expect(g.aviso).toBeTruthy();
  });
});

describe('resolverProyeccion', () => {
  const r = resolver(buildExtraction());

  it('Base: margen promedio de los dos ejercicios, capex = depreciación / ventas, CT = KTNO / ventas', () => {
    const b = r.supuestos.base;
    expect(b.margenEbitda).toBeCloseTo((3400 / 14600 + 2275 / 10950) / 2, 6);
    expect(b.capexPct).toBeCloseTo(400 / 14600, 6);
    expect(b.capitalTrabajoPct).toBeCloseTo(2700 / 14600, 6);
    expect(b.horizonte).toBe(3);
    expect(b.tasaReal).toBe(0.08);
    expect(b.alicuota).toBe(0.35);
    expect(b.crecimiento).toEqual([0.15, 0.15, 0.15]);
  });

  it('Directorio inicia igual al Base', () => {
    expect(r.supuestos.directorio).toEqual(r.supuestos.base);
  });

  it('Estrés: −15% / 0% / 0%, margen Base − 3 p.p., tasa + 4 p.p., sin liberar CT', () => {
    const e = r.supuestos.estres;
    expect(e.crecimiento).toEqual([-0.15, 0, 0]);
    expect(e.margenEbitda).toBeCloseTo((r.supuestos.base.margenEbitda as number) - 0.03, 6);
    expect(e.tasaReal).toBeCloseTo(0.12, 6);
    expect(e.liberarCapitalTrabajo).toBe(false);
  });

  it('editar el Base arrastra a Directorio y Estrés (salvo lo que tengan editado)', () => {
    const g = proyeccionesVacias();
    g.escenarios.base = { margenEbitda: 0.2, horizonte: 5 };
    g.escenarios.directorio = { crecimiento: { 0: 0.3 } };
    const x = resolver(buildExtraction(), g);
    expect(x.supuestos.directorio.margenEbitda).toBe(0.2);
    expect(x.supuestos.directorio.crecimiento).toEqual([0.3, 0.15, 0.15, 0.15, 0.15]);
    expect(x.supuestos.estres.margenEbitda).toBeCloseTo(0.17, 6);
    expect(x.supuestos.estres.crecimiento).toHaveLength(5);
  });

  it('ejercicio anterior faltante: margen del ejercicio actual y crecimiento vacío', () => {
    const x = resolver(extractionWith(y => { y.ejercicio_anterior = null; }));
    expect(x.supuestos.base.margenEbitda).toBeCloseTo(3400 / 14600, 6);
    expect(x.sugeridos.base.margenEbitda.fuente).toMatch(/sin ejercicio anterior/);
    expect(x.supuestos.base.crecimiento).toEqual([null, null, null]);
  });

  it('año base: sin inflación cuando hace falta → no hay base y se informa qué falta', () => {
    const x = resolver(conPostCierre());
    expect(x.base).toBeNull();
    expect(x.faltaBase).toContain('inflación mensual');
    const y = resolver(conPostCierre(), conInflacion(0.02));
    expect(y.base?.deudaPostBalance).toBeCloseTo(800 / 1.02 ** 2, 6);
  });

  it('se puede excluir la deuda post balance', () => {
    const g = conInflacion(0.02);
    g.base.incluirDeudaPostBalance = false;
    expect(resolver(conPostCierre(), g).base?.deudaPostBalance).toBe(0);
  });

  it('los valores editados del año base no tocan la extracción', () => {
    const e = buildExtraction();
    const g = proyeccionesVacias();
    g.base.ventas = 20000;
    expect(resolver(e, g).base?.ventas).toBe(20000);
    expect(e.ejercicio_actual.estado_resultados.ventas_netas).toBe(14600);
  });
});

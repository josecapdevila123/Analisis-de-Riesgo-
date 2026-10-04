import { describe, expect, it } from 'vitest';
import { explicarRatio } from './explicacion';
import { computeRatios, RatioKey } from './calculations';
import { buildExtraction, extractionWith } from './__fixtures__/extraction';
import { perfilEfectivo, RubroDisponible } from '../risk/policy';
import { RawExtraction } from '../extraction/schemas';

// La explicación tiene que dar EXACTAMENTE el mismo número que el cálculo real,
// en todos los ratios, ejercicios y perfiles. Si no, la pestaña mentiría.
const escenarios: Array<[string, RawExtraction, RubroDisponible]> = [
  ['fixture', buildExtraction(), 'generico'],
  ['agro', buildExtraction(), 'agro'],
  ['construcción con anticipos', extractionWith(x => {
    const esp = x.ejercicio_actual.estado_situacion_patrimonial;
    esp.pasivo_corriente.detalles.push({ rubro: 'Anticipos de clientes', monto: 800 });
    esp.pasivo_corriente.total += 800;
    esp.total_pasivo += 800;
  }), 'construccion'],
  ['EBITDA negativo y PN negativo', extractionWith(x => {
    x.ejercicio_actual.estado_resultados.gastos_administracion = -9000;
    x.ejercicio_actual.estado_situacion_patrimonial.patrimonio_neto = -100;
  }), 'generico'],
  ['financiera', extractionWith(x => {
    x.extraccion_financiera = {
      fecha_cierre: '2025-12-31', cartera_total: 850, cartera_total_anterior: 700,
      cartera_vencida_por_tramo: [{ tramo: 'de 3 a 6 meses', desde_dias: 90, hasta_dias: 180, monto: 60 }],
      previsiones_incobrabilidad: 40, cargo_incobrabilidad: 20, ingresos_financieros: 9000, egresos_financieros: 100,
      creditos_a_vencer_90_dias: 300, pasivos_a_vencer_90_dias: 200, inversiones_corrientes: null,
      fondeo: [{ fuente: 'bancos', monto: 500 }], top10_deudores_monto: 170,
    };
  }), 'financiera'],
];

describe('explicación = cálculo real, en todos los ratios', () => {
  for (const [nombre, e, rubro] of escenarios) {
    it(nombre, () => {
      const perfil = perfilEfectivo(rubro, rubro === 'financiera' ? 'consumo' : null);
      const ratios = computeRatios(e, perfil, []);
      for (const key of Object.keys(ratios) as RatioKey[]) {
        const x = explicarRatio(key, { extraction: e, ratios, perfil });
        const act = x.ejercicios[0]?.calculo.valor ?? null;
        expect([key, act]).toEqual([key, ratios[key].actual]);
        if (x.ejercicios[1]) expect([key, x.ejercicios[1].calculo.valor]).toEqual([key, ratios[key].anterior]);
      }
    });
  }
});

describe('lo que muestra la explicación', () => {
  const e = buildExtraction();
  const perfil = perfilEfectivo('generico');
  const ratios = computeRatios(e, perfil);

  it('liquidez corriente: fórmula, cuenta con números, dos ejercicios', () => {
    const x = explicarRatio('liquidez_corriente', { extraction: e, ratios, perfil });
    expect(x.formula).toBe('Activo corriente / pasivo corriente');
    expect(x.ejercicios.map(j => [j.anio, j.calculo.cuenta])).toEqual([['2025', '5.000 / 2.500'], ['2024', '4.000 / 2.500']]);
    expect(x.semaforo).toMatchObject({ status: 'healthy', noAplica: null });
  });

  it('días de cobro: muestra qué renglones se sumaron y cuáles se excluyeron', () => {
    const x = explicarRatio('dias_de_cobro', { extraction: e, ratios, perfil });
    const creditos = x.ejercicios[0].calculo.terminos[0];
    expect(creditos.renglones?.incluidos.map(r => r.rubro)).toEqual(['Créditos por Ventas']);
    expect(creditos.renglones?.excluidos.map(r => r.rubro)).toEqual(['Otros Créditos']);
  });

  it('DSCR: componentes, supuestos y la cuenta', () => {
    const x = explicarRatio('dscr', { extraction: e, ratios, perfil });
    expect(x.ejercicios[0].calculo.cuenta).toBe('2.460 / 1.100');
    expect(x.supuestos.length).toBe(3);
  });

  it('agro: el semáforo del margen EBITDA usa el promedio, y lo dice', () => {
    const p = perfilEfectivo('agro');
    const x = explicarRatio('margen_ebitda', { extraction: e, ratios: computeRatios(e, p), perfil: p });
    expect(x.semaforo.usaValorDe).toBe('Margen EBITDA promedio 2 ejercicios');
  });

  it('no aplica: sin semáforo y con el motivo', () => {
    const p = perfilEfectivo('agro');
    const x = explicarRatio('liquidez_acida', { extraction: e, ratios: computeRatios(e, p), perfil: p });
    expect(x.semaforo.status).toBeNull();
    expect(x.semaforo.noAplica).toMatch(/Granos y hacienda/);
  });

  it('dato faltante: dice qué falta', () => {
    const sin = extractionWith(x => { x.ejercicio_actual.estado_situacion_patrimonial.bienes_de_cambio = null; });
    const x = explicarRatio('dias_de_stock', { extraction: sin, ratios: computeRatios(sin), perfil });
    expect(x.ejercicios[0].calculo.nota).toBe('Falta bienes de cambio.');
  });
});

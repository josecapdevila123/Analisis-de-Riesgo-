import { describe, expect, it } from 'vitest';
import { detectSignals } from './signals';
import { aggregateScore } from './score';
import { perfilEfectivo, RubroDisponible } from './policy';
import { computeRatios } from '../ratios/calculations';
import { runSanityChecks } from '../ratios/sanityChecks';
import { runCrossCheck } from '../ratios/crossCheck';
import { extractionWith } from '../ratios/__fixtures__/extraction';
import { RawExtraction, RiskDimension } from '../extraction/schemas';

// Casos tipo por rubro: el mismo balance evaluado con el genérico y con el
// perfil del rubro tiene que dar las diferencias esperadas (y nada raro más).

const evaluar = (e: RawExtraction, rubro: RubroDisponible) => {
  const perfil = perfilEfectivo(rubro);
  const ratios = computeRatios(e, perfil);
  const senales = detectSignals({ extraction: e, ratios, inconsistencias: runSanityChecks(e), crossCheck: runCrossCheck(e), perfil });
  return { ratios, senales, ids: senales.map(s => s.id), perfil };
};

describe('agro', () => {
  // Mucho stock (prueba ácida 0,48) y flujo operativo bajo (calidad 26%).
  const e = extractionWith(x => {
    const esp = x.ejercicio_actual.estado_situacion_patrimonial;
    esp.bienes_de_cambio = 3800;
    x.ejercicio_actual.flujo_efectivo.flujo_neto_operativo = 900;
  });
  const gen = evaluar(e, 'generico');
  const agro = evaluar(e, 'agro');

  it('prueba ácida: crítica en el genérico, "no aplica" (sin semáforo ni señal) en agro', () => {
    expect(gen.ratios.liquidez_acida.status).toBe('critical');
    expect(gen.ids).toContain('prueba_acida_baja');
    expect(agro.ratios.liquidez_acida.status).toBeNull();
    expect(agro.ids).not.toContain('prueba_acida_baja');
    // El valor se sigue calculando y mostrando.
    expect(agro.ratios.liquidez_acida.actual).toBeCloseTo(gen.ratios.liquidez_acida.actual!, 10);
  });

  it('calidad de la ganancia: señal en el genérico, no aplica en agro', () => {
    expect(gen.ids).toContain('calidad_ganancia_baja');
    expect(agro.ids).not.toContain('calidad_ganancia_baja');
    expect(agro.ratios.calidad_ganancia.status).toBeNull();
  });

  it('deuda que vence en 12 meses: 80% dispara en el genérico (> 70%) y no en agro (> 90%)', () => {
    const e80 = extractionWith(x => { x.deuda_bancaria_actual.corriente.total = 1680; x.deuda_bancaria_actual.no_corriente.total = 420; });
    expect(evaluar(e80, 'generico').ids).toContain('deuda_corto_plazo');
    expect(evaluar(e80, 'agro').ids).not.toContain('deuda_corto_plazo');
  });

  it('margen EBITDA: el semáforo usa el promedio de 2 ejercicios', () => {
    // Actual: EBITDA = 4900 − 2000 − 2900 + 400 = 400 → 2,7% (crítico solo).
    // Anterior 20,8% → promedio 11,7% → sano (> 10%).
    const m = extractionWith(x => {
      const er = x.ejercicio_actual.estado_resultados;
      er.resultado_bruto = 4900;
      er.gastos_comercializacion = -2900;
    });
    expect(evaluar(m, 'generico').ratios.margen_ebitda.status).toBe('critical');
    expect(evaluar(m, 'agro').ratios.margen_ebitda.status).toBe('healthy');
  });
});

describe('comercio', () => {
  // Margen EBITDA 4%: crítico en el genérico (< 5%), alerta en comercio (≥ 2%).
  const e = extractionWith(x => {
    const er = x.ejercicio_actual.estado_resultados;
    er.gastos_comercializacion = -5116; // EBITDA = 7300 − 2000 − 5116 + 400 = 584 → 4,0%
  });

  it('margen 4%: crítico en el genérico, alerta en comercio', () => {
    expect(evaluar(e, 'generico').ratios.margen_ebitda.status).toBe('critical');
    expect(evaluar(e, 'comercio').ratios.margen_ebitda.status).toBe('alert');
  });

  it('prueba ácida 0,85: alerta en el genérico (sano > 1), sana en comercio (sano > 0,8)', () => {
    const acida = (v: number) => extractionWith(x => {
      // (AC − BdC) / PC = v → BdC = AC − v × PC = 5000 − v × 2500
      x.ejercicio_actual.estado_situacion_patrimonial.bienes_de_cambio = 5000 - v * 2500;
    });
    expect(evaluar(acida(0.85), 'generico').ratios.liquidez_acida.status).toBe('alert');
    expect(evaluar(acida(0.85), 'comercio').ratios.liquidez_acida.status).toBe('healthy');
  });

  it('ciclo de caja: +25 días dispara en comercio (> 20) y no en el genérico (> 30)', () => {
    const c = extractionWith(x => {
      // Ciclo anterior 103,3 días; actual 85. +870 de BdC = +43,5 días de stock
      // (870 / 7300 × 365) → ciclo actual 128,5: aumento de 25,2 días.
      x.ejercicio_actual.estado_situacion_patrimonial.bienes_de_cambio = 2200 + 870;
    });
    const g = evaluar(c, 'generico');
    const co = evaluar(c, 'comercio');
    const delta = g.ratios.ciclo_conversion_caja.actual! - g.ratios.ciclo_conversion_caja.anterior!;
    expect(delta).toBeGreaterThan(20);
    expect(delta).toBeLessThanOrEqual(30);
    expect(g.ids).not.toContain('ciclo_caja_crece');
    expect(co.ids).toContain('ciclo_caja_crece');
  });
});

describe('construcción', () => {
  // Anticipos de clientes 2.800 en el pasivo corriente.
  const e = extractionWith(x => {
    const esp = x.ejercicio_actual.estado_situacion_patrimonial;
    esp.pasivo_corriente.total = 5300;
    esp.pasivo_corriente.detalles.push({ rubro: 'Anticipos de clientes', monto: 2800 });
    esp.total_pasivo = 6800;
    esp.patrimonio_neto = 1200;
    esp.total_activo = 8000;
  });
  const gen = evaluar(e, 'generico');
  const con = evaluar(e, 'construccion');

  it('liquidez corriente: 0,94 con anticipos (crítica, señal) vs 2,0 sin anticipos (sana, sin señal)', () => {
    expect(gen.ratios.liquidez_corriente.actual).toBeCloseTo(5000 / 5300, 6);
    expect(gen.ratios.liquidez_corriente.status).toBe('critical');
    expect(gen.ids).toContain('liquidez_corriente_baja');
    expect(con.ratios.liquidez_corriente_sin_anticipos.actual).toBeCloseTo(5000 / 2500, 6);
    expect(con.ratios.liquidez_corriente.status).toBe('healthy');
    expect(con.ids).not.toContain('liquidez_corriente_baja');
  });

  it('pasivo / PN: 5,7x (alta) con anticipos vs 3,3x (media) sin anticipos, mostrando el monto excluido', () => {
    expect(gen.senales.find(s => s.id === 'apalancamiento_alto')?.severidad).toBe('alta');
    const s = con.senales.find(x => x.id === 'apalancamiento_alto');
    expect(s?.severidad).toBe('media');
    expect(s?.detalle).toContain('sin anticipos de clientes');
    expect(s?.detalle).toContain('2.800');
  });
});

describe('industria', () => {
  it('deuda / EBITDA 2,8x: alerta en el genérico (> 2,5), sana en industria (≤ 3)', () => {
    const e = extractionWith(x => {
      x.deuda_bancaria_actual.corriente.total = 1520;
      x.deuda_bancaria_actual.no_corriente.total = 8000; // 9520 / 3400 = 2,8x
    });
    expect(evaluar(e, 'generico').ratios.deuda_ebitda.status).toBe('alert');
    expect(evaluar(e, 'industria').ratios.deuda_ebitda.status).toBe('healthy');
  });

  it('deuda neta / EBITDA 4,2x: señal en el genérico (> 4), no en industria (> 4,5)', () => {
    const e = extractionWith(x => {
      x.deuda_bancaria_actual.corriente.total = 1000;
      x.deuda_bancaria_actual.no_corriente.total = 13780; // (14780 − 500) / 3400 = 4,2x
    });
    expect(evaluar(e, 'generico').ids).toContain('deuda_neta_ebitda_alta');
    expect(evaluar(e, 'industria').ids).not.toContain('deuda_neta_ebitda_alta');
  });
});

describe('servicios', () => {
  const dims: Array<{ dimension: RiskDimension; puntaje: number | null }> = [
    { dimension: 'nosis_bcra', puntaje: 20 },
    { dimension: 'endeudamiento', puntaje: 20 },
    { dimension: 'liquidez_solvencia', puntaje: 80 },
    { dimension: 'rentabilidad', puntaje: 20 },
    { dimension: 'ventas_post_balance', puntaje: 20 },
    { dimension: 'negocio_mercado', puntaje: 60 },
    { dimension: 'calidad_informacion', puntaje: 20 },
  ];

  it('pesos: menos liquidez (10) y más negocio (15) → otro puntaje con las mismas dimensiones', () => {
    // Genérico: (20·25 + 20·20 + 80·15 + 20·15 + 20·10 + 60·10 + 20·5) / 100 = 33
    expect(aggregateScore(dims, []).final).toBe(33);
    // Servicios: (20·25 + 20·20 + 80·10 + 20·15 + 20·10 + 60·15 + 20·5) / 100 = 32
    expect(aggregateScore(dims, [], perfilEfectivo('servicios').pesos).final).toBe(32);
  });

  it('margen EBITDA 12%: sano en el genérico (> 10%), alerta en servicios (≥ 8%)', () => {
    const e = extractionWith(x => {
      x.ejercicio_actual.estado_resultados.gastos_comercializacion = -3948; // EBITDA = 1752 → 12,0%
    });
    expect(evaluar(e, 'generico').ratios.margen_ebitda.status).toBe('healthy');
    expect(evaluar(e, 'servicios').ratios.margen_ebitda.status).toBe('alert');
  });
});

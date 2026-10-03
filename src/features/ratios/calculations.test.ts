import { describe, expect, it } from 'vitest';
import { computeRatios, RatioKey } from './calculations';
import { buildExtraction, extractionWith } from './__fixtures__/extraction';

// Valores calculados a mano sobre el fixture (montos en miles de pesos).
// Definición financiera usada para lo esperado:
//   EBITDA = resultado bruto − gastos de administración − gastos de
//            comercialización + depreciación (+ valuación BdC + inversiones
//            permanentes, que en el fixture son null → 0).
//   Días = saldo / flujo anual × 365, siempre sobre montos en valor absoluto.
//   Créditos por ventas = solo "Créditos por Ventas" (no "Otros Créditos").
type Expected = { actual: number; anterior: number };

const EXPECTED: Record<RatioKey, Expected> = {
  // actual: 7300 − 2000 − 2300 + 400 | anterior: 5475 − 1500 − 2000 + 300
  ebitda: { actual: 3400, anterior: 2275 },
  // AC / PC
  liquidez_corriente: { actual: 5000 / 2500, anterior: 4000 / 2500 },
  // (AC − BdC) / PC
  liquidez_acida: { actual: (5000 - 2200) / 2500, anterior: (4000 - 2000) / 2500 },
  // Caja y bancos / PC
  liquidez_inmediata: { actual: 500 / 2500, anterior: 400 / 2500 },
  // PN / Pasivo
  solvencia: { actual: 4000 / 4000, anterior: 2500 / 3500 },
  // Pasivo / PN
  endeudamiento: { actual: 4000 / 4000, anterior: 3500 / 2500 },
  // AC − PC
  capital_de_trabajo: { actual: 2500, anterior: 1500 },
  // Créditos por ventas + BdC − Deudas comerciales
  ktno: { actual: 2000 + 2200 - 1500, anterior: 1600 + 2000 - 1250 },
  // RB / Ventas
  margen_bruto: { actual: 0.5, anterior: 0.5 },
  // EBITDA / Ventas
  margen_ebitda: { actual: 3400 / 14600, anterior: 2275 / 10950 },
  // RN / Ventas
  margen_neto: { actual: 1460 / 14600, anterior: 1000 / 10950 },
  // EBITDA / |gastos financieros|
  cobertura_intereses: { actual: 3400 / 500, anterior: 2275 / 400 },
  // Deuda bancaria corriente + no corriente
  deuda_bancaria_total: { actual: 2100, anterior: 1750 },
  // Deuda bancaria / EBITDA
  deuda_ebitda: { actual: 2100 / 3400, anterior: 1750 / 2275 },
  // Deuda bancaria / Ventas × 365
  deuda_dias_ventas: { actual: 52.5, anterior: 1750 / 30 },
  // Créditos por ventas / Ventas × 365
  dias_de_cobro: { actual: 50, anterior: 1600 / 30 },
  // Deudas comerciales / |Costo| × 365
  dias_de_pago: { actual: 75, anterior: 1250 / 15 },
  // BdC / |Costo| × 365
  dias_de_stock: { actual: 110, anterior: 2000 / 15 },
  // Cobro + Stock − Pago
  ciclo_conversion_caja: { actual: 50 + 110 - 75, anterior: 1600 / 30 + 2000 / 15 - 1250 / 15 },
  // ANC / Activo total
  indice_inmovilizacion: { actual: 3000 / 8000, anterior: 2000 / 6000 },
  // Flujo operativo / Deuda bancaria
  autofinanciamiento: { actual: 2720 / 2100, anterior: 1820 / 1750 },
  // RN / PN
  roe: { actual: 1460 / 4000, anterior: 1000 / 2500 },
  // RN / Activo total
  roa: { actual: 1460 / 8000, anterior: 1000 / 6000 },
  // (Deuda bancaria − caja y bancos) / EBITDA
  deuda_neta_ebitda: { actual: (2100 - 500) / 3400, anterior: (1750 - 400) / 2275 },
  // (EBITDA − depreciación − |impuesto|) / (|intereses| + deuda bancaria corriente)
  dscr: { actual: (3400 - 400 - 540) / (500 + 600), anterior: (2275 - 300 - 400) / (400 + 750) },
  // Flujo operativo / EBITDA
  calidad_ganancia: { actual: 2720 / 3400, anterior: 1820 / 2275 },
  // Deuda bancaria / PN
  deuda_financiera_pn: { actual: 2100 / 4000, anterior: 1750 / 2500 },
};

describe('computeRatios — los 23 ratios sobre un balance realista', () => {
  const ratios = computeRatios(buildExtraction());

  it('calcula exactamente 27 ratios', () => {
    expect(Object.keys(ratios)).toHaveLength(27);
    expect(Object.keys(EXPECTED)).toHaveLength(27);
  });

  describe.each(Object.entries(EXPECTED) as Array<[RatioKey, Expected]>)('%s', (key, expected) => {
    it('ejercicio actual', () => {
      expect(ratios[key].actual).toBeCloseTo(expected.actual, 6);
    });

    it('ejercicio anterior', () => {
      expect(ratios[key].anterior).toBeCloseTo(expected.anterior, 6);
    });

    it('variación interanual sobre |anterior|', () => {
      const v = ((expected.actual - expected.anterior) / Math.abs(expected.anterior)) * 100;
      expect(ratios[key].variacion_pct).toBeCloseTo(v, 4);
    });
  });
});

describe('computeRatios — semáforo (status)', () => {
  const ratios = computeRatios(buildExtraction());

  it('liquidez corriente 2,0 → healthy (> 1,2)', () => {
    expect(ratios.liquidez_corriente.status).toBe('healthy');
  });

  it('prueba ácida 1,12 → healthy (umbral de política: > 1x)', () => {
    expect(ratios.liquidez_acida.status).toBe('healthy');
  });

  it('deuda neta / EBITDA 0,47 → healthy; DSCR 2,24 → healthy; calidad 80% → healthy', () => {
    expect(ratios.deuda_neta_ebitda.status).toBe('healthy');
    expect(ratios.dscr.status).toBe('healthy');
    expect(ratios.calidad_ganancia.status).toBe('healthy');
  });

  it('liquidez inmediata 0,2 → critical (< 1)', () => {
    expect(ratios.liquidez_inmediata.status).toBe('critical');
  });

  it('solvencia 1,0 → alert (límite inferior inclusivo)', () => {
    expect(ratios.solvencia.status).toBe('alert');
  });

  it('deuda/EBITDA 0,62 → healthy (< 2)', () => {
    expect(ratios.deuda_ebitda.status).toBe('healthy');
  });

  it('cobertura de intereses 6,8 → healthy (> 3)', () => {
    expect(ratios.cobertura_intereses.status).toBe('healthy');
  });

  it('ratios sin umbral definido → status null', () => {
    const sinUmbral: RatioKey[] = ['ebitda', 'endeudamiento', 'margen_neto', 'roe', 'dias_de_cobro'];
    for (const key of sinUmbral) expect(ratios[key].status).toBeNull();
  });

  it('deuda/EBITDA con EBITDA negativo → critical (no puede quedar como healthy)', () => {
    const e = extractionWith(x => {
      // Pérdida bruta y sin gastos ni depreciación: EBITDA −3000 sin importar el signo de los gastos.
      const er = x.ejercicio_actual.estado_resultados;
      er.resultado_bruto = -3000;
      er.gastos_administracion = 0;
      er.gastos_comercializacion = 0;
      x.ejercicio_actual.flujo_efectivo.depreciacion_bienes_de_uso = null;
    });
    const r = computeRatios(e);
    expect(r.ebitda.actual).toBeLessThan(0);
    expect(r.deuda_ebitda.status).toBe('critical');
  });
});

describe('computeRatios — denominador cero', () => {
  it('pasivo corriente 0 → liquidez corriente, ácida e inmediata null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.pasivo_corriente.total = 0;
    }));
    expect(r.liquidez_corriente.actual).toBeNull();
    expect(r.liquidez_acida.actual).toBeNull();
    expect(r.liquidez_inmediata.actual).toBeNull();
    expect(r.liquidez_corriente.status).toBeNull();
    expect(r.liquidez_corriente.variacion_pct).toBeNull();
    // capital de trabajo no divide: AC − 0
    expect(r.capital_de_trabajo.actual).toBe(5000);
  });

  it('ventas 0 → márgenes, días de cobro y deuda en días de venta null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_resultados.ventas_netas = 0;
    }));
    expect(r.margen_bruto.actual).toBeNull();
    expect(r.margen_ebitda.actual).toBeNull();
    expect(r.margen_neto.actual).toBeNull();
    expect(r.dias_de_cobro.actual).toBeNull();
    expect(r.deuda_dias_ventas.actual).toBeNull();
    expect(r.ciclo_conversion_caja.actual).toBeNull();
  });

  it('costo de ventas 0 → días de pago, de stock y ciclo null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_resultados.costo_ventas = 0;
    }));
    expect(r.dias_de_pago.actual).toBeNull();
    expect(r.dias_de_stock.actual).toBeNull();
    expect(r.ciclo_conversion_caja.actual).toBeNull();
  });

  it('patrimonio neto 0 → endeudamiento y ROE null, solvencia 0', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.patrimonio_neto = 0;
    }));
    expect(r.endeudamiento.actual).toBeNull();
    expect(r.roe.actual).toBeNull();
    expect(r.solvencia.actual).toBe(0);
    expect(r.solvencia.status).toBe('critical');
  });

  it('pasivo total 0 → solvencia null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.total_pasivo = 0;
    }));
    expect(r.solvencia.actual).toBeNull();
    expect(r.endeudamiento.actual).toBe(0);
  });

  it('activo total 0 → ROA e índice de inmovilización null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.total_activo = 0;
    }));
    expect(r.roa.actual).toBeNull();
    expect(r.indice_inmovilizacion.actual).toBeNull();
  });

  it('EBITDA 0 → deuda/EBITDA null (denominador) y cobertura 0 (numerador)', () => {
    const r = computeRatios(extractionWith(x => {
      // RB 3900 − gastos 4300 + depreciación 400 = 0
      x.ejercicio_actual.estado_resultados.resultado_bruto = 3900;
      x.ejercicio_actual.estado_resultados.gastos_administracion = 2000;
      x.ejercicio_actual.estado_resultados.gastos_comercializacion = 2300;
    }));
    expect(r.ebitda.actual).toBe(0);
    expect(r.deuda_ebitda.actual).toBeNull();
    expect(r.cobertura_intereses.actual).toBeCloseTo(0, 6);
    expect(r.cobertura_intereses.status).toBe('critical');
  });

  it('deuda bancaria 0 → autofinanciamiento null, deuda/EBITDA 0', () => {
    const r = computeRatios(extractionWith(x => {
      x.deuda_bancaria_actual.corriente.total = 0;
      x.deuda_bancaria_actual.no_corriente.total = 0;
    }));
    expect(r.deuda_bancaria_total.actual).toBe(0);
    expect(r.autofinanciamiento.actual).toBeNull();
    expect(r.deuda_dias_ventas.actual).toBe(0);
    expect(r.deuda_ebitda.actual).toBe(0);
    expect(r.deuda_ebitda.status).toBe('healthy');
  });

  it('valor anterior 0 → variación null aunque ambos años tengan valor', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_anterior!.estado_situacion_patrimonial.activo_corriente.total = 2500;
    }));
    expect(r.capital_de_trabajo.anterior).toBe(0);
    expect(r.capital_de_trabajo.variacion_pct).toBeNull();
  });
});

describe('computeRatios — nulls', () => {
  it('bienes de cambio null → ácida, KTNO, días de stock y ciclo null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.bienes_de_cambio = null;
    }));
    expect(r.liquidez_acida.actual).toBeNull();
    expect(r.ktno.actual).toBeNull();
    expect(r.dias_de_stock.actual).toBeNull();
    expect(r.ciclo_conversion_caja.actual).toBeNull();
    expect(r.liquidez_corriente.actual).toBe(2);
  });

  it('gastos financieros null → cobertura null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_resultados.gastos_financieros = null;
    }));
    expect(r.cobertura_intereses.actual).toBeNull();
    expect(r.cobertura_intereses.status).toBeNull();
  });

  // Comparados contra el EBITDA base para no depender de la convención de signos de los gastos.
  const ebitdaBase = computeRatios(buildExtraction()).ebitda.actual!;

  it('depreciación null se trata como 0 en el EBITDA', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.flujo_efectivo.depreciacion_bienes_de_uso = null;
    }));
    expect(r.ebitda.actual).toBe(ebitdaBase - 400);
  });

  it('valuación de BdC e inversiones permanentes suman al EBITDA', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_resultados.resultado_valuacion_bienes_de_cambio = 100;
      x.ejercicio_actual.estado_resultados.resultado_inversiones_permanentes = 50;
    }));
    expect(r.ebitda.actual).toBe(ebitdaBase + 100 + 50);
  });

  it('flujo operativo null → autofinanciamiento null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.flujo_efectivo.flujo_neto_operativo = null;
    }));
    expect(r.autofinanciamiento.actual).toBeNull();
  });

  it('sin rubros de caja, créditos ni deudas comerciales → inmediata, KTNO y días null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.activo_corriente.detalles = [];
      x.ejercicio_actual.estado_situacion_patrimonial.pasivo_corriente.detalles = [];
    }));
    expect(r.liquidez_inmediata.actual).toBeNull();
    expect(r.ktno.actual).toBeNull();
    expect(r.dias_de_cobro.actual).toBeNull();
    expect(r.dias_de_pago.actual).toBeNull();
    expect(r.ciclo_conversion_caja.actual).toBeNull();
  });

  it('sin ejercicio anterior → todos los anteriores y variaciones null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_anterior = null;
    }));
    for (const key of Object.keys(EXPECTED) as RatioKey[]) {
      expect(r[key].anterior).toBeNull();
      expect(r[key].variacion_pct).toBeNull();
    }
    expect(r.liquidez_corriente.actual).toBe(2);
  });

  it('sin deuda bancaria anterior → anteriores null aunque haya ejercicio anterior', () => {
    const r = computeRatios(extractionWith(x => {
      x.deuda_bancaria_anterior = null;
    }));
    expect(r.liquidez_corriente.anterior).toBeNull();
  });
});

describe('computeRatios — patrimonio neto negativo', () => {
  // Activo 3000, pasivo 4000, PN −1000 y resultado −500 (pérdida).
  const r = computeRatios(extractionWith(x => {
    const esp = x.ejercicio_actual.estado_situacion_patrimonial;
    esp.activo_corriente.total = 2000;
    esp.activo_no_corriente.total = 1000;
    esp.total_activo = 3000;
    esp.patrimonio_neto = -1000;
    x.ejercicio_actual.estado_resultados.resultado_neto = -500;
  }));

  it('solvencia = PN / pasivo = −0,25 → critical', () => {
    expect(r.solvencia.actual).toBeCloseTo(-0.25, 6);
    expect(r.solvencia.status).toBe('critical');
  });

  // Con PN ≤ 0 el endeudamiento (−4) y el ROE (+50% con pérdida) no tienen
  // sentido económico y se verían sanos: se devuelven null.
  it('endeudamiento → null (no −4)', () => {
    expect(r.endeudamiento.actual).toBeNull();
    expect(r.endeudamiento.variacion_pct).toBeNull();
  });

  it('ROE → null (no +50% con pérdida)', () => {
    expect(r.roe.actual).toBeNull();
  });

  it('ROA = −500 / 3000', () => {
    expect(r.roa.actual).toBeCloseTo(-500 / 3000, 6);
  });
});

describe('computeRatios — independencia de la convención de signos', () => {
  // Gemini a veces devuelve costos y gastos en negativo (como en los EECC) y a
  // veces en positivo. Los ratios tienen que dar lo mismo en los dos casos.
  const positivos = extractionWith(x => {
    for (const y of [x.ejercicio_actual, x.ejercicio_anterior!]) {
      const er = y.estado_resultados;
      er.costo_ventas = Math.abs(er.costo_ventas);
      er.gastos_administracion = Math.abs(er.gastos_administracion);
      er.gastos_comercializacion = Math.abs(er.gastos_comercializacion);
      er.gastos_financieros = Math.abs(er.gastos_financieros ?? 0);
    }
  });
  const base = computeRatios(buildExtraction());
  const conPositivos = computeRatios(positivos);

  it.each(Object.keys(EXPECTED) as RatioKey[])('%s da igual con costos y gastos en positivo', key => {
    expect(conPositivos[key].actual).toBeCloseTo(base[key].actual!, 6);
    expect(conPositivos[key].anterior).toBeCloseTo(base[key].anterior!, 6);
  });

  it('depreciación informada en negativo se suma igual al EBITDA', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.flujo_efectivo.depreciacion_bienes_de_uso = -400;
    }));
    expect(r.ebitda.actual).toBe(3400);
  });
});

describe('computeRatios — clasificación de rubros', () => {
  it('"Cargas fiscales a pagar" y "Remuneraciones a pagar" no son deudas comerciales', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.pasivo_corriente.detalles = [
        { rubro: 'Deudas Comerciales', monto: 1500 },
        { rubro: 'Cargas fiscales a pagar', monto: 200 },
        { rubro: 'Remuneraciones y cargas sociales a pagar', monto: 200 },
        { rubro: 'Préstamos bancarios a pagar', monto: 600 },
      ];
    }));
    expect(r.dias_de_pago.actual).toBeCloseTo(75, 6);
  });

  it('"Proveedores" y "Documentos a pagar" sí son deudas comerciales', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.pasivo_corriente.detalles = [
        { rubro: 'Proveedores', monto: 1000 },
        { rubro: 'Documentos a pagar', monto: 500 },
      ];
    }));
    expect(r.dias_de_pago.actual).toBeCloseTo(75, 6);
  });

  it('"Créditos fiscales" no son créditos por ventas; "Deudores por ventas" sí', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.activo_corriente.detalles = [
        { rubro: 'Caja y Bancos', monto: 500 },
        { rubro: 'Deudores por ventas', monto: 2000 },
        { rubro: 'Créditos fiscales', monto: 300 },
      ];
    }));
    expect(r.dias_de_cobro.actual).toBeCloseTo(50, 6);
  });
});

describe('computeRatios — ejemplo de política: por qué el DSCR manda', () => {
  // EBITDA 1.000, deuda financiera 3.000, caja 500, intereses 300, amortización
  // de capital del año 600, capex de mantenimiento 150 e impuestos 100.
  const r = computeRatios(extractionWith(x => {
    const y = x.ejercicio_actual;
    y.estado_resultados.resultado_bruto = 2850;
    y.estado_resultados.gastos_administracion = -1000;
    y.estado_resultados.gastos_comercializacion = -1000;
    y.estado_resultados.gastos_financieros = -300;
    y.estado_resultados.impuesto_ganancias = -100;
    y.flujo_efectivo.depreciacion_bienes_de_uso = 150; // capex de mantenimiento ≈ depreciación
    x.deuda_bancaria_actual.corriente.total = 600;     // amortización de capital del año
    x.deuda_bancaria_actual.no_corriente.total = 2400;
    // Caja y Bancos = 500 en el fixture
  }));

  it('EBITDA 1.000', () => expect(r.ebitda.actual).toBe(1000));

  it('deuda neta / EBITDA = 2.500 / 1.000 = 2,5x → parece razonable (healthy, límite inclusivo)', () => {
    expect(r.deuda_neta_ebitda.actual).toBeCloseTo(2.5, 6);
    expect(r.deuda_neta_ebitda.status).toBe('healthy');
  });

  it('cobertura de intereses = 1.000 / 300 = 3,3x → parece sana', () => {
    expect(r.cobertura_intereses.actual).toBeCloseTo(1000 / 300, 6);
    expect(r.cobertura_intereses.status).toBe('healthy');
  });

  it('DSCR = (1.000 − 150 − 100) / (300 + 600) = 0,83x → no repaga con su propio flujo', () => {
    expect(r.dscr.actual).toBeCloseTo(750 / 900, 6);
    expect(r.dscr.status).toBe('critical');
  });
});

describe('computeRatios — casos borde de los ratios de capacidad de pago', () => {
  it('EBITDA ≤ 0 → deuda neta / EBITDA y calidad de la ganancia null; DSCR negativo y crítico', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_resultados.resultado_bruto = -3000;
    }));
    expect(r.deuda_neta_ebitda.actual).toBeNull();
    expect(r.calidad_ganancia.actual).toBeNull();
    expect(r.dscr.actual).toBeLessThan(0);
    expect(r.dscr.status).toBe('critical');
  });

  it('caja mayor que la deuda → deuda neta negativa → healthy', () => {
    const r = computeRatios(extractionWith(x => {
      x.deuda_bancaria_actual.corriente.total = 100;
      x.deuda_bancaria_actual.no_corriente.total = 0;
    }));
    expect(r.deuda_neta_ebitda.actual).toBeCloseTo((100 - 500) / 3400, 6);
    expect(r.deuda_neta_ebitda.status).toBe('healthy');
  });

  it('sin rubros de caja → deuda neta = deuda total (criterio conservador)', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.activo_corriente.detalles = [];
    }));
    expect(r.deuda_neta_ebitda.actual).toBeCloseTo(2100 / 3400, 6);
  });

  it('sin intereses ni deuda corriente → DSCR null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_resultados.gastos_financieros = null;
      x.deuda_bancaria_actual.corriente.total = 0;
    }));
    expect(r.dscr.actual).toBeNull();
  });

  it('impuesto a las ganancias ausente (casos viejos) → se toma 0', () => {
    const r = computeRatios(extractionWith(x => {
      delete x.ejercicio_actual.estado_resultados.impuesto_ganancias;
    }));
    expect(r.dscr.actual).toBeCloseTo((3400 - 400) / 1100, 6);
  });

  it('patrimonio neto ≤ 0 → deuda financiera / PN null', () => {
    const r = computeRatios(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.patrimonio_neto = -100;
    }));
    expect(r.deuda_financiera_pn.actual).toBeNull();
  });
});

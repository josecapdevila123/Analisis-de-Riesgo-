import { describe, expect, it } from 'vitest';
import { detectSignals } from './signals';
import { aggregateScore, categoryOf, pceProxy } from './score';
import { computeRatios } from '../ratios/calculations';
import { runSanityChecks } from '../ratios/sanityChecks';
import { runCrossCheck } from '../ratios/crossCheck';
import { buildExtraction, extractionWith } from '../ratios/__fixtures__/extraction';
import { RawExtraction } from '../extraction/schemas';

const signalsFor = (e: RawExtraction) =>
  detectSignals({
    extraction: e,
    ratios: computeRatios(e),
    inconsistencias: runSanityChecks(e),
    crossCheck: runCrossCheck(e),
  });
const ids = (e: RawExtraction) => signalsFor(e).map(s => s.id);

describe('detectSignals', () => {
  it('empresa sana del fixture → sin señales', () => {
    expect(signalsFor(buildExtraction())).toEqual([]);
  });

  describe('Nosis / BCRA', () => {
    it('situación 2 → alta con piso 55 y lista la entidad', () => {
      const s = signalsFor(extractionWith(x => {
        x.extraccion_nosis!.situacion_bcra_peor_estado = 2;
        x.extraccion_nosis!.detalle_entidades = [{ entidad: 'Banco Sur', situacion: 2, monto: 2000 }];
      }));
      expect(s[0]).toMatchObject({ id: 'bcra_situacion_2', severidad: 'alta', piso: 55 });
      expect(s[0].detalle).toContain('Banco Sur (sit. 2)');
    });

    it('situación 3 → crítica piso 75; situación 5 → crítica piso 90', () => {
      expect(signalsFor(extractionWith(x => { x.extraccion_nosis!.situacion_bcra_peor_estado = 3; }))[0])
        .toMatchObject({ severidad: 'critica', piso: 75 });
      expect(signalsFor(extractionWith(x => { x.extraccion_nosis!.situacion_bcra_peor_estado = 5; }))[0])
        .toMatchObject({ severidad: 'critica', piso: 90 });
    });

    it('cheques rechazados: 1 chico → media sin piso; 5 o más → alta piso 60', () => {
      const pocos = signalsFor(extractionWith(x => {
        x.extraccion_nosis!.cheques_rechazados_cantidad = 1;
        x.extraccion_nosis!.cheques_rechazados_monto = 10;
      }));
      expect(pocos[0]).toMatchObject({ id: 'cheques_rechazados', severidad: 'media', piso: null });
      const muchos = signalsFor(extractionWith(x => {
        x.extraccion_nosis!.cheques_rechazados_cantidad = 5;
        x.extraccion_nosis!.cheques_rechazados_monto = 10;
      }));
      expect(muchos[0]).toMatchObject({ severidad: 'alta', piso: 60 });
    });

    it('cheques por ≥1% de las ventas → alta aunque sea uno solo', () => {
      // ventas 14.600 → 1% = 146
      expect(signalsFor(extractionWith(x => {
        x.extraccion_nosis!.cheques_rechazados_cantidad = 1;
        x.extraccion_nosis!.cheques_rechazados_monto = 146;
      }))[0].severidad).toBe('alta');
    });

    it('Nosis con más deuda que el balance (> 10%) → alta', () => {
      const s = signalsFor(extractionWith(x => { x.extraccion_nosis!.deuda_financiera_total_nosis = 3000; }));
      expect(s.find(x => x.id === 'cruce_nosis')).toMatchObject({ severidad: 'alta' });
    });

    it('sin informe Nosis → calidad de información media', () => {
      expect(ids(extractionWith(x => { x.extraccion_nosis = null; }))).toEqual(['sin_nosis']);
    });

    it('score Nosis bajo → señal según el proxy de pérdida esperada', () => {
      expect(signalsFor(extractionWith(x => { x.extraccion_nosis!.score_crediticio = 500; }))[0])
        .toMatchObject({ id: 'score_nosis', severidad: 'media' });
      expect(signalsFor(extractionWith(x => { x.extraccion_nosis!.score_crediticio = 300; }))[0])
        .toMatchObject({ id: 'score_nosis', severidad: 'alta' });
    });
  });

  describe('endeudamiento', () => {
    it('deuda +100% con ventas +33% → crecimiento desmedido', () => {
      // deuda anterior 1750 → actual 3500
      expect(ids(extractionWith(x => {
        x.deuda_bancaria_actual.corriente.total = 1000;
        x.deuda_bancaria_actual.no_corriente.total = 2500;
        x.extraccion_nosis!.deuda_financiera_total_nosis = 3500;
      }))).toContain('deuda_crecimiento_desmedido');
    });

    it('deuda +20% con ventas en el mismo ritmo → sin señal', () => {
      expect(ids(buildExtraction())).not.toContain('deuda_crecimiento_desmedido');
    });

    it('deuda sube (+43%) y ventas caen → alta', () => {
      const s = ids(extractionWith(x => {
        x.ejercicio_actual.estado_resultados.ventas_netas = 10000;
        x.deuda_bancaria_actual.no_corriente.total = 1900; // 600 + 1900 = 2500 vs 1750
      }));
      expect(s).toContain('deuda_sube_ventas_bajan');
      expect(s).toContain('ventas_caen');
    });

    it('EBITDA negativo con deuda → crítica piso 65', () => {
      const s = signalsFor(extractionWith(x => {
        x.ejercicio_actual.estado_resultados.resultado_bruto = -3000;
      }));
      expect(s.find(x => x.id === 'ebitda_negativo_con_deuda')).toMatchObject({ severidad: 'critica', piso: 65 });
    });

    it('deuda concentrada > 70% en corto plazo → media', () => {
      expect(ids(extractionWith(x => {
        x.deuda_bancaria_actual.corriente.total = 1800;
        x.deuda_bancaria_actual.no_corriente.total = 300;
      }))).toContain('deuda_corto_plazo');
    });
  });

  describe('liquidez y solvencia', () => {
    it('patrimonio neto negativo → crítica piso 85', () => {
      const s = signalsFor(extractionWith(x => {
        const esp = x.ejercicio_actual.estado_situacion_patrimonial;
        esp.activo_corriente.total = 2000;
        esp.activo_no_corriente.total = 1000;
        esp.total_activo = 3000;
        esp.patrimonio_neto = -1000;
      }));
      expect(s[0]).toMatchObject({ id: 'patrimonio_negativo', severidad: 'critica', piso: 85 });
    });

    it('liquidez corriente < 1 → alta (y no duplica con prueba ácida)', () => {
      const s = ids(extractionWith(x => {
        const esp = x.ejercicio_actual.estado_situacion_patrimonial;
        esp.pasivo_corriente.total = 6000;
        esp.pasivo_no_corriente.total = -2000; // mantiene total pasivo 4000
      }));
      expect(s).toContain('liquidez_corriente_baja');
      expect(s).not.toContain('prueba_acida_baja');
    });
  });

  describe('post balance', () => {
    it('ventas post cierre por debajo del año anterior → alta', () => {
      expect(ids(extractionWith(x => {
        x.analisis_post_cierre = {
          periodo_analizado: null,
          detalle_ventas_mensuales: [
            { mes: 'Enero', monto: 900, monto_anio_anterior: 1000, moneda: 'ARS' },
            { mes: 'Febrero', monto: 950, monto_anio_anterior: 1000, moneda: 'ARS' },
          ],
          total_ventas_post_cierre: 1850,
          notas_relevantes: null,
          deuda_bancaria_post_balance_detalle: [],
        };
      }))).toEqual(['ventas_post_balance_caen']);
    });

    it('deuda post balance > 60% de la deuda al cierre → alta; en USD → señal de tipo de cambio', () => {
      const s = signalsFor(extractionWith(x => {
        x.analisis_post_cierre = {
          periodo_analizado: null,
          detalle_ventas_mensuales: [],
          total_ventas_post_cierre: 0,
          notas_relevantes: null,
          deuda_bancaria_post_balance_detalle: [
            { entidad: 'Banco A', monto: 1500, moneda: 'ARS' },
            { entidad: 'Banco B', monto: 100, moneda: 'USD' },
          ],
        };
      }));
      expect(s.find(x => x.id === 'deuda_post_balance')).toMatchObject({ severidad: 'alta' });
      expect(s.map(x => x.id)).toContain('deuda_post_balance_usd');
    });
  });

  it('balance que no cuadra → calidad de información alta', () => {
    expect(ids(extractionWith(x => {
      x.ejercicio_actual.estado_situacion_patrimonial.total_activo = 9000;
    }))).toContain('balance_no_cuadra');
  });

  it('ordena de más grave a menos grave', () => {
    const s = signalsFor(extractionWith(x => {
      x.extraccion_nosis!.situacion_bcra_peor_estado = 3;
      x.deuda_bancaria_actual.corriente.total = 1800;
      x.deuda_bancaria_actual.no_corriente.total = 300;
    }));
    const rank = { critica: 0, alta: 1, media: 2, baja: 3 };
    const ranks = s.map(x => rank[x.severidad]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(s[0].severidad).toBe('critica');
  });

  describe('capacidad de pago', () => {
    it('ejemplo de política: DSCR 0,83 → crítica con piso 65', () => {
      const s = signalsFor(extractionWith(x => {
        const y = x.ejercicio_actual;
        y.estado_resultados.resultado_bruto = 2850;
        y.estado_resultados.gastos_administracion = -1000;
        y.estado_resultados.gastos_comercializacion = -1000;
        y.estado_resultados.gastos_financieros = -300;
        y.estado_resultados.impuesto_ganancias = -100;
        y.flujo_efectivo.depreciacion_bienes_de_uso = 150;
        y.flujo_efectivo.flujo_neto_operativo = 800;
        x.deuda_bancaria_actual.corriente.total = 600;
        x.deuda_bancaria_actual.no_corriente.total = 2400;
        x.extraccion_nosis!.deuda_financiera_total_nosis = 3000;
      }));
      expect(s.find(x => x.id === 'dscr_menor_1')).toMatchObject({ severidad: 'critica', piso: 65 });
      // deuda neta / EBITDA 2,5x y cobertura 3,3x no disparan nada: por eso el DSCR manda
      expect(s.map(x => x.id)).not.toContain('deuda_neta_ebitda_alta');
      expect(s.map(x => x.id)).not.toContain('cobertura_baja');
    });

    it('DSCR entre 1 y 1,25 → alta sin piso', () => {
      // (3400 − 400 − 540) / (500 + 1700) = 1,12
      const s = signalsFor(extractionWith(x => {
        x.deuda_bancaria_actual.corriente.total = 1700;
        x.deuda_bancaria_actual.no_corriente.total = 400;
      }));
      expect(s.find(x => x.id === 'dscr_ajustado')).toMatchObject({ severidad: 'alta', piso: null });
    });

    it('EBITDA negativo no duplica la señal de DSCR', () => {
      const s = ids(extractionWith(x => { x.ejercicio_actual.estado_resultados.resultado_bruto = -3000; }));
      expect(s).toContain('ebitda_negativo_con_deuda');
      expect(s).not.toContain('dscr_menor_1');
    });

    it('deuda neta / EBITDA > 4x → alta', () => {
      // EBITDA 1.000 con deuda 6.000 y caja 500 → 5,5x
      expect(ids(extractionWith(x => {
        const er = x.ejercicio_actual.estado_resultados;
        er.resultado_bruto = 4900;
        x.deuda_bancaria_actual.corriente.total = 500;
        x.deuda_bancaria_actual.no_corriente.total = 5500;
        x.extraccion_nosis!.deuda_financiera_total_nosis = 6000;
      }))).toContain('deuda_neta_ebitda_alta');
    });

    it('calidad de la ganancia < 60% → media', () => {
      expect(ids(extractionWith(x => {
        x.ejercicio_actual.flujo_efectivo.flujo_neto_operativo = 1700; // 50% de 3.400
      }))).toEqual(['calidad_ganancia_baja']);
    });

    it('descalce de moneda: deuda en USD sin exportaciones → alta si supera el 30% de la deuda', () => {
      const s = signalsFor(extractionWith(x => {
        x.informacion_complementaria!.deuda_financiera_moneda_extranjera = 1000;
        x.informacion_complementaria!.porcentaje_ventas_exportacion = 0;
      }));
      expect(s.find(x => x.id === 'descalce_moneda')).toMatchObject({ severidad: 'alta' });
    });

    it('deuda en USD cubierta por exportaciones → sin descalce', () => {
      expect(ids(extractionWith(x => {
        x.informacion_complementaria!.deuda_financiera_moneda_extranjera = 1000;
        x.informacion_complementaria!.porcentaje_ventas_exportacion = 70;
      }))).not.toContain('descalce_moneda');
    });
  });

  describe('comportamiento y señales externas', () => {
    it('hoy situación 1 pero 3 en los últimos 24 meses → alta', () => {
      expect(signalsFor(extractionWith(x => { x.extraccion_nosis!.peor_situacion_24_meses = 3; }))[0])
        .toMatchObject({ id: 'bcra_historial_24m', severidad: 'alta' });
    });

    it('historial 24 meses no duplica si la situación actual ya es igual o peor', () => {
      expect(ids(extractionWith(x => {
        x.extraccion_nosis!.situacion_bcra_peor_estado = 2;
        x.extraccion_nosis!.peor_situacion_24_meses = 2;
      }))).toEqual(['bcra_situacion_2']);
    });

    it('cheques rechazados todos levantados → baja', () => {
      expect(signalsFor(extractionWith(x => {
        x.extraccion_nosis!.cheques_rechazados_cantidad = 6;
        x.extraccion_nosis!.cheques_rechazados_levantados = 6;
        x.extraccion_nosis!.cheques_rechazados_monto = 500;
      }))[0]).toMatchObject({ id: 'cheques_rechazados', severidad: 'baja', piso: null });
    });

    it('deuda con ARCA → alta; planes de pago → baja', () => {
      const s = signalsFor(extractionWith(x => {
        x.extraccion_nosis!.deuda_fiscal_previsional = 300;
        x.extraccion_nosis!.planes_de_pago_arca = true;
      }));
      expect(s.find(x => x.id === 'deuda_arca')?.severidad).toBe('alta');
      expect(s.find(x => x.id === 'planes_arca')?.severidad).toBe('baja');
    });

    it('juicios o embargos → alta; pedido de quiebra → crítica piso 80', () => {
      const s = signalsFor(extractionWith(x => {
        x.extraccion_nosis!.embargos_cantidad = 1;
        x.extraccion_nosis!.pedidos_quiebra_cantidad = 1;
      }));
      expect(s[0]).toMatchObject({ id: 'pedido_quiebra', severidad: 'critica', piso: 80 });
      expect(s.find(x => x.id === 'juicios_embargos')?.severidad).toBe('alta');
    });
  });

  describe('calidad de la información y RT 6', () => {
    it('auditor con salvedades → alta; adversa o abstención → crítica piso 70', () => {
      expect(signalsFor(extractionWith(x => { x.informacion_complementaria!.opinion_auditor = 'con_salvedades'; }))[0])
        .toMatchObject({ id: 'auditor_salvedades', severidad: 'alta' });
      expect(signalsFor(extractionWith(x => { x.informacion_complementaria!.opinion_auditor = 'abstencion'; }))[0])
        .toMatchObject({ id: 'auditor_adverso', severidad: 'critica', piso: 70 });
    });

    it('balance sin ajuste por inflación → media; caída de ventas se informa como nominal', () => {
      const s = signalsFor(extractionWith(x => {
        x.informacion_complementaria!.balance_ajustado_por_inflacion = false;
        x.ejercicio_actual.estado_resultados.ventas_netas = 10000;
      }));
      expect(s.map(x => x.id)).toContain('sin_ajuste_inflacion');
      expect(s.find(x => x.id === 'ventas_caen')?.titulo).toBe('Caída nominal de ventas');
    });

    it('balance en moneda homogénea → la caída de ventas es real', () => {
      expect(signalsFor(extractionWith(x => {
        x.ejercicio_actual.estado_resultados.ventas_netas = 10000;
      })).find(x => x.id === 'ventas_caen')?.titulo).toBe('Caída real de ventas');
    });

    it('RECPAM mayor al 50% del resultado neto → media', () => {
      expect(ids(extractionWith(x => { x.ejercicio_actual.estado_resultados.recpam = 900; }))).toEqual(['recpam_relevante']);
    });

    it('casos viejos sin información complementaria → no dispara señales de RT 6 ni auditor', () => {
      expect(signalsFor(extractionWith(x => { delete x.informacion_complementaria; }))).toEqual([]);
    });
  });
});

describe('pceProxy — tramos no lineales de score Nosis (más alto = menor pérdida)', () => {
  it('cada tramo según la política', () => {
    expect([999, 800, 799, 700, 650, 547, 500, 450, 350, 299, 1].map(pceProxy))
      .toEqual([5, 5, 12, 12, 25, 45, 45, 65, 82, 95, 95]);
  });
  it('no lineal: perder 100 puntos de score pesa más en la zona media que en la alta', () => {
    // 800 → 700: +7 de pérdida esperada; 600 → 500: +20
    expect(pceProxy(700)! - pceProxy(800)!).toBe(7);
    expect(pceProxy(500)! - pceProxy(600)!).toBe(20);
  });
  it('sin score → null; fuera de rango usa el tramo extremo', () => {
    expect(pceProxy(null)).toBeNull();
    expect(pceProxy(1500)).toBe(5);
    expect(pceProxy(-3)).toBe(95);
  });
});

describe('aggregateScore', () => {
  it('promedio ponderado por los pesos de cada dimensión', () => {
    // nosis 25×20 + endeudamiento 20×60 = 1700 / 45 = 37,8
    const r = aggregateScore(
      [{ dimension: 'nosis_bcra', puntaje: 20 }, { dimension: 'endeudamiento', puntaje: 60 }],
      []
    );
    expect(r.ponderado).toBe(38);
    expect(r.final).toBe(38);
    expect(r.categoria).toBe('moderado');
  });

  it('las dimensiones sin datos (null) no cuentan', () => {
    const r = aggregateScore(
      [{ dimension: 'nosis_bcra', puntaje: 30 }, { dimension: 'ventas_post_balance', puntaje: null }],
      []
    );
    expect(r.final).toBe(30);
  });

  it('el piso de una señal grave sube el puntaje aunque el modelo sea optimista', () => {
    const r = aggregateScore(
      [{ dimension: 'nosis_bcra', puntaje: 20 }],
      [{ piso: 55, motivo: 'Situación 2' }, { piso: 75, motivo: 'Situación 3' }]
    );
    expect(r.final).toBe(75);
    expect(r.piso?.motivo).toBe('Situación 3');
    expect(r.categoria).toBe('alto');
  });

  it('el piso no baja un puntaje que ya es mayor', () => {
    expect(aggregateScore([{ dimension: 'endeudamiento', puntaje: 90 }], [{ piso: 55, motivo: 'x' }]).final).toBe(90);
  });

  it('bandas: 25 bajo, 26 moderado, 50 moderado, 51 alto, 75 alto, 76 crítico', () => {
    expect([25, 26, 50, 51, 75, 76].map(categoryOf)).toEqual(['bajo', 'moderado', 'moderado', 'alto', 'alto', 'critico']);
  });
});

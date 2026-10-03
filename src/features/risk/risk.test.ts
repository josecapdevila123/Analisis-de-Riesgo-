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
      expect(s).toContain('ventas_caen_nominal');
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
    expect(s.map(x => x.severidad)).toEqual(['critica', 'media']);
  });
});

describe('pceProxy (score Nosis 1–999, más alto = mejor)', () => {
  it('extremos y punto medio', () => {
    expect(pceProxy(999)).toBe(0);
    expect(pceProxy(1)).toBe(100);
    expect(pceProxy(500)).toBe(50);
  });
  it('fuera de rango se acota; sin score → null', () => {
    expect(pceProxy(1500)).toBe(0);
    expect(pceProxy(null)).toBeNull();
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

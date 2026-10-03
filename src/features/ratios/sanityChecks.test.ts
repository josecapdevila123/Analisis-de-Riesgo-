import { describe, expect, it } from 'vitest';
import { runSanityChecks } from './sanityChecks';
import { buildExtraction, extractionWith } from './__fixtures__/extraction';

const campos = (e: Parameters<typeof runSanityChecks>[0]) => runSanityChecks(e).map(i => i.campo);

describe('runSanityChecks', () => {
  it('balance que cuadra y sin variaciones extremas → sin inconsistencias', () => {
    expect(runSanityChecks(buildExtraction())).toEqual([]);
  });

  describe('ecuación contable (activo = pasivo + PN, tolerancia 1%)', () => {
    it('descuadre de 5% → error con esperado, observado y diferencia', () => {
      const r = runSanityChecks(extractionWith(x => {
        // Activo 8400 vs pasivo + PN 8000 → +5%. Se ajusta AC para que los subtotales sigan cuadrando.
        const esp = x.ejercicio_actual.estado_situacion_patrimonial;
        esp.activo_corriente.total = 5400;
        esp.total_activo = 8400;
      }));
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({
        campo: 'ejercicio_actual.total_activo',
        esperado: 8000,
        observado: 8400,
        severidad: 'error',
      });
      expect(r[0].diferencia_pct).toBeCloseTo(5, 6);
    });

    it('descuadre de 0,5% (dentro de la tolerancia) → sin inconsistencias', () => {
      const r = runSanityChecks(extractionWith(x => {
        const esp = x.ejercicio_actual.estado_situacion_patrimonial;
        esp.activo_corriente.total = 5040;
        esp.total_activo = 8040;
      }));
      expect(r).toEqual([]);
    });

    it('también se chequea el ejercicio anterior', () => {
      expect(campos(extractionWith(x => {
        x.ejercicio_anterior!.estado_situacion_patrimonial.patrimonio_neto = 3000;
      }))).toContain('ejercicio_anterior.total_activo');
    });

    it('patrimonio neto negativo que cuadra → solo la alerta de PN negativo', () => {
      const r = runSanityChecks(extractionWith(x => {
        const esp = x.ejercicio_actual.estado_situacion_patrimonial;
        esp.activo_corriente.total = 2000;
        esp.activo_no_corriente.total = 1000;
        esp.total_activo = 3000;
        esp.patrimonio_neto = -1000;
        // PN pasa de 2500 a −1000 (−140%): no supera el umbral de 200%.
      }));
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({
        campo: 'ejercicio_actual.patrimonio_neto',
        observado: -1000,
        severidad: 'error',
      });
    });

    it('patrimonio neto 0 → no se marca como negativo', () => {
      const r = runSanityChecks(extractionWith(x => {
        const esp = x.ejercicio_actual.estado_situacion_patrimonial;
        esp.total_pasivo = 8000;
        esp.pasivo_no_corriente.total = 5500;
        esp.patrimonio_neto = 0;
      }));
      expect(r.map(i => i.campo)).not.toContain('ejercicio_actual.patrimonio_neto');
    });
  });

  describe('subtotales', () => {
    it('AC + ANC ≠ activo total → error de subtotales de activo', () => {
      expect(campos(extractionWith(x => {
        x.ejercicio_actual.estado_situacion_patrimonial.activo_no_corriente.total = 2000;
      }))).toEqual(['ejercicio_actual.total_activo (subtotales)']);
    });

    it('PC + PNC ≠ pasivo total → error de subtotales de pasivo', () => {
      expect(campos(extractionWith(x => {
        x.ejercicio_actual.estado_situacion_patrimonial.pasivo_no_corriente.total = 1000;
      }))).toEqual(['ejercicio_actual.total_pasivo (subtotales)']);
    });
  });

  describe('variaciones interanuales extremas (> 200%)', () => {
    it('ventas que se triplican y más (+250%) → warning', () => {
      const r = runSanityChecks(extractionWith(x => {
        x.ejercicio_actual.estado_resultados.ventas_netas = 10950 * 3.5;
      }));
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ campo: 'ventas_netas', severidad: 'warning', esperado: null });
      expect(r[0].diferencia_pct).toBeCloseTo(250, 6);
    });

    it('variación exacta de 200% → no se marca (umbral estricto)', () => {
      expect(runSanityChecks(extractionWith(x => {
        x.ejercicio_actual.estado_resultados.ventas_netas = 10950 * 3;
      }))).toEqual([]);
    });

    it('caída de resultado de 1000 a −1500 (−250%) → warning', () => {
      expect(campos(extractionWith(x => {
        x.ejercicio_actual.estado_resultados.resultado_neto = -1500;
      }))).toEqual(['resultado_neto']);
    });

    it('valor anterior 0 → no se puede medir la variación, no se marca', () => {
      expect(runSanityChecks(extractionWith(x => {
        x.ejercicio_anterior!.estado_resultados.resultado_neto = 0;
      }))).toEqual([]);
    });

    it('sin ejercicio anterior → solo chequea el actual', () => {
      expect(runSanityChecks(extractionWith(x => {
        x.ejercicio_anterior = null;
        x.ejercicio_actual.estado_resultados.ventas_netas = 1_000_000;
      }))).toEqual([]);
    });
  });
});

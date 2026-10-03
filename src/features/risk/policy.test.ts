import { describe, expect, it } from 'vitest';
import {
  DIMENSION_WEIGHTS, PCE_TRAMOS, perfilEfectivo, POLICY_CHANGELOG, POLICY_VERSION, RATIO_THRESHOLDS, RUBROS,
  SCORE_BANDS, SECTOR_PROFILES, SIGNAL_PARAMS, SUGERENCIA_RUBRO,
  SUBSEGMENTOS, SIGNAL_PARAMS_FINANCIERA, DOCUMENTOS_SECTORIALES, UMBRALES_DOCUMENTOS, SIGNAL_PARAMS_DOCUMENTOS, KW_CAMPO_PROPIO,
} from './policy';

// Hash FNV-1a de 32 bits: estable y sin dependencias.
const fnv1a = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

const hashPolitica = () =>
  fnv1a(JSON.stringify({ RATIO_THRESHOLDS, SIGNAL_PARAMS, DIMENSION_WEIGHTS, SCORE_BANDS, PCE_TRAMOS, SECTOR_PROFILES, SUGERENCIA_RUBRO,
    SUBSEGMENTOS, SIGNAL_PARAMS_FINANCIERA, DOCUMENTOS_SECTORIALES, UMBRALES_DOCUMENTOS, SIGNAL_PARAMS_DOCUMENTOS, KW_CAMPO_PROPIO }));

// Si cambiás umbrales, señales, pesos o perfiles: subí POLICY_VERSION, anotá el
// cambio en POLICY_CHANGELOG y actualizá esta línea con la versión y el hash nuevos.
const REGISTRADA = { version: '2.2.0', hash: '94704043' };

describe('versión de la política', () => {
  it('el hash coincide con la versión registrada (si falla: subí la versión y actualizá REGISTRADA)', () => {
    expect({ version: POLICY_VERSION, hash: hashPolitica() }).toEqual(REGISTRADA);
  });

  it('la versión vigente encabeza el changelog', () => {
    expect(POLICY_CHANGELOG[0].version).toBe(POLICY_VERSION);
  });
});

describe('perfiles por rubro', () => {
  it.each(RUBROS)('%s: los pesos suman 100', rubro => {
    const suma = Object.values(perfilEfectivo(rubro).pesos).reduce((a, b) => a + b, 0);
    expect(suma).toBe(100);
  });

  it('genérico = política base: mismos umbrales, señales y pesos; nada desactivado', () => {
    const g = perfilEfectivo('generico');
    for (const [k, t] of Object.entries(RATIO_THRESHOLDS)) expect(g.umbrales[k as keyof typeof RATIO_THRESHOLDS]).toEqual(t);
    expect(g.senales).toEqual(SIGNAL_PARAMS);
    for (const [d, w] of Object.entries(DIMENSION_WEIGHTS)) expect(g.pesos[d as keyof typeof DIMENSION_WEIGHTS]).toBe(w.weight);
    expect(g.noAplica).toEqual({});
    expect(g.senalesDesactivadas).toEqual([]);
  });

  it('agro: prueba ácida y calidad de la ganancia no aplican y desactivan su señal', () => {
    const a = perfilEfectivo('agro');
    expect(Object.keys(a.noAplica).sort()).toEqual(['calidad_ganancia', 'liquidez_acida']);
    expect(a.senalesDesactivadas.map(s => s.id).sort()).toEqual(['calidad_ganancia_baja', 'prueba_acida_baja']);
    expect(a.senales.deuda.cortoPlazoShare).toBe(0.9);
    expect(a.senales.liquidez.ciclosDiasAumento).toBe(60);
    // El resto de las señales queda como en el genérico.
    expect(a.senales.deuda.pasivoPnMedia).toBe(SIGNAL_PARAMS.deuda.pasivoPnMedia);
  });

  it('servicios: pesos negocio y mercado 15, liquidez y solvencia 10', () => {
    const s = perfilEfectivo('servicios');
    expect(s.pesos.negocio_mercado).toBe(15);
    expect(s.pesos.liquidez_solvencia).toBe(10);
  });

  it('el override cambia solo lo indicado: comercio prueba ácida 0,8 / 0,5, mismo label y sentido', () => {
    const t = perfilEfectivo('comercio').umbrales.liquidez_acida;
    expect(t).toMatchObject({ sano: 0.8, alerta: 0.5, mejorSi: 'mayor', label: RATIO_THRESHOLDS.liquidez_acida.label });
  });

  it('perfilEfectivo no modifica la política base', () => {
    perfilEfectivo('agro');
    expect(SIGNAL_PARAMS.deuda.cortoPlazoShare).toBe(0.7);
    expect(RATIO_THRESHOLDS.deuda_neta_ebitda.sano).toBe(2.5);
  });

  it('cada perfil tiene KPIs prioritarios y entre 3 y 5 preguntas clave', () => {
    for (const r of RUBROS) {
      expect(SECTOR_PROFILES[r].kpisPrioritarios.length).toBeGreaterThan(0);
      expect(SECTOR_PROFILES[r].preguntasClave.length).toBeGreaterThanOrEqual(3);
      expect(SECTOR_PROFILES[r].preguntasClave.length).toBeLessThanOrEqual(5);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { detectSignals } from './signals';
import { aggregateScore } from './score';
import { perfilEfectivo, RUBROS, SubSegmento } from './policy';
import { computeRatios } from '../ratios/calculations';
import { runSanityChecks } from '../ratios/sanityChecks';
import { runCrossCheck } from '../ratios/crossCheck';
import { buildExtraction, extractionWith } from '../ratios/__fixtures__/extraction';
import { RawExtraction, RiskDimension } from '../extraction/schemas';

// REGRESIÓN SIN DOCUMENTOS: foto de semáforos, señales y puntaje de todos los
// perfiles (incluida Financiera) antes de sumar los documentos sectoriales de
// agro, construcción y el documento adicional. Sin documentos cargados, nada
// de eso puede cambiar. No se actualiza el snapshot sin revisar la diferencia.

const financiera = (vencida90: number, previsiones: number) => extractionWith(x => {
  const esp = x.ejercicio_actual.estado_situacion_patrimonial;
  esp.activo_corriente = { total: 950, detalles: [{ rubro: 'Caja y Bancos', monto: 100 }, { rubro: 'Créditos financieros', monto: 850 }] };
  esp.activo_no_corriente = { total: 50, detalles: [{ rubro: 'Bienes de uso', monto: 50 }] };
  esp.total_activo = 1000;
  esp.pasivo_corriente = { total: 600, detalles: [{ rubro: 'Deudas financieras', monto: 600 }] };
  esp.pasivo_no_corriente = { total: 150, detalles: [{ rubro: 'Obligaciones negociables', monto: 150 }] };
  esp.total_pasivo = 750;
  esp.patrimonio_neto = 250;
  esp.bienes_de_cambio = null;
  x.extraccion_financiera = {
    fecha_cierre: '2025-12-31', cartera_total: 850, cartera_total_anterior: 600,
    cartera_vencida_por_tramo: [{ tramo: 'hasta 3 meses', desde_dias: 0, hasta_dias: 90, monto: 40 }, { tramo: 'de 3 a 6 meses', desde_dias: 90, hasta_dias: 180, monto: vencida90 }],
    previsiones_incobrabilidad: previsiones, cargo_incobrabilidad: 20, ingresos_financieros: 300, egresos_financieros: 100,
    creditos_a_vencer_90_dias: 300, pasivos_a_vencer_90_dias: 450, inversiones_corrientes: null,
    fondeo: [{ fuente: 'bancos', monto: 600 }, { fuente: 'obligaciones_negociables', monto: 150 }],
  };
});

const productivas: Record<string, RawExtraction> = {
  sano: buildExtraction(),
  con_anticipos: extractionWith(x => {
    const esp = x.ejercicio_actual.estado_situacion_patrimonial;
    esp.pasivo_corriente.total = 4800;
    esp.pasivo_corriente.detalles.push({ rubro: 'Anticipos de clientes', monto: 2300 });
    esp.total_pasivo = 6300;
    esp.patrimonio_neto = 1700;
  }),
};

const financieras: Array<[string, RawExtraction, SubSegmento]> = [
  ['A_sana', financiera(34, 37.4), 'prendario_empresas'],
  ['B_estresada', financiera(102, 51), 'prendario_empresas'],
  ['D_pn_ajustado_negativo', financiera(400, 100), 'consumo'],
  ['sin_bloque', extractionWith(x => { x.extraccion_financiera = null; }), 'factoring'],
];

const DIMS: Array<{ dimension: RiskDimension; puntaje: number | null }> = [
  { dimension: 'nosis_bcra', puntaje: 30 }, { dimension: 'endeudamiento', puntaje: 45 },
  { dimension: 'liquidez_solvencia', puntaje: 50 }, { dimension: 'rentabilidad', puntaje: 35 },
  { dimension: 'ventas_post_balance', puntaje: 20 }, { dimension: 'negocio_mercado', puntaje: 40 },
  { dimension: 'calidad_informacion', puntaje: 20 }, { dimension: 'calidad_cartera', puntaje: 60 },
];

const foto = (e: RawExtraction, perfil: ReturnType<typeof perfilEfectivo>) => {
  const ratios = computeRatios(e, perfil, []);
  const senales = detectSignals({ extraction: e, ratios, inconsistencias: runSanityChecks(e), crossCheck: runCrossCheck(e), perfil, documentos: [] });
  const pisos = senales.filter(s => s.piso !== null).map(s => ({ piso: s.piso as number, motivo: s.titulo }));
  return {
    semaforos: Object.fromEntries(Object.entries(ratios).map(([k, r]) => [k, r.status])),
    senales: senales.map(s => ({ id: s.id, severidad: s.severidad, piso: s.piso, detalle: s.detalle })),
    puntaje: aggregateScore(DIMS, pisos, perfil.pesos),
  };
};

describe('regresión sin documentos: perfiles productivos', () => {
  for (const rubro of RUBROS.filter(r => r !== 'financiera')) {
    for (const [nombre, e] of Object.entries(productivas)) {
      it(`${rubro} · ${nombre}`, () => expect(foto(e, perfilEfectivo(rubro))).toMatchSnapshot());
    }
  }
});

describe('regresión sin documentos: financiera', () => {
  for (const [nombre, e, sub] of financieras) {
    it(`${nombre} (${sub})`, () => expect(foto(e, perfilEfectivo('financiera', sub))).toMatchSnapshot());
  }
});

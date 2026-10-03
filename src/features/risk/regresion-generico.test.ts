import { describe, expect, it } from 'vitest';
import { detectSignals } from './signals';
import { aggregateScore } from './score';
import { computeRatios } from '../ratios/calculations';
import { runSanityChecks } from '../ratios/sanityChecks';
import { runCrossCheck } from '../ratios/crossCheck';
import { buildExtraction, extractionWith } from '../ratios/__fixtures__/extraction';
import { RawExtraction, RiskDimension } from '../extraction/schemas';

// REGRESIÓN DEL PERFIL GENÉRICO.
// Foto de semáforos, señales y puntaje de la política única (antes de los
// perfiles sectoriales), sobre escenarios que disparan casi todas las reglas.
// El perfil "generico" tiene que reproducirla EXACTAMENTE. Si este test falla,
// algo cambió los resultados de hoy: no se actualiza el snapshot sin revisar.

const escenarios: Record<string, RawExtraction> = {
  sano: buildExtraction(),

  estresado: extractionWith(x => {
    const a = x.ejercicio_actual;
    a.estado_situacion_patrimonial.activo_corriente.total = 2400;
    a.estado_situacion_patrimonial.activo_corriente.detalles = [
      { rubro: 'Caja y Bancos', monto: 100 },
      { rubro: 'Créditos por Ventas', monto: 900 },
      { rubro: 'Bienes de Cambio', monto: 1400 },
    ];
    a.estado_situacion_patrimonial.bienes_de_cambio = 1400;
    a.estado_situacion_patrimonial.pasivo_corriente.total = 2600;
    a.estado_situacion_patrimonial.total_pasivo = 9000;
    a.estado_situacion_patrimonial.patrimonio_neto = 1500;
    a.estado_resultados.ventas_netas = 9000;
    a.estado_resultados.costo_ventas = -6000;
    a.estado_resultados.resultado_bruto = 3000;
    a.estado_resultados.gastos_administracion = -1500;
    a.estado_resultados.gastos_comercializacion = -1000;
    a.estado_resultados.gastos_financieros = -900;
    a.estado_resultados.resultado_neto = -300;
    a.estado_resultados.recpam = 400;
    a.flujo_efectivo.flujo_neto_operativo = 300;
    x.ejercicio_anterior!.estado_resultados.resultado_neto = -100;
    x.deuda_bancaria_actual.corriente.total = 3500;
    x.deuda_bancaria_actual.no_corriente.total = 500;
    x.informacion_complementaria = {
      balance_ajustado_por_inflacion: false,
      opinion_auditor: 'con_salvedades',
      detalle_opinion_auditor: 'Salvedad por valuación de stock.',
      deuda_financiera_moneda_extranjera: 1500,
      porcentaje_ventas_exportacion: 10,
    };
    x.extraccion_nosis!.score_crediticio = 480;
    x.extraccion_nosis!.situacion_bcra_peor_estado = 2;
    x.extraccion_nosis!.detalle_entidades = [{ entidad: 'Banco Sur', situacion: 2, monto: 4000 }];
    x.extraccion_nosis!.deuda_financiera_total_nosis = 6000;
    x.extraccion_nosis!.peor_situacion_24_meses = 3;
    x.extraccion_nosis!.cheques_rechazados_cantidad = 2;
    x.extraccion_nosis!.cheques_rechazados_monto = 30;
    x.extraccion_nosis!.deuda_fiscal_previsional = 50;
    x.extraccion_nosis!.planes_de_pago_arca = true;
    x.analisis_post_cierre = {
      periodo_analizado: null,
      detalle_ventas_mensuales: [{ mes: 'Enero', monto: 700, monto_anio_anterior: 900, moneda: 'ARS' }],
      total_ventas_post_cierre: 700,
      notas_relevantes: null,
      deuda_bancaria_post_balance_detalle: [
        { entidad: 'Banco Sur', monto: 2000, moneda: 'ARS' },
        { entidad: 'Banco Norte', monto: 100, moneda: 'USD' },
      ],
    };
  }),

  quiebra_tecnica: extractionWith(x => {
    const a = x.ejercicio_actual;
    a.estado_situacion_patrimonial.patrimonio_neto = -500;
    a.estado_situacion_patrimonial.total_pasivo = 8500;
    a.estado_resultados.resultado_bruto = 1000;
    a.estado_resultados.gastos_administracion = -2000;
    a.estado_resultados.gastos_comercializacion = -1500;
    a.estado_resultados.resultado_neto = -2500;
    x.extraccion_nosis!.situacion_bcra_peor_estado = 4;
    x.extraccion_nosis!.cheques_rechazados_cantidad = 6;
    x.extraccion_nosis!.cheques_rechazados_monto = 400;
    x.extraccion_nosis!.juicios_cantidad = 1;
    x.extraccion_nosis!.pedidos_quiebra_cantidad = 1;
    x.informacion_complementaria = {
      balance_ajustado_por_inflacion: true,
      opinion_auditor: 'abstencion',
      detalle_opinion_auditor: null,
      deuda_financiera_moneda_extranjera: null,
      porcentaje_ventas_exportacion: null,
    };
  }),

  // Pasivo con anticipos de clientes: en el genérico NO se excluyen.
  con_anticipos: extractionWith(x => {
    const esp = x.ejercicio_actual.estado_situacion_patrimonial;
    esp.pasivo_corriente.total = 4800;
    esp.pasivo_corriente.detalles.push({ rubro: 'Anticipos de clientes', monto: 2300 });
    esp.total_pasivo = 6300;
    esp.patrimonio_neto = 1700;
  }),

  // Mucho stock y poco flujo operativo (perfil típico de agro).
  stock_alto: extractionWith(x => {
    const esp = x.ejercicio_actual.estado_situacion_patrimonial;
    esp.bienes_de_cambio = 3800;
    esp.activo_corriente.detalles = [
      { rubro: 'Caja y Bancos', monto: 200 },
      { rubro: 'Créditos por Ventas', monto: 1000 },
      { rubro: 'Bienes de Cambio', monto: 3800 },
    ];
    x.ejercicio_actual.flujo_efectivo.flujo_neto_operativo = 900;
    x.deuda_bancaria_actual.corriente.total = 1900;
    x.deuda_bancaria_actual.no_corriente.total = 200;
  }),

  sin_comparativo_ni_nosis: extractionWith(x => {
    x.ejercicio_anterior = null;
    x.deuda_bancaria_anterior = null;
    x.extraccion_nosis = null;
  }),
};

// Puntajes por dimensión fijos (los daría el modelo) para aislar la ponderación.
const DIMS: Array<{ dimension: RiskDimension; puntaje: number | null }> = [
  { dimension: 'nosis_bcra', puntaje: 30 },
  { dimension: 'endeudamiento', puntaje: 45 },
  { dimension: 'liquidez_solvencia', puntaje: 50 },
  { dimension: 'rentabilidad', puntaje: 35 },
  { dimension: 'ventas_post_balance', puntaje: null },
  { dimension: 'negocio_mercado', puntaje: 40 },
  { dimension: 'calidad_informacion', puntaje: 20 },
];

const foto = (e: RawExtraction) => {
  const ratios = computeRatios(e);
  const senales = detectSignals({ extraction: e, ratios, inconsistencias: runSanityChecks(e), crossCheck: runCrossCheck(e) });
  const pisos = senales.filter(s => s.piso !== null).map(s => ({ piso: s.piso as number, motivo: s.titulo }));
  return {
    semaforos: Object.fromEntries(Object.entries(ratios).map(([k, r]) => [k, r.status])),
    senales: senales.map(s => ({ id: s.id, dimension: s.dimension, severidad: s.severidad, piso: s.piso, titulo: s.titulo, detalle: s.detalle })),
    puntaje: aggregateScore(DIMS, pisos),
  };
};

describe('regresión del perfil genérico (política única de hoy)', () => {
  for (const [nombre, e] of Object.entries(escenarios)) {
    it(nombre, () => {
      expect(foto(e)).toMatchSnapshot();
    });
  }
});


import { RawExtraction } from '../../extraction/schemas';

// Balance realista en MILES de pesos, con números redondos para poder
// calcular cada ratio a mano. Los costos y gastos van en NEGATIVO, como los
// devuelve Gemini en los casos reales (y como se presentan en los EECC).
//
// Ventas elegidas para que los días den exactos:
//   actual:   365 / 14.600 = 1/40   y   365 / 7.300 = 1/20
//   anterior: 365 / 10.950 = 1/30   y   365 / 5.475 = 1/15

export const buildExtraction = (): RawExtraction => ({
  company_profile: {
    name: 'Distribuidora Ejemplo S.A.',
    cuit: '30-12345678-9',
    activity: 'Venta al por mayor de artículos de iluminación',
    anio_actual: '2025',
    anio_anterior: '2024',
  },
  ejercicio_actual: {
    estado_situacion_patrimonial: {
      activo_corriente: {
        total: 5000,
        detalles: [
          { rubro: 'Caja y Bancos', monto: 500 },
          { rubro: 'Créditos por Ventas', monto: 2000 },
          { rubro: 'Otros Créditos', monto: 300 },
          { rubro: 'Bienes de Cambio', monto: 2200 },
        ],
      },
      activo_no_corriente: {
        total: 3000,
        detalles: [{ rubro: 'Bienes de Uso', monto: 3000 }],
      },
      total_activo: 8000,
      pasivo_corriente: {
        total: 2500,
        detalles: [
          { rubro: 'Deudas Comerciales', monto: 1500 },
          { rubro: 'Deudas Bancarias y Financieras', monto: 600 },
          { rubro: 'Remuneraciones y Cargas Sociales', monto: 200 },
          { rubro: 'Cargas Fiscales', monto: 200 },
        ],
      },
      pasivo_no_corriente: {
        total: 1500,
        detalles: [{ rubro: 'Deudas Bancarias y Financieras', monto: 1500 }],
      },
      total_pasivo: 4000,
      patrimonio_neto: 4000,
      bienes_de_cambio: 2200,
    },
    estado_resultados: {
      ventas_netas: 14600,
      costo_ventas: -7300,
      resultado_bruto: 7300,
      resultado_valuacion_bienes_de_cambio: null,
      gastos_administracion: -2000,
      gastos_comercializacion: -2300,
      resultado_inversiones_permanentes: null,
      resultado_ordinario: 3000,
      gastos_financieros: -500,
      resultado_financiero_y_tenencia: -600,
      resultado_neto: 1460,
    },
    flujo_efectivo: {
      depreciacion_bienes_de_uso: 400,
      flujo_neto_operativo: 1800,
    },
  },
  ejercicio_anterior: {
    estado_situacion_patrimonial: {
      activo_corriente: {
        total: 4000,
        detalles: [
          { rubro: 'Caja y Bancos', monto: 400 },
          { rubro: 'Créditos por Ventas', monto: 1600 },
          { rubro: 'Bienes de Cambio', monto: 2000 },
        ],
      },
      activo_no_corriente: {
        total: 2000,
        detalles: [{ rubro: 'Bienes de Uso', monto: 2000 }],
      },
      total_activo: 6000,
      pasivo_corriente: {
        total: 2500,
        detalles: [
          { rubro: 'Deudas Comerciales', monto: 1250 },
          { rubro: 'Deudas Bancarias y Financieras', monto: 750 },
          { rubro: 'Cargas Fiscales', monto: 500 },
        ],
      },
      pasivo_no_corriente: {
        total: 1000,
        detalles: [{ rubro: 'Deudas Bancarias y Financieras', monto: 1000 }],
      },
      total_pasivo: 3500,
      patrimonio_neto: 2500,
      bienes_de_cambio: 2000,
    },
    estado_resultados: {
      ventas_netas: 10950,
      costo_ventas: -5475,
      resultado_bruto: 5475,
      resultado_valuacion_bienes_de_cambio: null,
      gastos_administracion: -1500,
      gastos_comercializacion: -2000,
      resultado_inversiones_permanentes: null,
      resultado_ordinario: 1975,
      gastos_financieros: -400,
      resultado_financiero_y_tenencia: -500,
      resultado_neto: 1000,
    },
    flujo_efectivo: {
      depreciacion_bienes_de_uso: 300,
      flujo_neto_operativo: 900,
    },
  },
  deuda_bancaria_actual: {
    corriente: { total: 600, items: [{ rubro: 'Préstamos bancarios', monto: 600 }] },
    no_corriente: { total: 1500, items: [{ rubro: 'Préstamos bancarios', monto: 1500 }] },
  },
  deuda_bancaria_anterior: {
    corriente: { total: 750, items: [{ rubro: 'Préstamos bancarios', monto: 750 }] },
    no_corriente: { total: 1000, items: [{ rubro: 'Préstamos bancarios', monto: 1000 }] },
  },
  analisis_post_cierre: null,
  extraccion_nosis: {
    score_crediticio: 750,
    situacion_bcra_peor_estado: 1,
    cheques_rechazados_cantidad: 0,
    cheques_rechazados_monto: 0,
    deuda_financiera_total_nosis: 2000,
    detalle_entidades: [{ entidad: 'Banco Ejemplo', situacion: 1, monto: 2000 }],
  },
  accionistas_y_directorio: null,
});

type Mutator = (e: RawExtraction) => void;

// Copia del fixture con modificaciones puntuales para casos borde.
export const extractionWith = (mutate: Mutator): RawExtraction => {
  const e = buildExtraction();
  mutate(e);
  return e;
};

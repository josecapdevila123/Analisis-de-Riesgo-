import type { TipoDocumentoSectorial } from '../../features/sectorDocs/tipos';

// Prompts de extracción para el bloque financiero de los EECC y para los
// documentos sectoriales. Misma regla que extraction.ts: solo datos crudos.

const REGLAS_BASE = `
===========================================================
PROHIBICIONES ABSOLUTAS (violarlas anula la respuesta)
===========================================================
- PROHIBIDO calcular, inferir o estimar ratios o indicadores (mora, cobertura, liquidez, rentabilidad, etc.). Los calcula el sistema.
- PROHIBIDO inventar valores. Si un dato no figura, devolvé \`null\`. No uses 0 para "no informado".
- PROHIBIDO texto narrativo, opiniones o evaluaciones. Solo el JSON pedido, sin claves extra.
- Escala: montos en MILES de pesos (dividí por 1.000 si el documento está en pesos). Fechas en formato AAAA-MM-DD.
`;

export const FINANCIAL_BLOCK_PROMPT = `
Sos un extractor estructurado. El documento adjunto es el balance (estados contables) de una ENTIDAD FINANCIERA NO BANCARIA (consumo, prendarios, factoring, leasing o préstamos a empresas). Extraé SOLO el bloque financiero, como números crudos.
${REGLAS_BASE}
===========================================================
CAMPOS
===========================================================
- \`fecha_cierre\`: fecha de cierre del ejercicio.
- \`cartera_total\`: préstamos y créditos financieros (la cartera), BRUTOS de previsiones, del ejercicio actual. Corriente + no corriente.
- \`cartera_total_anterior\`: lo mismo, del ejercicio comparativo (null si no hay).
- \`cartera_vencida_por_tramo\`: la apertura de créditos por plazo de la RT 9 (de plazo vencido). Una entrada por tramo: \`{ tramo, desde_dias, hasta_dias, monto }\`, con el texto del tramo tal como figura y los días en números (ej. "hasta 3 meses" → desde_dias 0, hasta_dias 90; "de 3 a 6 meses" → 90, 180; "más de 1 año" → 365, null). Solo los tramos de plazo VENCIDO, no los "a vencer".
- \`previsiones_incobrabilidad\`: saldo de la previsión por incobrabilidad (anexo de previsiones), en positivo.
- \`cargo_incobrabilidad\`: cargo del ejercicio por incobrabilidad (en positivo).
- \`ingresos_financieros\`: intereses y otros ingresos financieros del ejercicio (en positivo).
- \`egresos_financieros\`: intereses y costos del fondeo del ejercicio (en positivo).
- \`creditos_a_vencer_90_dias\`: créditos a vencer dentro de los próximos 3 meses (de la apertura por plazo).
- \`pasivos_a_vencer_90_dias\`: deudas a vencer dentro de los próximos 3 meses (de la apertura por plazo de las deudas).
- \`inversiones_corrientes\`: inversiones corrientes (null si no tiene).
- \`fondeo\`: fuentes de fondeo del pasivo, una entrada por fuente: \`{ fuente, monto }\` con fuente en "bancos" | "obligaciones_negociables" | "fideicomisos_financieros" | "accionistas_vinculadas" | "otros".

===========================================================
ESTRUCTURA JSON DE SALIDA
===========================================================
{
  "fecha_cierre": "2025-12-31",
  "cartera_total": 850,
  "cartera_total_anterior": 800,
  "cartera_vencida_por_tramo": [
    { "tramo": "hasta 3 meses", "desde_dias": 0, "hasta_dias": 90, "monto": 40 },
    { "tramo": "de 3 a 6 meses", "desde_dias": 90, "hasta_dias": 180, "monto": 20 }
  ],
  "previsiones_incobrabilidad": 37,
  "cargo_incobrabilidad": 20,
  "ingresos_financieros": 300,
  "egresos_financieros": 100,
  "creditos_a_vencer_90_dias": 400,
  "pasivos_a_vencer_90_dias": 350,
  "inversiones_corrientes": null,
  "fondeo": [{ "fuente": "bancos", "monto": 450 }]
}
`;

const REPORTE_MORA_PROMPT = `
Sos un extractor estructurado. El documento adjunto es un REPORTE DE MORA de una entidad financiera (información declarada por la empresa, puede venir en PDF o como planilla convertida a texto). Extraé los datos crudos.
${REGLAS_BASE}
===========================================================
CAMPOS
===========================================================
- \`fecha_corte\`: fecha a la que corresponde el reporte.
- \`tramos\`: cartera por días de atraso, una entrada por tramo con \`tramo\` en: "al_dia" | "1-30" | "31-90" | "91-180" | "181-365" | "+365". Si el reporte usa otros cortes, asigná cada monto al tramo que lo contiene; si un tramo del reporte cruza dos de estos (ej. "61 a 120 días"), no lo partas: asignalo al tramo donde empieza y no inventes la apertura.
- \`previsiones\`: previsiones constituidas sobre la cartera, si el reporte las informa (si no, null).
- \`por_producto\`: si el reporte abre por producto (personales, prendarios, tarjetas…), una entrada \`{ producto, cartera, mora_90 }\` con la cartera total y la cartera con más de 90 días de atraso del producto. Si no abre por producto, null.

===========================================================
ESTRUCTURA JSON DE SALIDA
===========================================================
{
  "fecha_corte": "2026-03-31",
  "tramos": [
    { "tramo": "al_dia", "monto": 800 },
    { "tramo": "1-30", "monto": 30 },
    { "tramo": "91-180", "monto": 20 }
  ],
  "previsiones": 45,
  "por_producto": null
}
`;

export const SECTOR_DOC_PROMPTS: Record<TipoDocumentoSectorial, string> = {
  reporte_mora: REPORTE_MORA_PROMPT,
};

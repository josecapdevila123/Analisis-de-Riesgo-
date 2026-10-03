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

const DECLARADO = 'El documento es información DECLARADA por el cliente (no auditada). Puede venir en PDF, imagen o como planilla convertida a texto.';

const PLAN_SIEMBRA_PROMPT = `
Sos un extractor estructurado. El documento adjunto es un PLAN DE SIEMBRA / DETALLE DE HECTÁREAS de una empresa agropecuaria. ${DECLARADO}
${REGLAS_BASE}
- PROHIBIDO sumar hectáreas, calcular porcentajes o concentraciones: devolvé cada lote tal como figura.

CAMPOS
- \`fecha_documento\`: fecha del documento si figura (si no, null).
- \`campania\`: campaña a la que corresponde (ej. "2025/26").
- \`lotes\`: una entrada por lote o renglón: \`{ cultivo, hectareas, tenencia, zona, rinde_esperado }\`. \`tenencia\` en "propia" | "arrendada" | "aparceria" | "otra" (si no se aclara, "otra"). \`rinde_esperado\` en quintales por hectárea (null si no figura).
- \`costo_arrendamiento\`: \`{ texto, monto }\` con lo que diga el documento (ej. "12 qq/ha soja" o "USD 250/ha") y el monto en miles de pesos si está expresado en pesos; si no, monto null. Sin dato: null.

ESTRUCTURA JSON DE SALIDA
{
  "fecha_documento": null,
  "campania": "2025/26",
  "lotes": [{ "cultivo": "Soja", "hectareas": 600, "tenencia": "arrendada", "zona": "Pergamino", "rinde_esperado": 35 }],
  "costo_arrendamiento": { "texto": "12 qq/ha de soja", "monto": null }
}
`;

const LISTADO_OBRAS_PROMPT = `
Sos un extractor estructurado. El documento adjunto es un LISTADO DE OBRAS / LICITACIONES de una constructora. ${DECLARADO}
${REGLAS_BASE}
- PROHIBIDO calcular saldos, sumas o concentraciones. Si el documento no informa el saldo a ejecutar, devolvé null (no lo calcules).

CAMPOS
- \`fecha_documento\`: fecha del listado si figura.
- \`obras\`: una entrada por obra o licitación: \`{ obra, comitente, tipo_comitente, monto_contrato, porcentaje_avance, saldo_a_ejecutar, estado, plazo_fin }\`.
  - \`tipo_comitente\`: "publico" (Estado nacional, provincial, municipal, empresas y entes estatales) | "privado". Si no se puede saber, null.
  - \`porcentaje_avance\`: número de 0 a 100 (null si no figura).
  - \`estado\`: "en_ejecucion" | "adjudicada" | "presentada" (licitación presentada, no adjudicada) | "finalizada". Si no se puede saber, null.
  - Montos en miles de pesos.

ESTRUCTURA JSON DE SALIDA
{
  "fecha_documento": "2026-03-31",
  "obras": [{ "obra": "Ruta 5 tramo II", "comitente": "Vialidad Provincial", "tipo_comitente": "publico", "monto_contrato": 3000, "porcentaje_avance": 40, "saldo_a_ejecutar": 1800, "estado": "en_ejecucion", "plazo_fin": "2027-06" }]
}
`;

const PRINCIPALES_CLIENTES_PROMPT = `
Sos un extractor estructurado. El documento adjunto lista los PRINCIPALES CLIENTES (o deudores, en una financiera) de la empresa. ${DECLARADO}
${REGLAS_BASE}
- PROHIBIDO calcular participaciones que el documento no informe: si solo hay montos, \`porcentaje_ventas\` va en null.

CAMPOS
- \`fecha_documento\`: fecha o período del listado si figura.
- \`clientes\`: una entrada por cliente, en el orden del documento: \`{ cliente, porcentaje_ventas, monto }\`. \`porcentaje_ventas\` de 0 a 100 tal como figura; \`monto\` en miles de pesos.

ESTRUCTURA JSON DE SALIDA
{ "fecha_documento": null, "clientes": [{ "cliente": "Supermercados XX", "porcentaje_ventas": 30, "monto": 4500 }] }
`;

const CARTERA_CONTRATOS_PROMPT = `
Sos un extractor estructurado. El documento adjunto es una CARTERA DE PEDIDOS / CONTRATOS de la empresa. ${DECLARADO}
${REGLAS_BASE}

CAMPOS
- \`fecha_documento\`: fecha del documento si figura.
- \`contratos\`: una entrada por contrato o pedido: \`{ cliente, objeto, monto, vigencia_hasta, recurrente }\`. \`monto\` en miles de pesos (el monto total pendiente del contrato). \`recurrente\`: true si es un abono / servicio periódico, false si es una venta única, null si no se puede saber.

ESTRUCTURA JSON DE SALIDA
{ "fecha_documento": null, "contratos": [{ "cliente": "YPF", "objeto": "Mantenimiento de planta", "monto": 1200, "vigencia_hasta": "2027-12", "recurrente": true }] }
`;

const OTRO_PROMPT = `
Sos un extractor estructurado. El documento adjunto es un documento del cliente (flujo proyectado, informe de gestión, prospecto de ON, nota de la empresa u otro). ${DECLARADO}
${REGLAS_BASE}
- PROHIBIDO calificar los hechos como buenos, malos, riesgosos o favorables. Solo extraés hechos verificables con su cita.

CAMPOS
- \`fecha_documento\`: fecha del documento si figura.
- \`descripcion_documento\`: qué tipo de documento es, en pocas palabras (ej. "Prospecto de ON Clase 3").
- \`hechos\`: los hechos concretos relevantes para un análisis de crédito (montos, clientes, contratos, deuda, fondeo, garantías, contingencias, cambios operativos o societarios). Una entrada por hecho: \`{ categoria, descripcion, monto, fecha, cita_textual, pagina }\`.
  - \`categoria\`: "ingresos" | "clientes" | "contratos" | "deuda" | "fondeo" | "garantias" | "contingencias" | "operativo" | "societario" | "otro".
  - \`descripcion\`: el hecho en una oración neutra, sin adjetivos de valoración.
  - \`cita_textual\`: el fragmento del documento del que sale, copiado literal.
  - \`monto\` en miles de pesos (null si no hay); \`pagina\` si se puede saber.
  - Como máximo 20 hechos.

ESTRUCTURA JSON DE SALIDA
{ "fecha_documento": null, "descripcion_documento": "Nota de la empresa", "hechos": [{ "categoria": "contratos", "descripcion": "Firmó un contrato de provisión por 24 meses con Toyota Argentina.", "monto": 900, "fecha": "2026-02", "cita_textual": "…hemos suscripto un contrato de provisión por 24 meses…", "pagina": 2 }] }
`;

export const SECTOR_DOC_PROMPTS: Record<TipoDocumentoSectorial, string> = {
  reporte_mora: REPORTE_MORA_PROMPT,
  plan_siembra: PLAN_SIEMBRA_PROMPT,
  listado_obras: LISTADO_OBRAS_PROMPT,
  principales_clientes: PRINCIPALES_CLIENTES_PROMPT,
  cartera_contratos: CARTERA_CONTRATOS_PROMPT,
  otro: OTRO_PROMPT,
};

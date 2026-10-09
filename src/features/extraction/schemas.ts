import { z } from 'zod';

// Coerce numbers in case Gemini emits strings ("1500" → 1500).
const num = z.coerce.number();

// Lenient nullable number: tolera el chorro de variantes que un LLM puede mandar
// para "este dato no está": null, undefined, "", "N/A", "n/a", "—", NaN, etc.
// Cualquiera de esos → null. Strings numéricas válidas se coercen al número.
const lenientNum = z.preprocess((v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '' || /^(n\/?a|nd|—|-|null)$/i.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }
  return null;
}, z.number().nullable());

const nullableNum = lenientNum;

// Lenient string: null/undefined/"" → 'N/A' para campos donde queremos algo legible.
const lenientStringNA = z.preprocess((v) => {
  if (v === null || v === undefined) return 'N/A';
  if (typeof v === 'string' && v.trim() === '') return 'N/A';
  return v;
}, z.string());

const Detalle = z.object({
  rubro: z.string(),
  monto: num,
});

const GrupoConDetalles = z.object({
  total: num,
  detalles: z.array(Detalle).default([]),
});

const EstadoSituacionEjercicio = z.object({
  activo_corriente: GrupoConDetalles,
  activo_no_corriente: GrupoConDetalles,
  total_activo: num,
  pasivo_corriente: GrupoConDetalles,
  pasivo_no_corriente: GrupoConDetalles,
  total_pasivo: num,
  patrimonio_neto: num,
  bienes_de_cambio: nullableNum,
});

const EstadoResultadosEjercicio = z.object({
  ventas_netas: num,
  costo_ventas: num,
  resultado_bruto: num,
  resultado_valuacion_bienes_de_cambio: nullableNum,
  gastos_administracion: num,
  gastos_comercializacion: num,
  resultado_inversiones_permanentes: nullableNum,
  resultado_ordinario: num,
  gastos_financieros: nullableNum,
  resultado_financiero_y_tenencia: nullableNum,
  // Opcionales (agregados después): los casos viejos no los tienen.
  recpam: nullableNum.optional(),
  impuesto_ganancias: nullableNum.optional(),
  resultado_neto: num,
});

const FlujoEfectivoEjercicio = z.object({
  depreciacion_bienes_de_uso: nullableNum,
  flujo_neto_operativo: nullableNum,
  // Pagos por compras de bienes de uso (capex total). Opcional.
  pagos_bienes_de_uso: nullableNum.optional(),
});

const EstadosContablesEjercicio = z.object({
  estado_situacion_patrimonial: EstadoSituacionEjercicio,
  estado_resultados: EstadoResultadosEjercicio,
  flujo_efectivo: FlujoEfectivoEjercicio,
});

const DeudaBancariaItem = z.object({
  rubro: z.string(),
  monto: num,
});

const DeudaBancariaGrupo = z.object({
  total: num,
  items: z.array(DeudaBancariaItem).default([]),
});

const DeudaBancariaEjercicio = z.object({
  corriente: DeudaBancariaGrupo,
  no_corriente: DeudaBancariaGrupo,
});

// Si el modelo no encuentra un dato de la empresa (null), queda vacío: la vista
// y el PDF ya muestran "No especificada" / "N/D", y el caso no se corta.
const textoVacio = z.preprocess(v => (v === null || v === undefined ? '' : v), z.string());

const CompanyProfile = z.object({
  name: textoVacio,
  cuit: textoVacio,
  activity: textoVacio,
  anio_actual: textoVacio,
  anio_anterior: textoVacio,
});

const VentaMensual = z.object({
  mes: z.string(),
  monto: num,
  monto_anio_anterior: nullableNum,
  moneda: z.enum(['ARS', 'USD']).optional().default('ARS'),
  // Ventas físicas en la unidad de \`unidad_medida\` (toneladas, clientes, litros…).
  // Opcionales: los casos viejos no las tienen.
  cantidad: lenientNum.optional(),
  cantidad_anio_anterior: lenientNum.optional(),
});

const DeudaPostBalance = z.object({
  entidad: z.string(),
  monto: num,
 moneda: z.enum(['ARS', 'USD']).optional().default('ARS'),
});

const PeriodoAnalizado = z.object({
  fecha_inicio: z.string(),
  fecha_fin: z.string(),
});

const AnalisisPostCierre = z.object({
periodo_analizado: PeriodoAnalizado.optional().nullable(),
  detalle_ventas_mensuales: z.array(VentaMensual).default([]),
  total_ventas_post_cierre: lenientNum,
  notas_relevantes: z.string().optional().nullable(),
  // Unidad física en que la empresa mide sus ventas, si el documento la informa.
  unidad_medida: z.string().nullable().catch(null).optional(),
  deuda_bancaria_post_balance_detalle: z.array(DeudaPostBalance).default([]),
}).nullable();

const NosisEntidad = z.object({
  entidad: lenientStringNA,
  situacion: lenientNum,
  monto: lenientNum,
});

// Evolución mensual de la deuda en el sistema financiero (Central de Deudores,
// típicamente 24 meses): una fila por entidad y por mes.
const NosisEvolucion = z.object({
  periodo: lenientStringNA,   // "AAAA-MM"
  entidad: lenientStringNA,
  monto: lenientNum,          // miles de pesos corrientes de ese mes
  situacion: lenientNum,
});

const ExtraccionNosis = z.object({
  score_crediticio: lenientNum,
  situacion_bcra_peor_estado: lenientNum,
  cheques_rechazados_cantidad: lenientNum,
  cheques_rechazados_monto: lenientNum,
  deuda_financiera_total_nosis: lenientNum,
  detalle_entidades: z.array(NosisEntidad).default([]),
  // Opcionales (agregados después): los casos viejos no los tienen.
  peor_situacion_24_meses: lenientNum.optional(),
  cheques_rechazados_levantados: lenientNum.optional(),
  deuda_fiscal_previsional: lenientNum.optional(),
  planes_de_pago_arca: z.boolean().nullable().catch(null).optional(),
  juicios_cantidad: lenientNum.optional(),
  embargos_cantidad: lenientNum.optional(),
  pedidos_quiebra_cantidad: lenientNum.optional(),
  evolucion_deuda: z.preprocess(v => v ?? [], z.array(NosisEvolucion)).optional(),
}).nullable();

const InformacionComplementaria = z.object({
  // RT 6: estados en moneda homogénea. Si es true, el comparativo está reexpresado.
  balance_ajustado_por_inflacion: z.boolean().nullable().catch(null),
  opinion_auditor: z.enum(['favorable', 'con_salvedades', 'adversa', 'abstencion']).nullable().catch(null),
  detalle_opinion_auditor: z.string().nullable().catch(null),
  // En miles de pesos al tipo de cambio de cierre.
  deuda_financiera_moneda_extranjera: lenientNum,
  porcentaje_ventas_exportacion: lenientNum,
}).nullable();

export type Accionista = {
  nombre: string;
  dni_cuit: string;
  participacion: number | null;
  subAccionistas?: Accionista[];
};

const AccionistaSchema: z.ZodType<Accionista> = z.lazy(() =>
  z.object({
    nombre: lenientStringNA,
    dni_cuit: lenientStringNA,
    participacion: lenientNum,
    subAccionistas: z.array(AccionistaSchema).optional().nullable(),
  })
) as z.ZodType<Accionista>;

const MiembroDirectorio = z.object({
  cargo: z.string().optional().nullable().default(''),
  nombre: z.string().optional().nullable().default(''),
});

const AccionistasYDirectorio = z.object({
  accionistas: z.preprocess(v => v ?? [], z.array(AccionistaSchema)),
  directorio: z.preprocess(v => v ?? [], z.array(MiembroDirectorio)),
}).nullable();

// Bloque financiero de los EECC (financieras no bancarias). Opcional: se
// extrae a demanda cuando el analista confirma el rubro "Financiera".
// Montos en miles de pesos; solo datos crudos, nada calculado.
const TramoCarteraVencida = z.object({
  tramo: lenientStringNA,            // texto tal como figura ("de 3 a 6 meses")
  desde_dias: lenientNum,            // 0, 90, 180, 270, 365…
  hasta_dias: lenientNum,            // null = sin tope ("más de 1 año")
  monto: lenientNum,
});

export const FUENTES_FONDEO = ['bancos', 'obligaciones_negociables', 'fideicomisos_financieros', 'accionistas_vinculadas', 'otros'] as const;
const FuenteFondeo = z.object({
  fuente: z.enum(FUENTES_FONDEO).catch('otros'),
  monto: lenientNum,
});

export const ExtraccionFinancieraSchema = z.object({
  fecha_cierre: z.string().nullable().catch(null).optional(),
  cartera_total: lenientNum,            // préstamos y créditos financieros, brutos de previsiones
  cartera_total_anterior: lenientNum,   // del comparativo
  cartera_vencida_por_tramo: z.preprocess(v => v ?? [], z.array(TramoCarteraVencida)),
  previsiones_incobrabilidad: lenientNum,
  cargo_incobrabilidad: lenientNum,
  ingresos_financieros: lenientNum,
  egresos_financieros: lenientNum,
  creditos_a_vencer_90_dias: lenientNum,
  pasivos_a_vencer_90_dias: lenientNum,
  inversiones_corrientes: lenientNum,
  fondeo: z.preprocess(v => v ?? [], z.array(FuenteFondeo)),
  // Carga manual del analista (no sale del balance).
  top10_deudores_monto: lenientNum.optional(),
}).nullable();
export type ExtraccionFinanciera = NonNullable<z.infer<typeof ExtraccionFinancieraSchema>>;

export const RawExtractionSchema = z.object({
  company_profile: CompanyProfile,
  ejercicio_actual: EstadosContablesEjercicio,
  ejercicio_anterior: EstadosContablesEjercicio.nullable(),
  deuda_bancaria_actual: DeudaBancariaEjercicio,
  deuda_bancaria_anterior: DeudaBancariaEjercicio.nullable(),
  analisis_post_cierre: AnalisisPostCierre,
  extraccion_nosis: ExtraccionNosis,
  // Opcional: los casos viejos y las empresas no financieras no lo tienen.
  extraccion_financiera: ExtraccionFinancieraSchema.optional(),
  // Anexo de bienes de uso del ejercicio actual (terrenos, inmuebles, campos…).
  // Opcional: los casos viejos no lo tienen. Sirve para cruzar campo propio declarado.
  anexo_bienes_de_uso: z.preprocess(v => (Array.isArray(v) ? v : null), z.array(z.object({
    rubro: z.string().catch(''),
    valor_residual: lenientNum,
  })).nullable()).optional(),
  accionistas_y_directorio: z.union([AccionistasYDirectorio, 
  z.array(z.any()).transform(() => null)]).nullable(),
  informacion_complementaria: InformacionComplementaria.optional(),
});

export type RawExtraction = z.infer<typeof RawExtractionSchema>;

const AlertaCoherencia = z.object({
  tipo: z.string(),
  campo: z.string(),
  mensaje: z.string(),
  severidad: z.enum(['warning', 'error']),
});

const InconsistenciaExplicada = z.object({
  campo: z.string(),
  explicacion: z.string(),
});

export const VerificationResultSchema = z.object({
  alertas_coherencia: z.array(AlertaCoherencia).default([]),
  inconsistencias_explicadas: z.array(InconsistenciaExplicada).default([]),
  executive_summary: z.string(),
  informe_markdown: z.string(),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const MarketAnalysisResultSchema = z.object({
  analisis_mercado: z.string(),
});

export type MarketAnalysisResult = z.infer<typeof MarketAnalysisResultSchema>;
// Texto tolerante: null/undefined → '' (el modelo a veces manda null en campos vacíos).
const lenientString = z.preprocess(v => (v === null || v === undefined ? '' : v), z.string());

export const CompanyHistorySchema = z.object({
  memoria_disponible: z.boolean().catch(false),
  core_business: lenientString,
  historia: lenientString,
  datos_relevantes: z.preprocess(v => v ?? [], z.array(z.string())),
  proyecciones: z.preprocess(v => v ?? [], z.array(z.string())),
  explicaciones_balance: z.preprocess(
    v => v ?? [],
    z.array(z.object({ tema: lenientString, explicacion: lenientString }))
  ),
});

export type CompanyHistory = z.infer<typeof CompanyHistorySchema>;

// ---------- Opinión de riesgo ----------

export const RISK_DIMENSIONS = [
  'nosis_bcra',
  'endeudamiento',
  'liquidez_solvencia',
  'rentabilidad',
  'ventas_post_balance',
  'negocio_mercado',
  'calidad_informacion',
  // Solo pesa en el perfil Financiera (peso 0 en los demás).
  'calidad_cartera',
] as const;
export type RiskDimension = (typeof RISK_DIMENSIONS)[number];

export const SEVERIDADES = ['baja', 'media', 'alta', 'critica'] as const;
export type SeveridadRiesgo = (typeof SEVERIDADES)[number];

const stringArray = z.preprocess(
  v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim() !== '') : []),
  z.array(z.string())
);

const isKnownDimension = (d: unknown): boolean =>
  typeof d === 'object' && d !== null && RISK_DIMENSIONS.includes((d as { dimension?: never }).dimension as RiskDimension);

// Puntaje del modelo por dimensión: 1 (riesgo mínimo) a 100 (máximo); null si no hay datos.
const dimensionScore = z.preprocess(v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(1, Math.round(n))) : null;
}, z.number().nullable());

export const RiskOpinionSchema = z.object({
  postura: z.enum(['favorable', 'favorable_con_condiciones', 'desfavorable']).nullable().catch(null),
  dictamen: lenientString,
  lectura_integral: lenientString,
  dimensiones: z.preprocess(
    v => (Array.isArray(v) ? v.filter(isKnownDimension) : []),
    z.array(z.object({
      dimension: z.enum(RISK_DIMENSIONS),
      puntaje: dimensionScore,
      comentario: lenientString,
    }))
  ),
  riesgos: z.preprocess(
    v => v ?? [],
    z.array(z.object({
      titulo: lenientString,
      severidad: z.enum(SEVERIDADES).catch('media'),
      dimension: z.enum(RISK_DIMENSIONS).nullable().catch(null),
      evidencia: lenientString,
      mitigante: lenientString,
    }))
  ),
  fortalezas: stringArray,
  condiciones_sugeridas: stringArray,
  informacion_faltante: stringArray,
});

export type RiskOpinion = z.infer<typeof RiskOpinionSchema>;

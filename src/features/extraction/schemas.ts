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
  resultado_neto: num,
});

const FlujoEfectivoEjercicio = z.object({
  depreciacion_bienes_de_uso: nullableNum,
  flujo_neto_operativo: nullableNum,
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

const CompanyProfile = z.object({
  name: z.string(),
  cuit: z.string(),
  activity: z.string(),
  anio_actual: z.string(),
  anio_anterior: z.string(),
});

const VentaMensual = z.object({
  mes: z.string(),
  monto: num,
  monto_anio_anterior: nullableNum,
  moneda: z.string(),
});

const DeudaPostBalance = z.object({
  entidad: z.string(),
  monto: num,
  moneda: z.string(),
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
  deuda_bancaria_post_balance_detalle: z.array(DeudaPostBalance).default([]),
}).nullable();

const NosisEntidad = z.object({
  entidad: lenientStringNA,
  situacion: lenientNum,
  monto: lenientNum,
});

const ExtraccionNosis = z.object({
  score_crediticio: lenientNum,
  situacion_bcra_peor_estado: lenientNum,
  cheques_rechazados_cantidad: lenientNum,
  cheques_rechazados_monto: lenientNum,
  deuda_financiera_total_nosis: lenientNum,
  detalle_entidades: z.array(NosisEntidad).default([]),
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
  accionistas: z.array(AccionistaSchema).default([]),
  directorio: z.array(MiembroDirectorio).default([]),
}).nullable();

export const RawExtractionSchema = z.object({
  company_profile: CompanyProfile,
  ejercicio_actual: EstadosContablesEjercicio,
  ejercicio_anterior: EstadosContablesEjercicio.nullable(),
  deuda_bancaria_actual: DeudaBancariaEjercicio,
  deuda_bancaria_anterior: DeudaBancariaEjercicio.nullable(),
  analisis_post_cierre: AnalisisPostCierre,
  extraccion_nosis: ExtraccionNosis,
  accionistas_y_directorio: z.union([AccionistasYDirectorio, 
  z.array(z.any()).transform(() => null)]).nullable(),
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
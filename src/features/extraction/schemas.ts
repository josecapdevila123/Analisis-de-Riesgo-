import { z } from 'zod';

// Coerce numbers in case Gemini emits strings ("1500" → 1500).
const num = z.coerce.number();
const nullableNum = z.coerce.number().nullable();

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
  periodo_analizado: PeriodoAnalizado.nullable(),
  detalle_ventas_mensuales: z.array(VentaMensual).default([]),
  total_ventas_post_cierre: num,
  notas_relevantes: z.string().nullable(),
  deuda_bancaria_post_balance_detalle: z.array(DeudaPostBalance).default([]),
}).nullable();

const NosisEntidad = z.object({
  entidad: z.string(),
  situacion: num,
  monto: num,
});

const ExtraccionNosis = z.object({
  score_crediticio: num,
  situacion_bcra_peor_estado: num,
  cheques_rechazados_cantidad: num,
  cheques_rechazados_monto: num,
  deuda_financiera_total_nosis: num,
  detalle_entidades: z.array(NosisEntidad).default([]),
}).nullable();

export type Accionista = {
  nombre: string;
  dni_cuit: string;
  participacion: number;
  subAccionistas?: Accionista[];
};

const AccionistaSchema: z.ZodType<Accionista> = z.lazy(() =>
  z.object({
    nombre: z.string(),
    dni_cuit: z.string(),
    participacion: num,
    subAccionistas: z.array(AccionistaSchema).optional(),
  })
);

const MiembroDirectorio = z.object({
  cargo: z.string(),
  nombre: z.string(),
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
  accionistas_y_directorio: AccionistasYDirectorio,
});

export type RawExtraction = z.infer<typeof RawExtractionSchema>;

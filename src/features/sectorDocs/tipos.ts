import { z } from 'zod';

// Documentos sectoriales: información DECLARADA por el cliente, no auditada.
// Infraestructura genérica: cada tipo tiene su schema (tolerante) y su prompt
// (src/lib/prompts/sectorDocs.ts). Qué tipos admite cada rubro, y cuáles son
// recomendados, se define en la política (policy.ts).

const num = z.preprocess(v => {
  if (v === null || v === undefined || v === '' || v === 'N/A') return null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}, z.number().nullable());

// ---------- reporte_mora ----------
export const TRAMOS_MORA = ['al_dia', '1-30', '31-90', '91-180', '181-365', '+365'] as const;
export type TramoMora = (typeof TRAMOS_MORA)[number];
// Tramos con más de 90 días de atraso (cartera irregular).
export const TRAMOS_MAS_90: TramoMora[] = ['91-180', '181-365', '+365'];

export const ReporteMoraSchema = z.object({
  fecha_corte: z.string().nullable().catch(null),
  tramos: z.preprocess(v => v ?? [], z.array(z.object({
    tramo: z.enum(TRAMOS_MORA).catch('al_dia'),
    monto: num,
  }))),
  previsiones: num,
  por_producto: z.preprocess(v => (Array.isArray(v) ? v : null), z.array(z.object({
    producto: z.string().catch('Sin nombre'),
    cartera: num,
    mora_90: num,
  })).nullable()),
});
export type ReporteMora = z.infer<typeof ReporteMoraSchema>;

const texto = z.preprocess(v => (v === undefined || v === '' || v === 'N/A' ? null : v), z.string().nullable()).catch(null);
const bool = z.preprocess(v => (typeof v === 'boolean' ? v : v === 'si' || v === 'sí' || v === 'true' ? true : v === 'no' || v === 'false' ? false : null), z.boolean().nullable());
const lista = <T extends z.ZodTypeAny>(item: T) => z.preprocess(v => (Array.isArray(v) ? v : []), z.array(item));

// ---------- plan_siembra (agro) ----------
export const TENENCIAS = ['propia', 'arrendada', 'aparceria', 'otra'] as const;
export const PlanSiembraSchema = z.object({
  fecha_documento: texto,
  campania: texto,
  lotes: lista(z.object({
    cultivo: z.string().catch('Sin cultivo'),
    hectareas: num,
    tenencia: z.enum(TENENCIAS).catch('otra'),
    zona: texto,
    rinde_esperado: num, // qq/ha
  })),
  costo_arrendamiento: z.object({ texto, monto: num }).nullable().catch(null),
});
export type PlanSiembra = z.infer<typeof PlanSiembraSchema>;

// ---------- listado_obras (construcción) ----------
export const ESTADOS_OBRA = ['en_ejecucion', 'adjudicada', 'presentada', 'finalizada'] as const;
export const ListadoObrasSchema = z.object({
  fecha_documento: texto,
  obras: lista(z.object({
    obra: z.string().catch('Sin nombre'),
    comitente: z.string().catch('Sin comitente'),
    tipo_comitente: z.enum(['publico', 'privado']).nullable().catch(null),
    monto_contrato: num,
    porcentaje_avance: num, // 0–100
    saldo_a_ejecutar: num,
    estado: z.enum(ESTADOS_OBRA).nullable().catch(null),
    plazo_fin: texto,
  })),
});
export type ListadoObras = z.infer<typeof ListadoObrasSchema>;

// ---------- documento adicional (cualquier rubro) ----------
export const PrincipalesClientesSchema = z.object({
  fecha_documento: texto,
  clientes: lista(z.object({
    cliente: z.string().catch('Sin nombre'),
    porcentaje_ventas: num, // 0–100
    monto: num,
  })),
});
export type PrincipalesClientes = z.infer<typeof PrincipalesClientesSchema>;

export const CarteraContratosSchema = z.object({
  fecha_documento: texto,
  contratos: lista(z.object({
    cliente: z.string().catch('Sin nombre'),
    objeto: texto,
    monto: num,
    vigencia_hasta: texto,
    recurrente: bool,
  })),
});
export type CarteraContratos = z.infer<typeof CarteraContratosSchema>;

export const CATEGORIAS_HECHO = ['ingresos', 'clientes', 'contratos', 'deuda', 'fondeo', 'garantias', 'contingencias', 'operativo', 'societario', 'otro'] as const;
export const OtroDocumentoSchema = z.object({
  fecha_documento: texto,
  descripcion_documento: texto,
  hechos: lista(z.object({
    categoria: z.enum(CATEGORIAS_HECHO).catch('otro'),
    descripcion: z.string().catch(''),
    monto: num,
    fecha: texto,
    cita_textual: z.string().catch(''),
    pagina: num,
    // Lo marca el analista (no Gemini): solo los marcados llegan a la opinión.
    incluir: z.boolean().catch(false).default(false),
  })),
});
export type OtroDocumento = z.infer<typeof OtroDocumentoSchema>;

// ---------- registro de tipos ----------
export type TipoDocumentoSectorial = 'reporte_mora' | 'plan_siembra' | 'listado_obras' | 'principales_clientes' | 'cartera_contratos' | 'otro';

export const SCHEMAS_DOCUMENTOS: Record<TipoDocumentoSectorial, z.ZodTypeAny> = {
  reporte_mora: ReporteMoraSchema,
  plan_siembra: PlanSiembraSchema,
  listado_obras: ListadoObrasSchema,
  principales_clientes: PrincipalesClientesSchema,
  cartera_contratos: CarteraContratosSchema,
  otro: OtroDocumentoSchema,
};

export type ExtraccionDocumento = ReporteMora | PlanSiembra | ListadoObras | PrincipalesClientes | CarteraContratos | OtroDocumento;

// Fecha del documento según el tipo (corte del reporte o fecha declarada).
export const fechaDeExtraccion = (e: ExtraccionDocumento | null | undefined): string | null =>
  normalizarFecha((e as { fecha_corte?: string | null })?.fecha_corte ?? (e as { fecha_documento?: string | null })?.fecha_documento ?? null);

export type DocumentoSectorial = {
  id: string;
  tipo: TipoDocumentoSectorial;
  nombreArchivo: string;
  fechaDocumento: string | null;   // fecha de corte del documento (ISO AAAA-MM-DD si se pudo leer)
  cargadoPor: string | null;
  cargadoEn: string;               // ISO
  actualizadoEn: string;           // ISO: cambia al editar (para saber si la opinión quedó vieja)
  extraccion: ExtraccionDocumento | null;
  estado: 'procesando' | 'ok' | 'error';
  error?: string;
  editado: boolean;
};

export const MAX_DOCUMENTOS_POR_CASO = 3;
export const VIGENCIA_DOCUMENTO_MESES = 6;

// Fecha "AAAA-MM-DD", "DD/MM/AAAA" o "AAAA-MM" → ISO AAAA-MM-DD (o null).
export function normalizarFecha(f: string | null | undefined): string | null {
  if (!f) return null;
  const s = f.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] ?? '01').padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return null;
}

// ¿El documento tiene más de 6 meses respecto de la fecha del caso?
export function documentoDesactualizado(doc: Pick<DocumentoSectorial, 'fechaDocumento'>, fechaCaso: string): boolean {
  const f = normalizarFecha(doc.fechaDocumento);
  if (!f) return false;
  const d = new Date(f);
  const ref = new Date(fechaCaso);
  const limite = new Date(ref);
  limite.setMonth(limite.getMonth() - VIGENCIA_DOCUMENTO_MESES);
  return d < limite;
}

// Firma de los documentos considerados (para marcar la opinión desactualizada
// si después se carga, edita o borra alguno).
export const firmaDocumentos = (docs: DocumentoSectorial[] | null | undefined) =>
  (docs ?? []).filter(d => d.estado === 'ok').map(d => `${d.id}@${d.actualizadoEn}`).sort().join('|');

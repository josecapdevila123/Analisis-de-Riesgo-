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

// ---------- registro de tipos ----------
export type TipoDocumentoSectorial = 'reporte_mora';

export const SCHEMAS_DOCUMENTOS: Record<TipoDocumentoSectorial, z.ZodTypeAny> = {
  reporte_mora: ReporteMoraSchema,
};

export type ExtraccionDocumento = { reporte_mora: ReporteMora }[TipoDocumentoSectorial];

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

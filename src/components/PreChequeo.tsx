import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FileUp, Loader2, Pencil, Trash2, XCircle } from 'lucide-react';
import { AddRowButton, EditableNumber, EditableSelect, EditableText, EditProvider, Path, RemoveRowButton, setIn } from '../features/editing/editing';
import { Prechequeo } from '../features/risk/prechequeo';
import { DocumentoSectorial, documentoDesactualizado, ExtraccionDocumento, MAX_DOCUMENTOS_POR_CASO, ReporteMora, TRAMOS_MORA } from '../features/sectorDocs/tipos';
import { TipoDocumento } from '../features/risk/policy';
import { RatioStatus } from '../features/ratios/calculations';
import { RatioKind } from '../features/ratios/blocks';
import { StatusBadge, Status } from './riskColors';

// Pre-chequeo antes de generar la opinión (todos los rubros). No bloquea nada:
// muestra qué hay, qué falta y qué no cierra. Desde acá se cargan los
// documentos del rubro y se extrae el bloque financiero (financieras).

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.xlsx,.xls,.xlsm,.csv';
const SEMAFORO: Record<RatioStatus, { status: Status; label: string }> = {
  healthy: { status: 'good', label: 'Sano' },
  alert: { status: 'warning', label: 'Alerta' },
  critical: { status: 'critical', label: 'Crítico' },
};
const fmtKpi = (v: number | null, kind: RatioKind) =>
  v === null ? '—'
    : kind === 'pct' ? `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
    : kind === 'monto' ? `$ ${Math.round(v).toLocaleString('es-AR')}`
    : kind === 'dias' ? `${Math.round(v)} d`
    : `${v.toLocaleString('es-AR', { maximumFractionDigits: 2 })}x`;

type Props = {
  prechequeo: Prechequeo;
  documentos: DocumentoSectorial[];
  fechaCaso: string;
  extrayendoBloque: boolean;
  onCargarDocumento: (tipo: TipoDocumento, file: File) => void;
  onEditarDocumento: (id: string, extraccion: ExtraccionDocumento) => void;
  onBorrarDocumento: (id: string) => void;
  onExtraerBloque: (files: File[]) => void;
};

export function PreChequeo(p: Props) {
  const [abierto, setAbierto] = useState(true);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const balanceInput = useRef<HTMLInputElement | null>(null);
  const lleno = p.documentos.length >= MAX_DOCUMENTOS_POR_CASO;
  const pc = p.prechequeo;

  return (
    <section className="bg-white border border-ink/15 print:hidden">
      <button onClick={() => setAbierto(a => !a)} className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left">
        <span>
          <span className="font-display text-base font-semibold">Pre-chequeo antes de la opinión</span>
          <span className="block text-xs text-ink/50">Lo que falta no bloquea la opinión: se informa como información faltante.</span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="px-5 pb-5 grid grid-cols-1 @4xl:grid-cols-2 gap-x-8 gap-y-5 border-t border-ink/10 pt-4">
          {/* Documentación base */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">Documentación base</p>
            <ul className="space-y-1.5 text-sm">
              {pc.base.map(i => (
                <li key={i.id} className="flex items-center gap-2">
                  {i.ok ? <CheckCircle2 className="w-4 h-4 text-ink shrink-0" /> : <XCircle className="w-4 h-4 text-ink/35 shrink-0" />}
                  <span className={i.ok ? '' : 'text-ink/60'}>{i.label}</span>
                  <span className="text-xs text-ink/45">· {i.detalle}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Documentación del rubro */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">Documentación del rubro</p>
            {pc.documentosRubro.length === 0 && !pc.bloqueFinanciero.requerido && (
              <p className="text-sm text-ink/50">Este rubro no tiene documentos propios.</p>
            )}
            <ul className="space-y-2 text-sm">
              {pc.bloqueFinanciero.requerido && (
                <li className="flex flex-wrap items-center gap-2">
                  {pc.bloqueFinanciero.cargado ? <CheckCircle2 className="w-4 h-4 text-ink shrink-0" /> : <XCircle className="w-4 h-4 text-ink/35 shrink-0" />}
                  <span>Bloque financiero del balance</span>
                  <input ref={balanceInput} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="hidden"
                    onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) p.onExtraerBloque(fs); e.target.value = ''; }} />
                  <button disabled={p.extrayendoBloque} onClick={() => balanceInput.current?.click()}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-ink/20 text-xs font-semibold hover:border-ink disabled:opacity-50"
                    title="La app no guarda los archivos: subí de nuevo el balance para leer el bloque financiero.">
                    {p.extrayendoBloque ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                    {pc.bloqueFinanciero.cargado ? 'Volver a extraer' : 'Extraer datos financieros del balance'}
                  </button>
                </li>
              )}
              {pc.documentosRubro.map(d => (
                <li key={d.tipo} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {d.cargados.length ? <CheckCircle2 className="w-4 h-4 text-ink shrink-0" /> : <XCircle className="w-4 h-4 text-ink/35 shrink-0" />}
                    <span>{d.label}</span>
                    {d.recomendado && <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/45">recomendado</span>}
                    <input ref={el => { inputs.current[d.tipo] = el; }} type="file" accept={ACCEPT} className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) p.onCargarDocumento(d.tipo, f); e.target.value = ''; }} />
                    <button disabled={lleno} onClick={() => inputs.current[d.tipo]?.click()}
                      title={lleno ? `Máximo ${MAX_DOCUMENTOS_POR_CASO} documentos por caso` : 'PDF, imagen, Excel o CSV'}
                      className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-ink/20 text-xs font-semibold hover:border-ink disabled:opacity-50">
                      <FileUp className="w-3.5 h-3.5" /> Cargar
                    </button>
                  </div>
                  {p.documentos.filter(x => x.tipo === d.tipo).map(doc => (
                    <DocumentoFila key={doc.id} doc={doc} fechaCaso={p.fechaCaso} onEditar={p.onEditarDocumento} onBorrar={p.onBorrarDocumento} />
                  ))}
                </li>
              ))}
            </ul>
            {pc.documentosRubro.length > 0 && (
              <p className="mt-2 text-[11px] text-ink/45">Información declarada por el cliente, no auditada: puede cambiar la opinión, pero nunca baja los pisos de las señales automáticas.</p>
            )}
          </div>

          {/* KPIs prioritarios */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">KPIs prioritarios del rubro</p>
            <ul className="space-y-1 text-sm">
              {pc.kpis.map(k => (
                <li key={k.key} className="flex items-center justify-between gap-3">
                  <span className="text-ink/75">{k.label}</span>
                  <span className="inline-flex items-center gap-2 tabular-nums">
                    {fmtKpi(k.actual, k.kind)}
                    {k.noAplica ? <span className="text-[10px] uppercase text-ink/45">No aplica</span>
                      : k.status ? <StatusBadge status={SEMAFORO[k.status as RatioStatus].status} label={SEMAFORO[k.status as RatioStatus].label} />
                      : k.actual === null ? <span className="text-[10px] uppercase text-ink/35">Sin dato</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Cruces y alertas */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">Cruces y alertas</p>
            {pc.alertas.length === 0 ? (
              <p className="text-sm text-ink/50">Sin alertas.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {pc.alertas.map(a => (
                  <li key={a} className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-ink/50 shrink-0 mt-0.5" />{a}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function DocumentoFila({ doc, fechaCaso, onEditar, onBorrar }: {
  doc: DocumentoSectorial;
  fechaCaso: string;
  onEditar: (id: string, extraccion: ExtraccionDocumento) => void;
  onBorrar: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const viejo = documentoDesactualizado(doc, fechaCaso);
  return (
    <div className="ml-6 border border-ink/10 rounded px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium truncate max-w-[220px]" title={doc.nombreArchivo}>{doc.nombreArchivo}</span>
        {doc.estado === 'procesando' && <span className="inline-flex items-center gap-1 text-ink/50"><Loader2 className="w-3 h-3 animate-spin" /> leyendo…</span>}
        {doc.estado === 'error' && <span className="text-ink font-medium bg-brand-blue/10 px-1.5 rounded-sm" title={doc.error}>no se pudo leer</span>}
        {doc.fechaDocumento && <span className="text-ink/50">al {doc.fechaDocumento}</span>}
        {viejo && <span className="font-semibold uppercase tracking-wider text-[10px] bg-ink/[0.06] px-1.5 rounded-sm">desactualizado</span>}
        {doc.editado && <span className="font-semibold uppercase tracking-wider text-[10px] text-brand-blue">editado</span>}
        <span className="ml-auto inline-flex gap-1">
          {doc.estado === 'ok' && (
            <button onClick={() => setEditando(e => !e)} className="p-1 text-ink/50 hover:text-ink" title="Ver y editar lo extraído"><Pencil className="w-3.5 h-3.5" /></button>
          )}
          <button onClick={() => onBorrar(doc.id)} className="p-1 text-ink/50 hover:text-ink" title="Borrar documento"><Trash2 className="w-3.5 h-3.5" /></button>
        </span>
      </div>
      {editando && doc.estado === 'ok' && doc.tipo === 'reporte_mora' && doc.extraccion && (
        <EditorReporteMora reporte={doc.extraccion as ReporteMora} onCambio={r => onEditar(doc.id, r)} />
      )}
    </div>
  );
}

// Editor de lo extraído del reporte de mora (reusa los inputs de "Editar valores").
function EditorReporteMora({ reporte, onCambio }: { reporte: ReporteMora; onCambio: (r: ReporteMora) => void }) {
  const update = (path: Path, value: unknown) => onCambio(setIn(reporte, path, value));
  return (
    <EditProvider value={{ editing: true, update }}>
      <div className="mt-2 space-y-2">
        <label className="flex items-center gap-2">Fecha de corte <EditableText path={['fecha_corte']} value={reporte.fecha_corte} inputClassName="w-28" /></label>
        <table className="w-full">
          <thead><tr className="text-ink/45"><th className="text-left py-1">Tramo</th><th className="text-right py-1">Monto (miles $)</th></tr></thead>
          <tbody>
            {reporte.tramos.map((t, i) => (
              <tr key={i}>
                <td className="!text-left py-0.5"><span className="inline-flex items-center gap-1"><RemoveRowButton path={['tramos']} list={reporte.tramos} index={i} /><EditableSelect path={['tramos', i, 'tramo']} value={t.tramo} options={[...TRAMOS_MORA]} /></span></td>
                <td className="py-0.5"><EditableNumber path={['tramos', i, 'monto']} value={t.monto} inputClassName="w-24" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddRowButton path={['tramos']} list={reporte.tramos} newItem={{ tramo: 'al_dia', monto: null }} label="Agregar tramo" />
        <label className="flex items-center gap-2">Previsiones <EditableNumber path={['previsiones']} value={reporte.previsiones} inputClassName="w-24" /></label>
        {reporte.por_producto && (
          <div>
            <p className="text-ink/45 mb-1">Por producto</p>
            {reporte.por_producto.map((x, i, list) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <RemoveRowButton path={['por_producto']} list={list} index={i} />
                <EditableText path={['por_producto', i, 'producto']} value={x.producto} inputClassName="w-32" />
                cartera <EditableNumber path={['por_producto', i, 'cartera']} value={x.cartera} inputClassName="w-20" />
                &gt; 90 días <EditableNumber path={['por_producto', i, 'mora_90']} value={x.mora_90} inputClassName="w-20" />
              </div>
            ))}
            <AddRowButton path={['por_producto']} list={reporte.por_producto} newItem={{ producto: '', cartera: null, mora_90: null }} label="Agregar producto" />
          </div>
        )}
      </div>
    </EditProvider>
  );
}

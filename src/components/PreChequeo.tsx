import { useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, FileUp, Loader2, Pencil, Trash2, X, XCircle } from 'lucide-react';
import { AddRowButton, EditableBoolean, EditableNumber, EditableSelect, EditableText, EditProvider, Path, RemoveRowButton, setIn } from '../features/editing/editing';
import { Prechequeo } from '../features/risk/prechequeo';
import { CATEGORIAS_HECHO, DocumentoSectorial, documentoDesactualizado, ESTADOS_OBRA, ExtraccionDocumento, MAX_DOCUMENTOS_POR_CASO, ReporteMora, TENENCIAS, TipoDocumentoSectorial, TRAMOS_MORA } from '../features/sectorDocs/tipos';
import { AnalisisDocumento, KpiDoc } from '../features/sectorDocs/analisis';
import { DOCUMENTOS_SECTORIALES, TipoDocumento } from '../features/risk/policy';
import { RatioStatus } from '../features/ratios/calculations';
import { RatioKind } from '../features/ratios/blocks';
import { STATUS, StatusBadge, Status } from './riskColors';
import { RatioLink } from './CalculoRatio';

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
  // El balance de este caso se subió en esta sesión: se puede extraer sin volver a subirlo.
  balanceEnSesion?: boolean;
  onCargarDocumento: (tipo: TipoDocumento, file: File) => void;
  onEditarDocumento: (id: string, extraccion: ExtraccionDocumento) => void;
  onBorrarDocumento: (id: string) => void;
  onExtraerBloque: (files: File[] | null) => void;
};

export function PreChequeo(p: Props) {
  const [abierto, setAbierto] = useState(true);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const balanceInput = useRef<HTMLInputElement | null>(null);
  const lleno = p.documentos.length >= MAX_DOCUMENTOS_POR_CASO;
  const pc = p.prechequeo;
  const adicionales = pc.documentosRubro.filter(d => DOCUMENTOS_SECTORIALES[d.tipo].grupo === 'adicional');
  const [tipoAdicional, setTipoAdicional] = useState<TipoDocumento>(adicionales[0]?.tipo ?? 'principales_clientes');

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
                  <MarcaBase ok={i.ok} />
                  <span className={i.ok ? '' : 'text-ink/60'}>{i.label}</span>
                  <span className="text-xs text-ink/45">· {i.detalle}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Documentación del rubro */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">Documentación del rubro</p>
            {!pc.documentosRubro.some(d => d.recomendado) && !pc.bloqueFinanciero.requerido && (
              <p className="text-sm text-ink/50 mb-2">Este rubro no tiene documento recomendado; el documento adicional es opcional.</p>
            )}
            <ul className="space-y-2 text-sm">
              {pc.bloqueFinanciero.requerido && (
                <li className="flex flex-wrap items-center gap-2">
                  {pc.bloqueFinanciero.cargado ? <CheckCircle2 className="w-4 h-4 text-ink shrink-0" /> : <XCircle className="w-4 h-4 text-ink/35 shrink-0" />}
                  <span>Bloque financiero del balance</span>
                  <input ref={balanceInput} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="hidden"
                    onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) p.onExtraerBloque(fs); e.target.value = ''; }} />
                  <button disabled={p.extrayendoBloque} onClick={() => (p.balanceEnSesion ? p.onExtraerBloque(null) : balanceInput.current?.click())}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-ink/20 text-xs font-semibold hover:border-ink disabled:opacity-50"
                    title={p.balanceEnSesion ? 'Usa el balance que subiste en esta sesión.' : 'La app no guarda los archivos: subí de nuevo el balance para leer el bloque financiero.'}>
                    {p.extrayendoBloque ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                    {pc.bloqueFinanciero.cargado ? 'Volver a extraer' : 'Extraer datos financieros del balance'}
                  </button>
                </li>
              )}
              {pc.documentosRubro.filter(d => DOCUMENTOS_SECTORIALES[d.tipo].grupo === 'rubro').map(d => (
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
                    <DocumentoFila key={doc.id} doc={doc} analisis={pc.analisis.find(a => a.doc.id === doc.id)} fechaCaso={p.fechaCaso} onEditar={p.onEditarDocumento} onBorrar={p.onBorrarDocumento} />
                  ))}
                </li>
              ))}
              {/* Documento adicional: cualquier rubro, opcional */}
              {adicionales.length > 0 && (
                <li className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileUp className="w-4 h-4 text-ink/40 shrink-0" />
                    <span>Documento adicional</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/45">opcional</span>
                    <select value={tipoAdicional} onChange={e => setTipoAdicional(e.target.value as TipoDocumento)}
                      className="ml-auto border border-ink/20 rounded px-2 py-1 text-xs bg-white">
                      {adicionales.map(a => <option key={a.tipo} value={a.tipo}>{a.label}</option>)}
                    </select>
                    <input ref={el => { inputs.current.adicional = el; }} type="file" accept={ACCEPT} className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) p.onCargarDocumento(tipoAdicional, f); e.target.value = ''; }} />
                    <button disabled={lleno} onClick={() => inputs.current.adicional?.click()}
                      title={lleno ? `Máximo ${MAX_DOCUMENTOS_POR_CASO} documentos por caso` : 'PDF, imagen, Excel o CSV'}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-ink/20 text-xs font-semibold hover:border-ink disabled:opacity-50">
                      <FileUp className="w-3.5 h-3.5" /> Cargar
                    </button>
                  </div>
                  {p.documentos.filter(x => adicionales.some(a => a.tipo === x.tipo)).map(doc => (
                    <DocumentoFila key={doc.id} doc={doc} titulo={adicionales.find(a => a.tipo === doc.tipo)?.label} analisis={pc.analisis.find(a => a.doc.id === doc.id)} fechaCaso={p.fechaCaso} onEditar={p.onEditarDocumento} onBorrar={p.onBorrarDocumento} />
                  ))}
                </li>
              )}
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
                  <RatioLink ratioKey={k.key} className="text-ink/75">{k.label}</RatioLink>
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

const fmtDoc = (v: number | null, u: KpiDoc['unidad']) =>
  v === null ? '—'
    : u === 'pct' ? `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
    : u === 'monto' ? `$ ${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}`
    : u === 'ha' ? `${v.toLocaleString('es-AR')} ha`
    : u === 'anios' ? `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })} años`
    : v.toLocaleString('es-AR', { maximumFractionDigits: 2 });

function DocumentoFila({ doc, analisis, titulo, fechaCaso, onEditar, onBorrar }: {
  doc: DocumentoSectorial;
  analisis?: AnalisisDocumento;
  titulo?: string;
  fechaCaso: string;
  onEditar: (id: string, extraccion: ExtraccionDocumento) => void;
  onBorrar: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const viejo = documentoDesactualizado(doc, fechaCaso);
  return (
    <div className="ml-6 border border-ink/10 rounded px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {titulo && <span className="text-ink/50">{titulo}:</span>}
        <span className="font-medium truncate max-w-[220px]" title={doc.nombreArchivo}>{doc.nombreArchivo}</span>
        {doc.estado === 'procesando' && <span className="inline-flex items-center gap-1 text-ink/50"><Loader2 className="w-3 h-3 animate-spin" /> leyendo…</span>}
        {doc.estado === 'error' && <span className="text-ink font-medium bg-brand-blue/10 px-1.5 rounded-sm" title={doc.error}>no se pudo leer</span>}
        {doc.fechaDocumento && <span className="text-ink/50">al {doc.fechaDocumento}</span>}
        {viejo && <span className="font-semibold uppercase tracking-wider text-[10px] bg-ink/[0.06] px-1.5 rounded-sm">desactualizado</span>}
        {doc.editado && <span className="font-semibold uppercase tracking-wider text-[10px] text-brand-blue">editado</span>}
        <span className="ml-auto inline-flex gap-1">
          {doc.estado === 'ok' && (
            <button onClick={() => setEditando(e => !e)} className="p-1 text-ink/50 hover:text-ink" title={doc.tipo === 'otro' ? 'Ver los hechos y elegir cuáles van a la opinión' : 'Ver y editar lo extraído'}><Pencil className="w-3.5 h-3.5" /></button>
          )}
          <button onClick={() => onBorrar(doc.id)} className="p-1 text-ink/50 hover:text-ink" title="Borrar documento"><Trash2 className="w-3.5 h-3.5" /></button>
        </span>
      </div>
      {analisis && (analisis.kpis.length > 0 || analisis.cruces.length > 0) && (
        <div className="mt-1.5 space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {analisis.kpis.map(k => (
              <span key={k.key} className="inline-flex items-center gap-1.5" title={k.motivo}>
                <span className="text-ink/55">{k.label}</span>
                <span className="font-semibold tabular-nums">{fmtDoc(k.valor, k.unidad)}</span>
                {k.status && <StatusBadge status={SEMAFORO[k.status].status} label={SEMAFORO[k.status].label} />}
              </span>
            ))}
          </div>
          {analisis.cruces.map(c => (
            <p key={c.mensaje} className={c.nivel === 'aviso' ? 'text-ink/50' : 'text-ink font-medium'}>
              {c.nivel === 'error' ? 'Error de datos: ' : c.nivel === 'alerta' ? 'Alerta: ' : ''}{c.mensaje.replace(/^Error de datos: /, '')}
            </p>
          ))}
        </div>
      )}
      {editando && doc.estado === 'ok' && doc.extraccion && (
        doc.tipo === 'reporte_mora'
          ? <EditorReporteMora reporte={doc.extraccion as ReporteMora} onCambio={r => onEditar(doc.id, r)} />
          : <EditorDocumento tipo={doc.tipo} datos={doc.extraccion} onCambio={r => onEditar(doc.id, r)} />
      )}
    </div>
  );
}

// ---------- editores por tipo (configuración, no código por tipo) ----------
type Columna = { campo: string; label: string; tipo: 'texto' | 'numero' | 'select' | 'bool' | 'incluir'; opciones?: readonly string[] };
const EDITORES: Partial<Record<TipoDocumentoSectorial, { escalares: Array<{ campo: string; label: string }>; lista: { campo: string; label: string; columnas: Columna[]; nuevo: Record<string, unknown> } }>> = {
  plan_siembra: {
    escalares: [{ campo: 'campania', label: 'Campaña' }],
    lista: { campo: 'lotes', label: 'Lotes', nuevo: { cultivo: '', hectareas: null, tenencia: 'otra', zona: null, rinde_esperado: null }, columnas: [
      { campo: 'cultivo', label: 'Cultivo', tipo: 'texto' }, { campo: 'hectareas', label: 'Ha', tipo: 'numero' },
      { campo: 'tenencia', label: 'Tenencia', tipo: 'select', opciones: TENENCIAS }, { campo: 'zona', label: 'Zona', tipo: 'texto' },
      { campo: 'rinde_esperado', label: 'Rinde (qq/ha)', tipo: 'numero' },
    ] },
  },
  listado_obras: {
    escalares: [],
    lista: { campo: 'obras', label: 'Obras', nuevo: { obra: '', comitente: '', tipo_comitente: null, monto_contrato: null, porcentaje_avance: null, saldo_a_ejecutar: null, estado: null, plazo_fin: null }, columnas: [
      { campo: 'obra', label: 'Obra', tipo: 'texto' }, { campo: 'comitente', label: 'Comitente', tipo: 'texto' },
      { campo: 'tipo_comitente', label: 'Tipo', tipo: 'select', opciones: ['publico', 'privado'] },
      { campo: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS_OBRA },
      { campo: 'monto_contrato', label: 'Monto', tipo: 'numero' }, { campo: 'porcentaje_avance', label: 'Avance %', tipo: 'numero' },
      { campo: 'saldo_a_ejecutar', label: 'Saldo', tipo: 'numero' },
    ] },
  },
  principales_clientes: {
    escalares: [],
    lista: { campo: 'clientes', label: 'Clientes', nuevo: { cliente: '', porcentaje_ventas: null, monto: null }, columnas: [
      { campo: 'cliente', label: 'Cliente', tipo: 'texto' }, { campo: 'porcentaje_ventas', label: '% ventas', tipo: 'numero' }, { campo: 'monto', label: 'Monto', tipo: 'numero' },
    ] },
  },
  cartera_contratos: {
    escalares: [],
    lista: { campo: 'contratos', label: 'Contratos', nuevo: { cliente: '', objeto: null, monto: null, vigencia_hasta: null, recurrente: null }, columnas: [
      { campo: 'cliente', label: 'Cliente', tipo: 'texto' }, { campo: 'objeto', label: 'Objeto', tipo: 'texto' }, { campo: 'monto', label: 'Monto', tipo: 'numero' },
      { campo: 'vigencia_hasta', label: 'Vigencia', tipo: 'texto' }, { campo: 'recurrente', label: 'Recurrente', tipo: 'bool' },
    ] },
  },
  otro: {
    escalares: [{ campo: 'descripcion_documento', label: 'Documento' }],
    lista: { campo: 'hechos', label: 'Hechos (tildá los que van a la opinión)', nuevo: { categoria: 'otro', descripcion: '', monto: null, fecha: null, cita_textual: '', pagina: null, incluir: false }, columnas: [
      { campo: 'incluir', label: 'A la opinión', tipo: 'incluir' }, { campo: 'categoria', label: 'Categoría', tipo: 'select', opciones: CATEGORIAS_HECHO },
      { campo: 'descripcion', label: 'Hecho', tipo: 'texto' }, { campo: 'cita_textual', label: 'Cita textual', tipo: 'texto' },
      { campo: 'monto', label: 'Monto', tipo: 'numero' }, { campo: 'pagina', label: 'Pág.', tipo: 'numero' },
    ] },
  },
};

function EditorDocumento({ tipo, datos, onCambio }: { tipo: TipoDocumentoSectorial; datos: ExtraccionDocumento; onCambio: (d: ExtraccionDocumento) => void }) {
  const cfg = EDITORES[tipo];
  if (!cfg) return null;
  const d = datos as unknown as Record<string, unknown>;
  const update = (path: Path, value: unknown) => onCambio(setIn(datos, path, value));
  const filas = (d[cfg.lista.campo] as Array<Record<string, unknown>>) ?? [];
  return (
    <EditProvider value={{ editing: true, update }}>
      <div className="mt-2 space-y-2 overflow-x-auto">
        {cfg.escalares.map(e => (
          <label key={e.campo} className="flex items-center gap-2">{e.label} <EditableText path={[e.campo]} value={d[e.campo] as string | null} inputClassName="w-56" /></label>
        ))}
        <p className="text-ink/45">{cfg.lista.label}</p>
        <table className="w-full">
          <thead><tr className="text-ink/45">{cfg.lista.columnas.map(c => <th key={c.campo} className="text-left py-1 pr-2 font-medium">{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="align-top">
                {cfg.lista.columnas.map(c => (
                  <td key={c.campo} className="!text-left py-0.5 pr-2">
                    {c.tipo === 'incluir' ? (
                      <input type="checkbox" checked={f[c.campo] === true} onChange={e => update([cfg.lista.campo, i, c.campo], e.target.checked)} aria-label="Incluir en la opinión" />
                    ) : c.tipo === 'numero' ? (
                      <EditableNumber path={[cfg.lista.campo, i, c.campo]} value={f[c.campo] as number | null} inputClassName="w-20" />
                    ) : c.tipo === 'select' ? (
                      <EditableSelect path={[cfg.lista.campo, i, c.campo]} value={(f[c.campo] as string) ?? ''} options={['', ...(c.opciones ?? [])]} />
                    ) : c.tipo === 'bool' ? (
                      <EditableBoolean path={[cfg.lista.campo, i, c.campo]} value={f[c.campo] as boolean | null} />
                    ) : (
                      <EditableText path={[cfg.lista.campo, i, c.campo]} value={f[c.campo] as string | null} inputClassName={c.campo === 'cita_textual' || c.campo === 'descripcion' ? 'w-56' : 'w-28'} />
                    )}
                  </td>
                ))}
                <td><RemoveRowButton path={[cfg.lista.campo]} list={filas} index={i} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddRowButton path={[cfg.lista.campo]} list={filas} newItem={cfg.lista.nuevo} label="Agregar fila" />
      </div>
    </EditProvider>
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

// Documentación base: lo que está, en el verde del manual (círculo verde con tilde
// negro, como los botones principales, para que tenga contraste sobre blanco);
// lo que falta, en el rojo de estado crítico.
function MarcaBase({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="w-4 h-4 rounded-full bg-brand-green flex items-center justify-center shrink-0" aria-label="Cargado">
      <Check className="w-3 h-3 text-ink" strokeWidth={3} />
    </span>
  ) : (
    <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: STATUS.critical }} aria-label="Falta">
      <X className="w-3 h-3 text-white" strokeWidth={3} />
    </span>
  );
}

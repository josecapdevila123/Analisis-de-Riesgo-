import { RawExtraction } from '../extraction/schemas';
import { ComputedRatios, disponibilidadesActuales, RatioKey } from '../ratios/calculations';
import { CrossCheckResult } from '../ratios/crossCheck';
import { Inconsistencia } from '../ratios/sanityChecks';
import { indicadoresFinancieros } from '../ratios/financieras';
import { DocumentoSectorial, documentoDesactualizado } from '../sectorDocs/tipos';
import { DOCUMENTOS_SECTORIALES, PerfilEfectivo, RATIO_LABEL_CORTO, TipoDocumento } from './policy';
import { RATIO_BLOCKS, RatioKind, SECTOR_KPI_SPECS } from '../ratios/blocks';

// Pre-chequeo antes de generar la opinión (todos los rubros). Generado por
// código; no bloquea nada: lo que falta se informa y va a "información faltante".

export type ItemBase = { id: string; label: string; ok: boolean; detalle: string };

export function documentacionBase(extraction: RawExtraction | null): ItemBase[] {
  const post = extraction?.analisis_post_cierre ?? null;
  const acc = extraction?.accionistas_y_directorio ?? null;
  return [
    { id: 'eecc', label: 'Estados contables', ok: !!extraction, detalle: extraction?.ejercicio_anterior ? 'Con comparativo' : 'Sin ejercicio comparativo' },
    { id: 'nosis', label: 'Informe Nosis', ok: !!extraction?.extraccion_nosis, detalle: extraction?.extraccion_nosis ? 'Cargado' : 'No se adjuntó' },
    { id: 'ventas_post', label: 'Ventas post balance', ok: (post?.detalle_ventas_mensuales?.length ?? 0) > 0, detalle: post?.detalle_ventas_mensuales?.length ? `${post.detalle_ventas_mensuales.length} meses` : 'Sin información' },
    { id: 'deudas_post', label: 'Deudas post balance', ok: (post?.deuda_bancaria_post_balance_detalle?.length ?? 0) > 0, detalle: post?.deuda_bancaria_post_balance_detalle?.length ? `${post.deuda_bancaria_post_balance_detalle.length} operaciones` : 'Sin información' },
    { id: 'accionistas', label: 'Accionistas y directorio', ok: (acc?.accionistas?.length ?? 0) > 0, detalle: acc?.accionistas?.length ? `${acc.accionistas.length} accionistas` : 'No se encontraron' },
  ];
}

export const faltantesBase = (extraction: RawExtraction | null) =>
  documentacionBase(extraction).filter(i => !i.ok).map(i => i.label);

export type DocumentoDelRubro = {
  tipo: TipoDocumento;
  label: string;
  recomendado: boolean;
  cargados: DocumentoSectorial[];
  desactualizados: DocumentoSectorial[];
};

export type Prechequeo = {
  base: ItemBase[];
  documentosRubro: DocumentoDelRubro[];
  bloqueFinanciero: { requerido: boolean; cargado: boolean };
  kpis: Array<{ key: RatioKey; label: string; kind: RatioKind; actual: number | null; status: string | null; noAplica: string | null }>;
  alertas: string[];
};

export function armarPrechequeo(i: {
  extraction: RawExtraction | null;
  ratios: ComputedRatios | null;
  crossCheck: CrossCheckResult | null;
  inconsistencias: Inconsistencia[];
  documentos: DocumentoSectorial[];
  fechaCaso: string;
  perfil: PerfilEfectivo;
}): Prechequeo {
  const { extraction, ratios, perfil } = i;
  const docsOk = i.documentos.filter(d => d.estado === 'ok');
  const alertas: string[] = [];

  if (i.crossCheck?.match === false && i.crossCheck.difference_pct !== null) {
    alertas.push(`Deuda del balance vs. Nosis: diferencia de ${Math.round(i.crossCheck.difference_pct)}% (el balance es al cierre; Nosis, a la fecha del informe).`);
  }
  const errores = i.inconsistencias.filter(x => x.severidad === 'error');
  if (errores.length) alertas.push(`El balance extraído tiene ${errores.length} inconsistencia(s) contable(s).`);

  if (extraction && perfil.modelo === 'financiera') {
    const f = indicadoresFinancieros(extraction, docsOk, { disponibilidades: disponibilidadesActuales(extraction) });
    if (f.cruce?.alerta) {
      alertas.push(`Cartera del reporte de mora ($ ${Math.round(f.cruce.carteraReporte).toLocaleString('es-AR')} miles al ${f.cruce.fechaReporte ?? 's/f'}) vs. créditos financieros del balance ($ ${Math.round(f.cruce.carteraBalance).toLocaleString('es-AR')} miles al ${f.cruce.fechaBalance ?? 's/f'}): diferencia de ${Math.round(f.cruce.diferenciaPct * 100)}%. Puede deberse a las fechas distintas.`);
    }
  }

  const documentosRubro = perfil.documentos.map(r => {
    const cargados = docsOk.filter(d => d.tipo === r.tipo);
    const desactualizados = cargados.filter(d => documentoDesactualizado(d, i.fechaCaso));
    desactualizados.forEach(d => alertas.push(`${DOCUMENTOS_SECTORIALES[r.tipo].label} "${d.nombreArchivo}" desactualizado: tiene más de 6 meses respecto del caso.`));
    return { tipo: r.tipo, label: DOCUMENTOS_SECTORIALES[r.tipo].label, recomendado: r.recomendado, cargados, desactualizados };
  });

  return {
    base: documentacionBase(extraction),
    documentosRubro,
    bloqueFinanciero: { requerido: perfil.modelo === 'financiera', cargado: !!extraction?.extraccion_financiera },
    kpis: perfil.kpisPrioritarios.map(key => ({
      key,
      label: RATIO_LABEL_CORTO[key] ?? key,
      kind: (SECTOR_KPI_SPECS[key] ?? RATIO_BLOCKS.flatMap(b => b.ratios).find(r => r.key === key))?.kind ?? 'x',
      actual: ratios?.[key]?.actual ?? null,
      status: perfil.noAplica[key] ? null : ratios?.[key]?.status ?? null,
      noAplica: perfil.noAplica[key] ?? null,
    })),
    alertas,
  };
}

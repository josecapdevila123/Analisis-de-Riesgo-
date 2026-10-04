import { CompanyHistory, RawExtraction, VerificationResult } from '../extraction/schemas';
import { ComputedRatios, RatioKey } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';
import { SECTOR_KPI_SPECS, RATIO_BLOCKS } from '../ratios/blocks';
import { DOCUMENTOS_SECTORIALES, PerfilEfectivo, RATIO_LABEL_CORTO, SECTOR_PROFILES, subsegmentoLabel } from './policy';
import { DocumentoSectorial } from '../sectorDocs/tipos';
import { indicadoresFinancieros } from '../ratios/financieras';
import { disponibilidadesActuales } from '../ratios/calculations';
import { RiskDimension } from '../extraction/schemas';
import { faltantesBase } from './prechequeo';
import { BloqueTexto, bloquesAMarkdown } from '../textos/bloques';
import { analizarDocumentos } from '../sectorDocs/analisis';
import { RiskSignal } from './signals';
import { SectorCaso } from './porton';
import { stripRiskConclusion } from './summary';

// Contexto que recibe Gemini para la opinión de riesgos. Puro (sin llamadas):
// todo lo numérico ya viene calculado por el código; acá solo se ordena.

export type ContextoOpinionInput = {
  extraction: RawExtraction;
  ratios: ComputedRatios;          // calculados con el perfil del rubro
  inconsistencias: Inconsistencia[];
  crossCheck: CrossCheckResult | null;
  verification: VerificationResult | null;
  marketAnalysis: string | null;
  companyHistory: CompanyHistory | null;
  senales: RiskSignal[];           // detectadas con el perfil del rubro
  pce: number | null;
  perfil: PerfilEfectivo;
  sector: SectorCaso | null;
  documentos?: DocumentoSectorial[] | null;
  historiaEditada?: BloqueTexto[] | null;
  mercadoEditado?: BloqueTexto[] | null;
};

// El análisis de mercado puede ser largo; alcanza con el inicio para el contexto sectorial.
const MAX_MARKET_CHARS = 15_000;

const SEMAFORO: Record<string, string> = { healthy: 'sano', alert: 'alerta', critical: 'crítico' };

const nombreRatio = (k: RatioKey) =>
  RATIO_LABEL_CORTO[k] ?? SECTOR_KPI_SPECS[k]?.name ?? RATIO_BLOCKS.flatMap(b => b.ratios).find(r => r.key === k)?.name ?? k;

export function armarContextoOpinion(i: ContextoOpinionInput) {
  const { extraction, ratios, perfil, sector } = i;
  const documentos = (i.documentos ?? []).filter(d => d.estado === 'ok');
  const fin = perfil.modelo === 'financiera'
    ? indicadoresFinancieros(extraction, documentos, { disponibilidades: disponibilidadesActuales(extraction) })
    : null;
  return {
    perfil_de_evaluacion: {
      rubro: perfil.label,
      subsegmento: subsegmentoLabel(perfil.subsegmento),
      // Dimensiones a puntuar en este perfil (con peso > 0) y su nombre.
      dimensiones: (Object.keys(perfil.pesos) as RiskDimension[])
        .filter(d => perfil.pesos[d] > 0)
        .map(d => ({ dimension: d, nombre: perfil.etiquetasDimensiones[d], peso: perfil.pesos[d] })),
      instrucciones_del_perfil: perfil.instruccionesOpinion,
      descripcion: perfil.descripcion,
      politica_version: perfil.version,
      confirmado_por: sector?.confirmadoPor ?? null,
      confirmado_en: sector?.confirmadoEn ?? null,
      sugerido_por_el_sistema: sector?.sugerido ? SECTOR_PROFILES[sector.sugerido].label : null,
      motivo_del_cambio: sector?.motivoCambio ?? null,
      nota_del_analista: sector?.nota ?? null,
      variable_critica: perfil.variableCritica,
      // En el orden en que hay que leerlos, con valor y semáforo ya calculados.
      kpis_prioritarios: perfil.kpisPrioritarios.map(k => ({
        indicador: nombreRatio(k),
        actual: ratios[k]?.actual ?? null,
        anterior: ratios[k]?.anterior ?? null,
        semaforo: perfil.noAplica[k] ? 'no aplica' : ratios[k]?.status ? SEMAFORO[ratios[k].status as string] : 'sin semáforo',
      })),
      preguntas_clave: perfil.preguntasClave,
      no_aplican: Object.entries(perfil.noAplica).map(([k, motivo]) => ({ indicador: nombreRatio(k as RatioKey), motivo })),
      senales_desactivadas: perfil.senalesDesactivadas,
    },
    // Documentos sectoriales: DECLARADOS por el cliente, no auditados. Van con
    // los KPIs y cruces que calculó el código; de "Otro", solo los hechos que el
    // analista marcó (con su cita).
    documentacion_sectorial: analizarDocumentos(documentos, { extraction, perfil }).map(a => ({
      tipo: a.titulo,
      archivo: a.doc.nombreArchivo,
      fecha: a.doc.fechaDocumento,
      cargado_por: a.doc.cargadoPor,
      editado_por_el_analista: a.doc.editado,
      naturaleza: 'Información declarada por el cliente, no auditada.',
      kpis: a.kpis.map(x => ({ indicador: x.label, valor: x.valor, semaforo: x.informativo ? 'informativo' : x.status ? SEMAFORO[x.status] : 'sin dato', motivo: x.motivo ?? null })),
      cruces: a.cruces,
      ...(a.doc.tipo === 'otro' ? { hechos_incluidos_por_el_analista: a.hechosIncluidos } : { datos: a.doc.extraccion }),
    })),
    // Del pre-chequeo: documentación base que no se recibió (va a información faltante).
    documentacion_base_faltante: faltantesBase(extraction),
    documentacion_sectorial_recomendada_faltante: perfil.documentos
      .filter(r => r.recomendado && !documentos.some(d => d.tipo === r.tipo))
      .map(r => DOCUMENTOS_SECTORIALES[r.tipo].label),
    indicadores_financieros: fin && {
      fuente_de_la_mora: fin.mora.fuente === 'reporte' ? 'Reporte de mora (declarado, no auditado)' : fin.mora.fuente === 'balance' ? 'Balance (EECC auditados)' : 'Sin datos',
      fecha_de_corte_de_la_mora: fin.mora.fechaCorte,
      fuente_de_las_previsiones: fin.mora.fuentePrevisiones,
      cartera: fin.mora.cartera,
      cartera_mas_90_dias: fin.mora.vencida90,
      previsiones: fin.mora.previsiones,
      pn_ajustado_con_balance: fin.pnAjustadoBalance,
      cruce_cartera_reporte_vs_balance: fin.cruce,
      mora_por_producto: fin.moraPorProducto,
      datos_faltantes: Object.entries(fin.valores).filter(([, v]) => v.actual === null).map(([k, v]) => ({ indicador: nombreRatio(k as RatioKey), motivo: v.motivo })),
    },
    empresa: extraction.company_profile,
    estados_contables: {
      ejercicio_actual: extraction.ejercicio_actual,
      ejercicio_anterior: extraction.ejercicio_anterior,
    },
    ratios,
    deuda_bancaria: {
      actual: extraction.deuda_bancaria_actual,
      anterior: extraction.deuda_bancaria_anterior,
    },
    post_balance: extraction.analisis_post_cierre,
    nosis: extraction.extraccion_nosis,
    informacion_complementaria: extraction.informacion_complementaria ?? null,
    accionistas_y_directorio: extraction.accionistas_y_directorio,
    cruce_balance_nosis: i.crossCheck,
    inconsistencias: i.inconsistencias,
    verificacion: i.verification
      ? { alertas_coherencia: i.verification.alertas_coherencia, resumen_ejecutivo: stripRiskConclusion(i.verification.executive_summary) }
      : null,
    // Si el analista editó Historia o Mercado, la opinión lee esa versión.
    historia_y_actividad: i.historiaEditada
      ? { editado_por_el_analista: true, texto: bloquesAMarkdown(i.historiaEditada) }
      : i.companyHistory,
    analisis_mercado: (() => {
      const md = i.mercadoEditado ? bloquesAMarkdown(i.mercadoEditado) : i.marketAnalysis;
      return md ? md.slice(0, MAX_MARKET_CHARS) : null;
    })(),
    pce_proxy: {
      valor: i.pce,
      supuesto: 'Pérdida esperada aproximada por tramos de score Nosis: relación inversa y no lineal (más score, menos pérdida). Índice relativo 0–100, no es un porcentaje.',
    },
    senales_automaticas: i.senales,
  };
}

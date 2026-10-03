import { CompanyHistory, RawExtraction, VerificationResult } from '../extraction/schemas';
import { ComputedRatios, RatioKey } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';
import { SECTOR_KPI_SPECS, RATIO_BLOCKS } from '../ratios/blocks';
import { PerfilEfectivo, RATIO_LABEL_CORTO, SECTOR_PROFILES } from './policy';
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
};

// El análisis de mercado puede ser largo; alcanza con el inicio para el contexto sectorial.
const MAX_MARKET_CHARS = 15_000;

const SEMAFORO: Record<string, string> = { healthy: 'sano', alert: 'alerta', critical: 'crítico' };

const nombreRatio = (k: RatioKey) =>
  RATIO_LABEL_CORTO[k] ?? SECTOR_KPI_SPECS[k]?.name ?? RATIO_BLOCKS.flatMap(b => b.ratios).find(r => r.key === k)?.name ?? k;

export function armarContextoOpinion(i: ContextoOpinionInput) {
  const { extraction, ratios, perfil, sector } = i;
  return {
    perfil_de_evaluacion: {
      rubro: perfil.label,
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
    historia_y_actividad: i.companyHistory,
    analisis_mercado: i.marketAnalysis ? i.marketAnalysis.slice(0, MAX_MARKET_CHARS) : null,
    pce_proxy: {
      valor: i.pce,
      supuesto: 'Pérdida esperada aproximada por tramos de score Nosis: relación inversa y no lineal (más score, menos pérdida). Índice relativo 0–100, no es un porcentaje.',
    },
    senales_automaticas: i.senales,
  };
}

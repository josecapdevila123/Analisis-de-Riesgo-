import type { RawExtraction } from '../extraction/schemas';
import { PerfilEfectivo, RATIO_ASSUMPTIONS, RATIO_LABEL_CORTO, RatioThreshold } from '../risk/policy';
import type { DocumentoSectorial } from '../sectorDocs/tipos';
import { ComputedRatios, disponibilidadesActuales, RatioKey, RatioStatus, valorParaSemaforo } from './calculations';
import { RATIO_BLOCKS, RatioKind, SECTOR_KPI_SPECS } from './blocks';
import { Calculo, ClaveAnual, CLAVES_ANUALES, DEFINICIONES, fmtNumero, insumosDelEjercicio, Termino } from './definiciones';
import { FIN_KEYS, FinKey, indicadoresFinancieros } from './financieras';

// Explicación de un ratio para el panel de cálculo: la cuenta de cada ejercicio
// (de las definiciones únicas), el semáforo con su umbral y los supuestos.

export type ExplicacionRatio = {
  key: RatioKey;
  nombre: string;
  kind: RatioKind;
  formula: string;
  ejercicios: Array<{ anio: string; calculo: Calculo }>;
  semaforo: {
    status: RatioStatus | null;
    umbral: RatioThreshold | null;
    noAplica: string | null;
    usaValorDe: string | null; // ej. "Margen EBITDA promedio 2 ejercicios"
  };
  supuestos: string[];
};

type Ctx = {
  extraction: RawExtraction;
  ratios: ComputedRatios;
  perfil: PerfilEfectivo;
  documentos?: DocumentoSectorial[] | null;
};

const specDe = (k: RatioKey) => RATIO_BLOCKS.flatMap(b => b.ratios).find(r => r.key === k) ?? SECTOR_KPI_SPECS[k] ?? null;
export const nombreRatio = (k: RatioKey) => specDe(k)?.name ?? RATIO_LABEL_CORTO[k] ?? k;
const t = (label: string, valor: number | null, origen: string, extra: Partial<Termino> = {}): Termino => ({ label, valor, origen, ...extra });

const SUPUESTOS: Partial<Record<RatioKey, string[]>> = {
  dscr: RATIO_ASSUMPTIONS.slice(0, 3),
  deuda_neta_ebitda: [RATIO_ASSUMPTIONS[3]],
};

function calculoEspecial(key: RatioKey, ctx: Ctx, cual: 'actual' | 'anterior'): Calculo | null {
  const { extraction, ratios } = ctx;
  if (key === 'margen_ebitda_promedio') {
    if (cual === 'anterior') return null;
    const act = ratios.margen_ebitda.actual, ant = ratios.margen_ebitda.anterior;
    return {
      valor: ratios.margen_ebitda_promedio.actual,
      formula: '(Margen EBITDA actual + margen EBITDA anterior) / 2',
      cuenta: ant === null ? `${fmtNumero(act)} (sin ejercicio anterior: se usa el actual)` : `(${fmtNumero(act)} + ${fmtNumero(ant)}) / 2`,
      terminos: [t('Margen EBITDA actual', act, 'Calculado'), t('Margen EBITDA anterior', ant, 'Calculado')],
    };
  }
  if (key === 'deuda_me_share') {
    if (cual === 'anterior') return null;
    const me = extraction.informacion_complementaria?.deuda_financiera_moneda_extranjera ?? null;
    return {
      valor: ratios.deuda_me_share.actual,
      formula: 'Deuda financiera en moneda extranjera / deuda bancaria total',
      cuenta: `${fmtNumero(me)} / ${fmtNumero(ratios.deuda_bancaria_total.actual)}`,
      terminos: [t('Deuda en moneda extranjera', me, 'Información complementaria del balance'), t('Deuda bancaria total', ratios.deuda_bancaria_total.actual, 'Calculado')],
      nota: me === null ? 'El balance no informa deuda en moneda extranjera.' : undefined,
    };
  }
  if ((FIN_KEYS as RatioKey[]).includes(key)) {
    if (cual === 'anterior') return null;
    return calculoFinanciero(key as FinKey, ctx);
  }
  return null;
}

// Financieras: los valores salen de financieras.ts; acá se muestran sus insumos.
function calculoFinanciero(key: FinKey, ctx: Ctx): Calculo {
  const docs = (ctx.documentos ?? []).filter(d => d.estado === 'ok');
  const f = indicadoresFinancieros(ctx.extraction, docs, { disponibilidades: disponibilidadesActuales(ctx.extraction) });
  const b = ctx.extraction.extraccion_financiera ?? null;
  const fuente = f.mora.fuente === 'reporte' ? `Reporte de mora${f.mora.fechaCorte ? ` al ${f.mora.fechaCorte}` : ''} (declarado, no auditado)`
    : f.mora.fuente === 'balance' ? `Balance${f.mora.fechaCorte ? ` al ${f.mora.fechaCorte}` : ''}: bloque financiero` : 'Sin datos';
  const cartera = t('Cartera', f.mora.cartera, fuente);
  const venc = t('Cartera con más de 90 días', f.mora.vencida90, fuente);
  const prev = t('Previsiones', f.mora.previsiones, f.mora.fuentePrevisiones === 'reporte' ? fuente : 'Balance: previsiones por incobrabilidad');
  const pn = t('Patrimonio neto', ctx.extraction.ejercicio_actual.estado_situacion_patrimonial.patrimonio_neto, 'Balance: patrimonio neto');
  const valor = f.valores[key].actual;
  const nota = valor === null ? f.valores[key].motivo : undefined;
  const spec = SECTOR_KPI_SPECS[key];
  const base = { valor, formula: spec?.formula ?? key, nota };
  switch (key) {
    case 'cartera_financiera': return { ...base, cuenta: fmtNumero(f.mora.cartera), terminos: [cartera] };
    case 'mora': return { ...base, cuenta: `${fmtNumero(f.mora.vencida90)} / ${fmtNumero(f.mora.cartera)}`, terminos: [venc, cartera] };
    case 'cobertura': return { ...base, cuenta: `${fmtNumero(f.mora.previsiones)} / ${fmtNumero(f.mora.vencida90)}`, terminos: [prev, venc] };
    case 'irregular_no_previsionada': return { ...base, cuenta: `máx(0, ${fmtNumero(f.mora.vencida90)} − ${fmtNumero(f.mora.previsiones)})`, terminos: [venc, prev] };
    case 'pn_ajustado': return { ...base, cuenta: `${fmtNumero(pn.valor)} − máx(0, ${fmtNumero(f.mora.vencida90)} − ${fmtNumero(f.mora.previsiones)})`, terminos: [pn, venc, prev] };
    case 'pn_ajustado_sobre_pn': return { ...base, cuenta: `${fmtNumero(f.valores.pn_ajustado.actual)} / ${fmtNumero(pn.valor)}`, terminos: [t('PN ajustado', f.valores.pn_ajustado.actual, 'Calculado'), pn] };
    default: {
      const crudos: Termino[] = b ? Object.entries(b)
        .filter(([k, x]) => typeof x === 'number' && CRUDOS_DE[key]?.includes(k))
        .map(([k, x]) => t(k.replace(/_/g, ' '), x as number, 'Balance: bloque financiero')) : [];
      return { ...base, cuenta: fmtNumero(valor), terminos: crudos };
    }
  }
}

const CRUDOS_DE: Partial<Record<FinKey, string[]>> = {
  cargo_sobre_resultado: ['cargo_incobrabilidad', 'ingresos_financieros', 'egresos_financieros'],
  liquidez_90d: ['creditos_a_vencer_90_dias', 'inversiones_corrientes', 'pasivos_a_vencer_90_dias'],
  eficiencia: ['ingresos_financieros', 'egresos_financieros'],
  top10_sobre_cartera: ['top10_deudores_monto', 'cartera_total'],
  brecha_crecimiento_cartera_pn: ['cartera_total', 'cartera_total_anterior'],
};

export function explicarRatio(key: RatioKey, ctx: Ctx): ExplicacionRatio {
  const { extraction, perfil, ratios } = ctx;
  const anioAct = extraction.company_profile.anio_actual || 'Actual';
  const anioAnt = extraction.company_profile.anio_anterior || 'Anterior';
  const ejercicios: ExplicacionRatio['ejercicios'] = [];

  if ((CLAVES_ANUALES as RatioKey[]).includes(key)) {
    const def = DEFINICIONES[key as ClaveAnual];
    const actual = def(insumosDelEjercicio(extraction.ejercicio_actual, extraction.deuda_bancaria_actual.corriente.total, extraction.deuda_bancaria_actual.no_corriente.total));
    ejercicios.push({ anio: anioAct, calculo: actual });
    if (extraction.ejercicio_anterior && extraction.deuda_bancaria_anterior) {
      ejercicios.push({ anio: anioAnt, calculo: def(insumosDelEjercicio(extraction.ejercicio_anterior, extraction.deuda_bancaria_anterior.corriente.total, extraction.deuda_bancaria_anterior.no_corriente.total)) });
    }
  } else {
    const act = calculoEspecial(key, ctx, 'actual');
    if (act) ejercicios.push({ anio: anioAct, calculo: act });
  }

  const usa = valorParaSemaforo(key, perfil);
  const spec = specDe(key);
  return {
    key,
    nombre: nombreRatio(key),
    kind: spec?.kind ?? 'x',
    formula: ejercicios[0]?.calculo.formula ?? spec?.formula ?? '',
    ejercicios,
    semaforo: {
      status: perfil.noAplica[key] ? null : ratios[key]?.status ?? null,
      umbral: perfil.umbrales[key] ?? null,
      noAplica: perfil.noAplica[key] ?? null,
      usaValorDe: usa !== key ? nombreRatio(usa) : null,
    },
    supuestos: SUPUESTOS[key] ?? [],
  };
}

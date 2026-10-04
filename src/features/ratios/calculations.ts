import { RawExtraction } from '../extraction/schemas';
import { PerfilEfectivo, perfilEfectivo, RatioThreshold } from '../risk/policy';
import { FIN_KEYS, FinKey, indicadoresFinancieros } from './financieras';
import { CLAVES_ANUALES, ClaveAnual, DEFINICIONES, disponibilidadesDe, insumosDelEjercicio } from './definiciones';
import type { DocumentoSectorial } from '../sectorDocs/tipos';

export type RatioStatus = 'healthy' | 'alert' | 'critical';

export type Ratio = {
  actual: number | null;
  anterior: number | null;
  variacion_pct: number | null;
  status: RatioStatus | null;
};

export type RatioKey =
  | 'ebitda'
  | 'liquidez_corriente'
  | 'liquidez_acida'
  | 'liquidez_inmediata'
  | 'solvencia'
  | 'endeudamiento'
  | 'capital_de_trabajo'
  | 'ktno'
  | 'margen_bruto'
  | 'margen_ebitda'
  | 'margen_neto'
  | 'cobertura_intereses'
  | 'deuda_bancaria_total'
  | 'deuda_ebitda'
  | 'deuda_dias_ventas'
  | 'dias_de_cobro'
  | 'dias_de_pago'
  | 'dias_de_stock'
  | 'ciclo_conversion_caja'
  | 'indice_inmovilizacion'
  | 'autofinanciamiento'
  | 'roe'
  | 'roa'
  | 'deuda_neta_ebitda'
  | 'dscr'
  | 'calidad_ganancia'
  | 'deuda_financiera_pn'
  // KPIs sectoriales (perfiles por rubro)
  | 'bienes_cambio_deuda_cp'
  | 'deuda_bancaria_ventas'
  | 'deuda_cp_share'
  | 'margen_ebitda_promedio'
  | 'deuda_comercial_bancaria'
  | 'capex_depreciacion'
  | 'deuda_me_share'
  | 'anticipos_clientes'
  | 'anticipos_ventas'
  | 'liquidez_corriente_sin_anticipos'
  | 'endeudamiento_sin_anticipos'
  | 'pn_activo'
  // Financieras (ver financieras.ts)
  | FinKey;

export type ComputedRatios = Record<RatioKey, Ratio>;

type Year = RawExtraction['ejercicio_actual'];

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const safeDivide = (n: number | null, d: number | null): number | null => {
  if (!isFiniteNumber(n) || !isFiniteNumber(d) || d === 0) return null;
  return n / d;
};


const computeVariation = (actual: number | null, anterior: number | null): number | null => {
  if (!isFiniteNumber(actual) || !isFiniteNumber(anterior) || anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
};

// Semáforo según la política de riesgos (src/features/risk/policy.ts), con los
// umbrales del perfil efectivo del rubro. Un ratio que "no aplica" no tiene semáforo.
// Semáforo de un valor contra un umbral de la política (estricto o inclusivo).
export const evaluarConUmbral = (value: number | null, t: RatioThreshold | null | undefined): RatioStatus | null => {
  if (!isFiniteNumber(value) || !t) return null;
  // Inclusivo (financieras, documentos): el valor exacto del umbral cae en el tramo mejor.
  const inc = t.inclusivo === true;
  if (t.mejorSi === 'mayor') {
    if (inc ? value >= t.sano : value > t.sano) return 'healthy';
    if (value >= t.alerta) return 'alert';
    return 'critical';
  }
  if (value <= t.sano) return 'healthy';
  if (value <= t.alerta) return 'alert';
  return 'critical';
};

const evaluateRatioStatus = (key: RatioKey, value: number | null, perfil: PerfilEfectivo): RatioStatus | null => {
  if (!isFiniteNumber(value)) return null;
  const t = perfil.umbrales[key];
  if (!t) return null;
  if (perfil.noAplica[key]) return null;
  // Negativo en deuda bruta / EBITDA solo ocurre con EBITDA negativo: no hay capacidad de repago.
  if (key === 'deuda_ebitda' && value < 0) return 'critical';
  return evaluarConUmbral(value, t);
};

type YearValues = Record<RatioKey, number | null>;

// Valores de un ejercicio: salen de las definiciones únicas (definiciones.ts),
// que también producen la cuenta que muestra la pestaña de cálculos.
const computeYearValues = (year: Year, deudaCorriente: number, deudaNoCorriente: number): YearValues => {
  const insumos = insumosDelEjercicio(year, deudaCorriente, deudaNoCorriente);
  const anuales = Object.fromEntries(CLAVES_ANUALES.map(k => [k, DEFINICIONES[k](insumos).valor])) as Record<ClaveAnual, number | null>;
  return {
    ...anuales,
    margen_ebitda_promedio: null, // se calcula con los dos ejercicios en computeRatios
    deuda_me_share: null, // solo el ejercicio actual, desde la información complementaria
    ...(Object.fromEntries(FIN_KEYS.map(k => [k, null])) as Record<FinKey, null>),
  };
};

const RATIO_KEYS: RatioKey[] = [
  'ebitda',
  'liquidez_corriente',
  'liquidez_acida',
  'liquidez_inmediata',
  'solvencia',
  'endeudamiento',
  'capital_de_trabajo',
  'ktno',
  'margen_bruto',
  'margen_ebitda',
  'margen_neto',
  'cobertura_intereses',
  'deuda_bancaria_total',
  'deuda_ebitda',
  'deuda_dias_ventas',
  'dias_de_cobro',
  'dias_de_pago',
  'dias_de_stock',
  'ciclo_conversion_caja',
  'indice_inmovilizacion',
  'autofinanciamiento',
  'roe',
  'roa',
  'deuda_neta_ebitda',
  'dscr',
  'calidad_ganancia',
  'deuda_financiera_pn',
  'bienes_cambio_deuda_cp',
  'deuda_bancaria_ventas',
  'deuda_cp_share',
  'margen_ebitda_promedio',
  'deuda_comercial_bancaria',
  'capex_depreciacion',
  'deuda_me_share',
  'anticipos_clientes',
  'anticipos_ventas',
  'liquidez_corriente_sin_anticipos',
  'endeudamiento_sin_anticipos',
  'pn_activo',
  ...FIN_KEYS,
];

// Ratio cuyo valor se usa para el semáforo de otro, según el perfil:
// agro mide el margen EBITDA con el promedio de 2 ejercicios; construcción, la
// liquidez corriente sin anticipos de clientes.
const valorParaSemaforo = (key: RatioKey, perfil: PerfilEfectivo): RatioKey => {
  if (key === 'margen_ebitda' && perfil.ajustes.margenEbitdaPromedio) return 'margen_ebitda_promedio';
  if (key === 'liquidez_corriente' && perfil.ajustes.excluirAnticiposClientes) return 'liquidez_corriente_sin_anticipos';
  return key;
};

// Caja y bancos del ejercicio actual (lo usan también las señales de financieras).
export const disponibilidadesActuales = (extraction: RawExtraction) => disponibilidadesDe(extraction.ejercicio_actual);

export function computeRatios(
  extraction: RawExtraction,
  perfil: PerfilEfectivo = perfilEfectivo('generico'),
  documentos: DocumentoSectorial[] | null = null,
): ComputedRatios {
  const actualValues = computeYearValues(
    extraction.ejercicio_actual,
    extraction.deuda_bancaria_actual.corriente.total,
    extraction.deuda_bancaria_actual.no_corriente.total
  );

  const anteriorValues =
    extraction.ejercicio_anterior && extraction.deuda_bancaria_anterior
      ? computeYearValues(
          extraction.ejercicio_anterior,
          extraction.deuda_bancaria_anterior.corriente.total,
          extraction.deuda_bancaria_anterior.no_corriente.total
        )
      : null;

  // Margen EBITDA promedio de los dos ejercicios (sin anterior: el del actual).
  const mAct = actualValues.margen_ebitda;
  const mAnt = anteriorValues?.margen_ebitda ?? null;
  actualValues.margen_ebitda_promedio = mAct === null ? null : mAnt === null ? mAct : (mAct + mAnt) / 2;

  // Deuda en moneda extranjera sobre la deuda bancaria (descalce de moneda).
  const deudaME = extraction.informacion_complementaria?.deuda_financiera_moneda_extranjera ?? null;
  actualValues.deuda_me_share = deudaME === null ? null : safeDivide(deudaME, actualValues.deuda_bancaria_total);

  // Financieras: solo con bloque financiero del balance o reporte de mora.
  // Sin esos datos quedan en null (las empresas productivas no los tienen).
  if (extraction.extraccion_financiera || (documentos ?? []).some(d => d.tipo === 'reporte_mora')) {
    const f = indicadoresFinancieros(extraction, documentos, { disponibilidades: disponibilidadesDe(extraction.ejercicio_actual) });
    for (const k of FIN_KEYS) actualValues[k] = f.valores[k].actual;
  }

  const result = {} as ComputedRatios;
  for (const key of RATIO_KEYS) {
    const actual = actualValues[key];
    const anterior = anteriorValues ? anteriorValues[key] : null;
    result[key] = {
      actual,
      anterior,
      variacion_pct: computeVariation(actual, anterior),
      status: evaluateRatioStatus(key, actualValues[valorParaSemaforo(key, perfil)], perfil),
    };
  }
  return result;
}

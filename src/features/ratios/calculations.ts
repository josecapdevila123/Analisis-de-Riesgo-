import { RawExtraction } from '../extraction/schemas';

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
  | 'roa';

export type ComputedRatios = Record<RatioKey, Ratio>;

type Year = RawExtraction['ejercicio_actual'];
type Detalles = Year['estado_situacion_patrimonial']['activo_corriente']['detalles'];

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const safeDivide = (n: number | null, d: number | null): number | null => {
  if (!isFiniteNumber(n) || !isFiniteNumber(d) || d === 0) return null;
  return n / d;
};

const multiplyOrNull = (v: number | null, factor: number): number | null =>
  v === null ? null : v * factor;

const computeVariation = (actual: number | null, anterior: number | null): number | null => {
  if (!isFiniteNumber(actual) || !isFiniteNumber(anterior) || anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
};

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const sumDetallesByKeywords = (
  detalles: Detalles,
  keywords: string[],
  exclude: string[] = []
): number | null => {
  let total = 0;
  let found = false;
  for (const item of detalles) {
    const rubro = normalize(item.rubro);
    if (keywords.some(kw => rubro.includes(kw)) && !exclude.some(ex => rubro.includes(ex))) {
      total += item.monto;
      found = true;
    }
  }
  return found ? total : null;
};

const KW_DISPONIBILIDADES = ['caja', 'banco', 'efectivo', 'disponibilidad'];
const KW_CREDITOS = ['credito', 'cobrar', 'deudores por venta', 'cliente'];
// "Otros créditos" y "Créditos fiscales" no son créditos por ventas.
const EXCL_CREDITOS = ['otro', 'otra', 'fiscal', 'impositiv'];
const KW_DEUDAS_COMERCIALES = ['comercial', 'pagar', 'proveedor', 'acreedor'];
// "a pagar" también aparece en deudas fiscales, laborales y financieras.
const EXCL_DEUDAS_COMERCIALES = [
  'fiscal', 'impositiv', 'remuneracion', 'social', 'dividendo',
  'prestamo', 'bancari', 'financier', 'otro', 'otra',
];

const getDisponibilidades = (year: Year) =>
  sumDetallesByKeywords(
    year.estado_situacion_patrimonial.activo_corriente.detalles,
    KW_DISPONIBILIDADES
  );

const getCreditosPorVentas = (year: Year) =>
  sumDetallesByKeywords(
    year.estado_situacion_patrimonial.activo_corriente.detalles,
    KW_CREDITOS,
    EXCL_CREDITOS
  );

const getDeudasComerciales = (year: Year) =>
  sumDetallesByKeywords(
    year.estado_situacion_patrimonial.pasivo_corriente.detalles,
    KW_DEUDAS_COMERCIALES,
    EXCL_DEUDAS_COMERCIALES
  );

// Convención de signos: Gemini puede devolver costos, gastos y depreciación
// en negativo (como en los EECC) o en positivo. Se normalizan con valor
// absoluto para que los ratios no dependan de eso. Valuación de BdC e
// inversiones permanentes son resultados (ganancia o pérdida) y conservan su signo.
const computeEBITDA = (year: Year): number => {
  const er = year.estado_resultados;
  const ef = year.flujo_efectivo;
  const valuacion = er.resultado_valuacion_bienes_de_cambio ?? 0;
  const depreciacion = Math.abs(ef.depreciacion_bienes_de_uso ?? 0);
  // amortizacion_intangibles no está en el schema; el spec dice tratarlo como 0
  const amortizacionIntangibles = 0;
  const resInversiones = er.resultado_inversiones_permanentes ?? 0;
  return (
    er.resultado_bruto +
    valuacion +
    depreciacion +
    amortizacionIntangibles +
    resInversiones -
    (Math.abs(er.gastos_comercializacion) + Math.abs(er.gastos_administracion))
  );
};

const evaluateRatioStatus = (key: RatioKey, value: number | null): RatioStatus | null => {
  if (!isFiniteNumber(value)) return null;
  switch (key) {
    case 'liquidez_corriente':
    case 'liquidez_acida':
    case 'liquidez_inmediata':
      if (value > 1.2) return 'healthy';
      if (value >= 1) return 'alert';
      return 'critical';
    case 'solvencia':
      if (value > 1.5) return 'healthy';
      if (value >= 1) return 'alert';
      return 'critical';
    case 'deuda_ebitda':
      // Negativo solo si el EBITDA es negativo: no hay capacidad de repago.
      if (value < 0) return 'critical';
      if (value < 2) return 'healthy';
      if (value <= 3.5) return 'alert';
      return 'critical';
    case 'cobertura_intereses':
      if (value > 3) return 'healthy';
      if (value >= 1.5) return 'alert';
      return 'critical';
    default:
      return null;
  }
};

type YearValues = Record<RatioKey, number | null>;

const computeYearValues = (year: Year, deudaCorriente: number, deudaNoCorriente: number): YearValues => {
  const esp = year.estado_situacion_patrimonial;
  const er = year.estado_resultados;
  const ef = year.flujo_efectivo;

  const ac = esp.activo_corriente.total;
  const anc = esp.activo_no_corriente.total;
  const totalActivo = esp.total_activo;
  const pc = esp.pasivo_corriente.total;
  const totalPasivo = esp.total_pasivo;
  const pn = esp.patrimonio_neto;
  const bc = esp.bienes_de_cambio;

  const ventas = er.ventas_netas;
  const costo = Math.abs(er.costo_ventas);
  const rb = er.resultado_bruto;
  const rn = er.resultado_neto;
  const gfin = er.gastos_financieros === null ? null : Math.abs(er.gastos_financieros);
  // Con PN ≤ 0 (quiebra técnica) endeudamiento y ROE no tienen sentido
  // económico: darían negativo o positivo con pérdida y se verían sanos.
  const pnPositivo = pn > 0 ? pn : null;

  const disponibilidades = getDisponibilidades(year);
  const creditos = getCreditosPorVentas(year);
  const deudasComerciales = getDeudasComerciales(year);

  const ebitda = computeEBITDA(year);
  const deudaBancariaTotal = deudaCorriente + deudaNoCorriente;

  const liquidezAcida = bc === null ? null : safeDivide(ac - bc, pc);
  const ktno =
    creditos === null || bc === null || deudasComerciales === null
      ? null
      : creditos + bc - deudasComerciales;

  const diasCobro = multiplyOrNull(safeDivide(creditos, ventas), 365);
  const diasPago = multiplyOrNull(safeDivide(deudasComerciales, costo), 365);
  const diasStock = multiplyOrNull(safeDivide(bc, costo), 365);
  const ciclo =
    diasCobro === null || diasStock === null || diasPago === null
      ? null
      : diasCobro + diasStock - diasPago;

  return {
    ebitda,
    liquidez_corriente: safeDivide(ac, pc),
    liquidez_acida: liquidezAcida,
    liquidez_inmediata: safeDivide(disponibilidades, pc),
    solvencia: safeDivide(pn, totalPasivo),
    endeudamiento: safeDivide(totalPasivo, pnPositivo),
    capital_de_trabajo: ac - pc,
    ktno,
    margen_bruto: safeDivide(rb, ventas),
    margen_ebitda: safeDivide(ebitda, ventas),
    margen_neto: safeDivide(rn, ventas),
    cobertura_intereses: safeDivide(ebitda, gfin),
    deuda_bancaria_total: deudaBancariaTotal,
    deuda_ebitda: safeDivide(deudaBancariaTotal, ebitda),
    deuda_dias_ventas: multiplyOrNull(safeDivide(deudaBancariaTotal, ventas), 365),
    dias_de_cobro: diasCobro,
    dias_de_pago: diasPago,
    dias_de_stock: diasStock,
    ciclo_conversion_caja: ciclo,
    indice_inmovilizacion: safeDivide(anc, totalActivo),
    autofinanciamiento: safeDivide(ef.flujo_neto_operativo, deudaBancariaTotal),
    roe: safeDivide(rn, pnPositivo),
    roa: safeDivide(rn, totalActivo),
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
];

export function computeRatios(extraction: RawExtraction): ComputedRatios {
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

  const result = {} as ComputedRatios;
  for (const key of RATIO_KEYS) {
    const actual = actualValues[key];
    const anterior = anteriorValues ? anteriorValues[key] : null;
    result[key] = {
      actual,
      anterior,
      variacion_pct: computeVariation(actual, anterior),
      status: evaluateRatioStatus(key, actual),
    };
  }
  return result;
}


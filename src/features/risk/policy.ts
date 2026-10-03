import type { RiskDimension, SeveridadRiesgo } from '../extraction/schemas';

// ============================================================================
// POLÍTICA DE RIESGOS — fuente única de umbrales, pisos, pesos y tramos.
// La usan calculations.ts (semáforos), signals.ts (reglas), score.ts (puntaje)
// y la página "Política de riesgos" de la app, que la muestra tal cual.
//
// ESTADO: propuesta inicial, a validar con el área de Riesgos.
// Cualquier cambio acá se hace con tests (ver CLAUDE.md).
// ============================================================================

export const POLICY_STATUS = 'Propuesta inicial — pendiente de validación por Riesgos';

// ---------- Semáforo de ratios ----------
// mayor = mejor: sano si valor > sano; alerta si valor ≥ alerta; si no, crítico.
// menor = mejor: sano si valor ≤ sano; alerta si valor ≤ alerta; si no, crítico.
export type RatioThreshold = {
  label: string;
  mejorSi: 'mayor' | 'menor';
  sano: number;
  alerta: number;
  unidad: 'x' | '%';
  nota?: string;
};

export const RATIO_THRESHOLDS = {
  liquidez_corriente: { label: 'Liquidez corriente', mejorSi: 'mayor', sano: 1.2, alerta: 1.0, unidad: 'x', nota: 'Más de 1,2–1,5x.' },
  liquidez_acida: { label: 'Prueba ácida', mejorSi: 'mayor', sano: 1.0, alerta: 0.7, unidad: 'x', nota: 'Cerca de 1x.' },
  liquidez_inmediata: { label: 'Liquidez inmediata', mejorSi: 'mayor', sano: 1.2, alerta: 1.0, unidad: 'x' },
  solvencia: { label: 'Solvencia (PN / pasivo)', mejorSi: 'mayor', sano: 1.5, alerta: 1.0, unidad: 'x' },
  deuda_ebitda: { label: 'Deuda financiera / EBITDA', mejorSi: 'menor', sano: 2.5, alerta: 4, unidad: 'x' },
  deuda_neta_ebitda: { label: 'Deuda financiera neta / EBITDA', mejorSi: 'menor', sano: 2.5, alerta: 4, unidad: 'x', nota: 'Hasta 2,5x cómodo; 2,5x–4x depende del sector; más de 4x alerta.' },
  cobertura_intereses: { label: 'Cobertura de intereses (EBITDA / intereses)', mejorSi: 'mayor', sano: 3, alerta: 1.5, unidad: 'x' },
  dscr: { label: 'DSCR', mejorSi: 'mayor', sano: 1.25, alerta: 1.0, unidad: 'x', nota: 'Indicador principal: si el flujo alcanza para pagar intereses y capital.' },
  calidad_ganancia: { label: 'Calidad de la ganancia (FCO / EBITDA)', mejorSi: 'mayor', sano: 0.7, alerta: 0.6, unidad: '%', nota: 'Debajo de 60–70%, el EBITDA queda atrapado en capital de trabajo.' },
} as const satisfies Record<string, RatioThreshold>;

export type RatioWithThreshold = keyof typeof RATIO_THRESHOLDS;

// ---------- Aproximaciones usadas en ratios ----------
export const RATIO_ASSUMPTIONS = [
  'DSCR = (EBITDA − capex de mantenimiento − impuesto a las ganancias) / (intereses + amortización de capital del año).',
  'Capex de mantenimiento ≈ depreciación de bienes de uso (no se informa por separado en los EECC).',
  'Amortización de capital del año ≈ deuda bancaria corriente (lo que vence en los próximos 12 meses).',
  'Deuda neta = deuda bancaria − disponibilidades (rubros de caja y bancos). Sin rubros de caja, se usa la deuda total.',
];

// ---------- Escala y pesos del puntaje ----------
export const SCORE_BANDS: Array<{ hasta: number; categoria: 'bajo' | 'moderado' | 'alto' | 'critico' }> = [
  { hasta: 25, categoria: 'bajo' },
  { hasta: 50, categoria: 'moderado' },
  { hasta: 75, categoria: 'alto' },
  { hasta: 100, categoria: 'critico' },
];

export const DIMENSION_WEIGHTS: Record<RiskDimension, { label: string; weight: number }> = {
  nosis_bcra: { label: 'Nosis / BCRA', weight: 25 },
  endeudamiento: { label: 'Endeudamiento y capacidad de pago', weight: 20 },
  liquidez_solvencia: { label: 'Liquidez y solvencia', weight: 15 },
  rentabilidad: { label: 'Rentabilidad y ventas', weight: 15 },
  ventas_post_balance: { label: 'Ventas y deuda post balance', weight: 10 },
  negocio_mercado: { label: 'Negocio y mercado', weight: 10 },
  calidad_informacion: { label: 'Calidad de la información', weight: 5 },
};

// ---------- Pérdida crediticia esperada (proxy transitorio) ----------
// Relación inversa y NO lineal con el score Nosis (1–999, más alto = mejor):
// la pérdida esperada crece cada vez más rápido a medida que baja el score.
// Índice relativo 0–100, no es un porcentaje de pérdida.
export const PCE_TRAMOS: Array<{ desde: number; pce: number }> = [
  { desde: 800, pce: 5 },
  { desde: 700, pce: 12 },
  { desde: 600, pce: 25 },
  { desde: 500, pce: 45 },
  { desde: 400, pce: 65 },
  { desde: 300, pce: 82 },
  { desde: 1, pce: 95 },
];

// ---------- Reglas de señales automáticas ----------
// Los parámetros numéricos que usa signals.ts. Cambiarlos cambia el puntaje.
export const SIGNAL_PARAMS = {
  bcra: {
    sit2: { severidad: 'alta', piso: 55 },
    sit3: { severidad: 'critica', piso: 75 },
    sit4omas: { severidad: 'critica', piso: 90 },
    historial24mSit2: { severidad: 'media' },
    historial24mSit3: { severidad: 'alta' },
  },
  cheques: { cantidadGrave: 5, pctVentasGrave: 1, pisoGrave: 60 },
  pce: { alta: 65, media: 45 },
  cruceNosis: { toleranciaPct: 10 },
  arca: { deudaSeveridad: 'alta', planesSeveridad: 'baja' },
  judicial: { juiciosEmbargosSeveridad: 'alta', pedidoQuiebra: { severidad: 'critica', piso: 80 } },
  deuda: {
    crecimientoPct: 50,
    brechaVsVentasPp: 20,
    crecimientoConVentasEnCaidaPct: 20,
    ebitdaNegativoPiso: 65,
    cortoPlazoShare: 0.7,
    pasivoPnMedia: 3,
    pasivoPnAlta: 5,
  },
  dscr: { criticoPiso: 65 },
  descalce: { exportacionCubrePct: 50, shareAlto: 0.3 },
  liquidez: { ciclosDiasAumento: 30 },
  rentabilidad: { caidaMargenEbitdaPp: 5, recpamSobreResultado: 0.5 },
  postBalance: { deudaShareMedia: 0.3, deudaShareAlta: 0.6 },
  auditor: {
    conSalvedades: { severidad: 'alta' },
    adversaOAbstencion: { severidad: 'critica', piso: 70 },
  },
} as const;

// Descripción legible de cada regla, en el orden de la página de política.
export type SignalRuleDoc = {
  dimension: RiskDimension;
  regla: string;
  severidad: SeveridadRiesgo | 'media / alta';
  piso: number | null;
};

const P = SIGNAL_PARAMS;
export const SIGNAL_RULES: SignalRuleDoc[] = [
  { dimension: 'nosis_bcra', regla: 'Peor situación BCRA actual = 2 (en cualquier entidad)', severidad: P.bcra.sit2.severidad, piso: P.bcra.sit2.piso },
  { dimension: 'nosis_bcra', regla: 'Peor situación BCRA actual = 3', severidad: P.bcra.sit3.severidad, piso: P.bcra.sit3.piso },
  { dimension: 'nosis_bcra', regla: 'Peor situación BCRA actual = 4 o 5', severidad: P.bcra.sit4omas.severidad, piso: P.bcra.sit4omas.piso },
  { dimension: 'nosis_bcra', regla: 'Situación 2 en los últimos 24 meses (hoy en 1)', severidad: P.bcra.historial24mSit2.severidad, piso: null },
  { dimension: 'nosis_bcra', regla: 'Situación 3 o peor en los últimos 24 meses (hoy mejor)', severidad: P.bcra.historial24mSit3.severidad, piso: null },
  { dimension: 'nosis_bcra', regla: `Cheques rechazados sin levantar: ${P.cheques.cantidadGrave} o más, o ≥ ${P.cheques.pctVentasGrave}% de las ventas → alta; menos → media; todos levantados → baja`, severidad: 'media / alta', piso: P.cheques.pisoGrave },
  { dimension: 'nosis_bcra', regla: `Pérdida esperada (proxy score Nosis) ≥ ${P.pce.alta} → alta; ≥ ${P.pce.media} → media`, severidad: 'media / alta', piso: null },
  { dimension: 'nosis_bcra', regla: `Deuda en Nosis difiere del balance en más de ${P.cruceNosis.toleranciaPct}% (alta si Nosis informa más)`, severidad: 'media / alta', piso: null },
  { dimension: 'nosis_bcra', regla: 'Deuda fiscal o previsional con ARCA', severidad: P.arca.deudaSeveridad, piso: null },
  { dimension: 'nosis_bcra', regla: 'Planes de pago vigentes con ARCA', severidad: P.arca.planesSeveridad, piso: null },
  { dimension: 'nosis_bcra', regla: 'Juicios o embargos informados', severidad: P.judicial.juiciosEmbargosSeveridad, piso: null },
  { dimension: 'nosis_bcra', regla: 'Pedidos de quiebra informados', severidad: P.judicial.pedidoQuiebra.severidad, piso: P.judicial.pedidoQuiebra.piso },
  { dimension: 'endeudamiento', regla: `DSCR < ${RATIO_THRESHOLDS.dscr.alerta}x: el flujo no alcanza para intereses + capital`, severidad: 'critica', piso: P.dscr.criticoPiso },
  { dimension: 'endeudamiento', regla: `DSCR entre ${RATIO_THRESHOLDS.dscr.alerta}x y ${RATIO_THRESHOLDS.dscr.sano}x`, severidad: 'alta', piso: null },
  { dimension: 'endeudamiento', regla: 'EBITDA negativo con deuda bancaria', severidad: 'critica', piso: P.deuda.ebitdaNegativoPiso },
  { dimension: 'endeudamiento', regla: `Deuda neta / EBITDA > ${RATIO_THRESHOLDS.deuda_neta_ebitda.alerta}x`, severidad: 'alta', piso: null },
  { dimension: 'endeudamiento', regla: `Cobertura de intereses < ${RATIO_THRESHOLDS.cobertura_intereses.alerta}x (alta si < 1x)`, severidad: 'media / alta', piso: null },
  { dimension: 'endeudamiento', regla: `Deuda bancaria crece > ${P.deuda.crecimientoPct}% y más de ${P.deuda.brechaVsVentasPp} p.p. por encima de las ventas`, severidad: 'alta', piso: null },
  { dimension: 'endeudamiento', regla: `Deuda bancaria crece > ${P.deuda.crecimientoConVentasEnCaidaPct}% con ventas en caída`, severidad: 'alta', piso: null },
  { dimension: 'endeudamiento', regla: `Más del ${P.deuda.cortoPlazoShare * 100}% de la deuda bancaria vence en 12 meses (riesgo de refinanciación)`, severidad: 'media', piso: null },
  { dimension: 'endeudamiento', regla: `Pasivo / PN > ${P.deuda.pasivoPnMedia}x (alta si > ${P.deuda.pasivoPnAlta}x)`, severidad: 'media / alta', piso: null },
  { dimension: 'endeudamiento', regla: `Descalce de moneda: deuda en moneda extranjera con exportaciones < ${P.descalce.exportacionCubrePct}% de las ventas (alta si la deuda en ME supera el ${P.descalce.shareAlto * 100}% de la deuda bancaria)`, severidad: 'media / alta', piso: null },
  { dimension: 'liquidez_solvencia', regla: 'Patrimonio neto negativo (quiebra técnica)', severidad: 'critica', piso: 85 },
  { dimension: 'liquidez_solvencia', regla: `Liquidez corriente < ${RATIO_THRESHOLDS.liquidez_corriente.alerta}x`, severidad: 'alta', piso: null },
  { dimension: 'liquidez_solvencia', regla: `Prueba ácida < ${RATIO_THRESHOLDS.liquidez_acida.alerta}x`, severidad: 'media', piso: null },
  { dimension: 'liquidez_solvencia', regla: `Ciclo de conversión de caja aumenta más de ${P.liquidez.ciclosDiasAumento} días`, severidad: 'media', piso: null },
  { dimension: 'liquidez_solvencia', regla: `Calidad de la ganancia (FCO / EBITDA) < ${RATIO_THRESHOLDS.calidad_ganancia.alerta * 100}%`, severidad: 'media', piso: null },
  { dimension: 'rentabilidad', regla: 'Caída de ventas (real si el balance está en moneda homogénea; nominal si no)', severidad: 'alta', piso: null },
  { dimension: 'rentabilidad', regla: 'Resultado neto negativo (alta si hay pérdidas en los dos ejercicios)', severidad: 'media / alta', piso: null },
  { dimension: 'rentabilidad', regla: `Caída del margen EBITDA de más de ${P.rentabilidad.caidaMargenEbitdaPp} p.p.`, severidad: 'media', piso: null },
  { dimension: 'rentabilidad', regla: `RECPAM mayor al ${P.rentabilidad.recpamSobreResultado * 100}% del resultado neto (el resultado depende del ajuste por inflación)`, severidad: 'media', piso: null },
  { dimension: 'ventas_post_balance', regla: 'Ventas post balance por debajo del mismo período del año anterior', severidad: 'alta', piso: null },
  { dimension: 'ventas_post_balance', regla: `Deuda bancaria tomada post balance > ${P.postBalance.deudaShareMedia * 100}% de la deuda al cierre (alta si > ${P.postBalance.deudaShareAlta * 100}%)`, severidad: 'media / alta', piso: null },
  { dimension: 'ventas_post_balance', regla: 'Deuda post balance en dólares', severidad: 'media', piso: null },
  { dimension: 'calidad_informacion', regla: 'Opinión del auditor con salvedades', severidad: P.auditor.conSalvedades.severidad, piso: null },
  { dimension: 'calidad_informacion', regla: 'Opinión del auditor adversa o abstención', severidad: P.auditor.adversaOAbstencion.severidad, piso: P.auditor.adversaOAbstencion.piso },
  { dimension: 'calidad_informacion', regla: 'Balance extraído que no cuadra (ecuación contable o subtotales)', severidad: 'alta', piso: null },
  { dimension: 'calidad_informacion', regla: 'Balance no expresado en moneda homogénea (RT 6)', severidad: 'media', piso: null },
  { dimension: 'calidad_informacion', regla: 'Sin informe Nosis', severidad: 'media', piso: null },
  { dimension: 'calidad_informacion', regla: 'Sin ejercicio comparativo', severidad: 'media', piso: null },
  { dimension: 'calidad_informacion', regla: 'Sin Memoria del Directorio', severidad: 'baja', piso: null },
];

// ---------- Criterios evaluados por el modelo (sin regla fija) ----------
export const MODEL_CRITERIA: string[] = [
  'Concentración de clientes o proveedores (más del 20–30% en uno solo), según la Memoria.',
  'Sector y su ciclo; contexto macro y regulatorio (análisis de mercado).',
  'Management, accionistas y antigüedad de la empresa; estructura societaria.',
  'Grupo económico: si los accionistas son sociedades, el riesgo debería medirse en conjunto.',
  'Destino de la deuda según la Memoria (capital de trabajo, inversión, cubrir pérdidas) y si calza con el plazo.',
  'Tendencia de los ratios entre ejercicios (más que el valor puntual), en especial el ciclo de caja.',
];

// ---------- Pendientes: requieren datos que hoy no entran a la app ----------
export const PENDING_ITEMS: Array<{ tema: string; detalle: string }> = [
  { tema: 'Comportamiento en el propio banco', detalle: 'Acreditaciones en cuenta vs. ventas declaradas y uso del descubierto (siempre al tope es señal). Requiere datos internos del banco.' },
  { tema: 'Estructura del crédito', detalle: 'Monto, destino y plazo solicitados, para verificar que calcen con el flujo (capital de trabajo a corto, inversión a largo). Requiere cargar la solicitud.' },
  { tema: 'Garantías', detalle: 'Aforo de prenda o hipoteca, aval de SGR, fianza de socios, cheques de terceros (dispersión y calidad de libradores). Segunda fuente de pago: nunca reemplaza a la primera.' },
  { tema: 'Graduación del crédito y fraccionamiento del riesgo', detalle: 'Límites frente al patrimonio del cliente y a la RPC del banco, según el texto ordenado vigente del BCRA. Requiere RPC y monto solicitado.' },
  { tema: 'Tendencia de 3 ejercicios', detalle: 'Hoy se analizan 2 ejercicios (el balance y su comparativo). Requiere cargar el balance anterior.' },
  { tema: 'Grupo económico consolidado', detalle: 'Medir el riesgo del grupo en conjunto requiere los balances de las sociedades vinculadas.' },
];

import type { RiskDimension, SeveridadRiesgo } from '../extraction/schemas';
import type { RatioKey } from '../ratios/calculations';

// ============================================================================
// POLÍTICA DE RIESGOS — fuente única de umbrales, pisos, pesos y tramos.
// La usan calculations.ts (semáforos), signals.ts (reglas), score.ts (puntaje)
// y la página "Política de riesgos" de la app, que la muestra tal cual.
//
// ESTADO: propuesta inicial, a validar con el área de Riesgos.
// Cualquier cambio acá se hace con tests (ver CLAUDE.md).
// ============================================================================

export const POLICY_STATUS = 'Propuesta inicial — pendiente de validación por Riesgos';

// Versión de la política (semver). Un test compara un hash de umbrales, señales,
// pesos y perfiles: si cambian, hay que subir la versión y anotar el cambio acá.
// Los casos evaluados guardan la versión y el perfil con el que se evaluaron.
export const POLICY_VERSION = '2.1.0';

export const POLICY_CHANGELOG: Array<{ version: string; fecha: string; cambios: string[] }> = [
  {
    version: '2.1.0',
    fecha: '2026-10-03',
    cambios: [
      'Perfil Financiera (no bancaria) con sub-segmentos (consumo, prendario / empresas, factoring, leasing): modelo propio de cartera, capital, fondeo, rentabilidad y concentración.',
      'Dimensión Calidad de cartera (peso 0 fuera de financieras) y etiquetas de dimensiones por perfil.',
      'Documentos sectoriales: reporte de mora (declarado por el cliente, no auditado; nunca baja un piso).',
    ],
  },
  {
    version: '2.0.0',
    fecha: '2026-10-03',
    cambios: [
      'Perfiles por rubro (agro, comercio, industria, construcción, servicios) sobre la base genérica, con confirmación del analista.',
      'Margen EBITDA con semáforo (genérico: sano > 10%, alerta ≥ 5%). Sin señal nueva: no cambia el puntaje.',
      'KPIs sectoriales calculados desde los EECC.',
    ],
  },
  { version: '1.0.0', fecha: '2026-05-01', cambios: ['Política única para todas las empresas (propuesta inicial).'] },
];

// ---------- Semáforo de ratios ----------
// mayor = mejor: sano si valor > sano; alerta si valor ≥ alerta; si no, crítico.
// menor = mejor: sano si valor ≤ sano; alerta si valor ≤ alerta; si no, crítico.
export type RatioThreshold = {
  label: string;
  mejorSi: 'mayor' | 'menor';
  sano: number;
  alerta: number;
  unidad: 'x' | '%' | 'pp';
  nota?: string;
  // true: el valor exacto del umbral cae en el tramo mejor (≥ / ≤). Lo usan los
  // ratios de financieras; los demás mantienen la regla estricta de siempre.
  inclusivo?: boolean;
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
  // Solo semáforo: no hay señal asociada, no cambia el puntaje.
  margen_ebitda: { label: 'Margen EBITDA', mejorSi: 'mayor', sano: 0.1, alerta: 0.05, unidad: '%' },
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
  // Solo financieras (peso 0 en el resto: no cambia ningún puntaje).
  calidad_cartera: { label: 'Calidad de cartera', weight: 0 },
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

// ---------- Supuestos de proyección (flujo de fondos para capacidad de repago) ----------
// Parámetros fijos que la pestaña Proyecciones usa como sugeridos cuando no
// salen de la extracción. Propuesta inicial, a validar con Riesgos.
export const PROJECTION_PARAMS = {
  horizonte: 3,
  tasaReal: 0.08,
  alicuota: 0.35,
  aniosAmortizacionNoCorriente: 2,
  aniosAmortizacionPostBalance: 2,
  // Crecimiento real sugerido acotado a este rango.
  crecimientoMin: -0.2,
  crecimientoMax: 0.15,
  estres: {
    crecimientoAnio1: -0.15,
    crecimientoSiguientes: 0,
    margenEbitdaDelta: -0.03, // p.p. sobre el margen del escenario Base
    tasaRealDelta: 0.04,      // p.p. sobre la tasa del escenario Base
    liberarCapitalTrabajo: false,
  },
  // DSCR que tiene que mantenerse para calcular el margen para deuda nueva.
  dscrObjetivoDeudaNueva: RATIO_THRESHOLDS.dscr.sano,
} as const;

// ============================================================================
// PERFILES POR RUBRO
// El analista confirma el rubro; el perfil efectivo es el genérico (todo lo de
// arriba) más los overrides del rubro. "generico" no cambia nada: da exactamente
// los resultados de la política única (test de regresión).
//
// ESTADO: propuesta pendiente de validación por Riesgos (umbrales, KPIs y textos).
// ============================================================================

export type RubroId = 'generico' | 'agro' | 'comercio' | 'industria' | 'construccion' | 'servicios' | 'financiera';
export type RubroDisponible = RubroId;
export const RUBROS: RubroDisponible[] = ['generico', 'agro', 'comercio', 'industria', 'construccion', 'servicios', 'financiera'];

// Sub-segmentos de financiera: definen los umbrales de mora.
export type SubSegmento = 'consumo' | 'prendario_empresas' | 'factoring' | 'leasing';
export const SUBSEGMENTOS: Array<{ id: SubSegmento; label: string; mora: { sano: number; alerta: number } }> = [
  { id: 'consumo', label: 'Consumo masivo', mora: { sano: 0.08, alerta: 0.15 } },
  { id: 'prendario_empresas', label: 'Prendario / empresas', mora: { sano: 0.05, alerta: 0.1 } },
  { id: 'factoring', label: 'Descuento de cheques / factoring', mora: { sano: 0.03, alerta: 0.06 } },
  { id: 'leasing', label: 'Leasing', mora: { sano: 0.04, alerta: 0.08 } },
];
export const subsegmentoLabel = (id: SubSegmento | null | undefined) => SUBSEGMENTOS.find(x => x.id === id)?.label ?? null;

// ---------- Documentos sectoriales (declarados por el cliente, no auditados) ----------
// Registro de tipos; qué admite cada perfil se define en el perfil.
export const DOCUMENTOS_SECTORIALES: Record<'reporte_mora', { label: string; descripcion: string }> = {
  reporte_mora: {
    label: 'Reporte de mora',
    descripcion: 'Cartera por tramo de atraso, previsiones y mora por producto a una fecha de corte.',
  },
};
export type TipoDocumento = keyof typeof DOCUMENTOS_SECTORIALES;

// SIGNAL_PARAMS con los números "abiertos" (no literales) para poder sobrescribirlos.
type Abrir<T> = T extends number ? number : T extends string ? T : { -readonly [K in keyof T]: Abrir<T[K]> };
export type SignalParams = Abrir<typeof SIGNAL_PARAMS>;
type ParcialProfundo<T> = { [K in keyof T]?: T[K] extends object ? ParcialProfundo<T[K]> : T[K] };

// Señales que se pueden desactivar por rubro (ids de signals.ts) y el ratio del
// que dependen: si el ratio "no aplica", su señal tampoco suma.
export const SENAL_DE_RATIO: Partial<Record<RatioKey, string>> = {
  liquidez_acida: 'prueba_acida_baja',
  calidad_ganancia: 'calidad_ganancia_baja',
  liquidez_corriente: 'liquidez_corriente_baja',
  deuda_neta_ebitda: 'deuda_neta_ebitda_alta',
  cobertura_intereses: 'cobertura_baja',
};

export type SectorProfile = {
  label: string;
  descripcion: string;
  variableCritica: string;
  // Orden en que la opinión tiene que leer los indicadores.
  kpisPrioritarios: RatioKey[];
  preguntasClave: string[];
  umbrales?: Partial<Record<RatioWithThreshold, { sano?: number; alerta?: number; nota?: string }>>;
  noAplica?: Partial<Record<RatioKey, string>>; // ratio → motivo
  senales?: ParcialProfundo<SignalParams>;
  senalesDesactivadas?: Array<{ id: string; motivo: string }>;
  pesos?: Partial<Record<RiskDimension, number>>; // el resultado tiene que sumar 100
  ajustes?: {
    // Construcción: liquidez corriente y pasivo / PN sin anticipos de clientes.
    excluirAnticiposClientes?: boolean;
    // Agro: el semáforo del margen EBITDA usa el promedio de los 2 ejercicios.
    margenEbitdaPromedio?: boolean;
  };
  // Documentos propios del rubro que se pueden cargar (y si son recomendados).
  documentosSectoriales?: Array<{ tipo: TipoDocumento; recomendado: boolean }>;
  // Modelo de análisis: 'financiera' usa cartera, capital, fondeo… en vez de EBITDA y DSCR.
  modelo?: 'productiva' | 'financiera';
  requiereSubsegmento?: boolean;
  // Umbrales de ratios propios del rubro (no existen en la base genérica).
  umbralesPropios?: Partial<Record<RatioKey, RatioThreshold>>;
  // Nombre de las dimensiones del puntaje en este perfil.
  etiquetasDimensiones?: Partial<Record<RiskDimension, string>>;
  // Agrupación de ratios en "Balance y Ratios" (si no, la de siempre).
  bloques?: Array<{ bloque: string; descripcion: string; ratios: RatioKey[] }>;
  // Instrucciones adicionales para la opinión (texto de política, no del prompt).
  instruccionesOpinion?: string[];
};

const KPIS_GENERICO: RatioKey[] = [
  'dscr', 'deuda_neta_ebitda', 'cobertura_intereses', 'calidad_ganancia',
  'liquidez_corriente', 'liquidez_acida', 'solvencia', 'roe',
];

export const SECTOR_PROFILES: Record<RubroDisponible, SectorProfile> = {
  generico: {
    label: 'Genérico',
    descripcion: 'Criterios generales, sin ajustes por rubro. Es la política única anterior a los perfiles.',
    variableCritica: 'Capacidad de pago: que el flujo operativo alcance para intereses y capital.',
    kpisPrioritarios: KPIS_GENERICO,
    preguntasClave: [
      '¿El flujo operativo alcanza para pagar intereses y capital (DSCR)?',
      '¿La deuda crece más rápido que las ventas o el EBITDA?',
      '¿La liquidez permite afrontar los vencimientos de corto plazo?',
    ],
  },
  agro: {
    label: 'Agropecuario',
    descripcion: 'Producción agrícola y ganadera. Ciclo anual atado a la cosecha; el stock de granos y hacienda funciona casi como caja.',
    variableCritica: 'Rinde (clima) × precio de los granos × costo de arrendamiento.',
    kpisPrioritarios: ['liquidez_corriente', 'bienes_cambio_deuda_cp', 'deuda_bancaria_ventas', 'deuda_cp_share', 'margen_ebitda_promedio'],
    preguntasClave: [
      '¿La deuda de corto plazo está cubierta por el stock de granos o hacienda?',
      '¿El vencimiento de la deuda calza con la cosecha?',
      '¿Qué pasa con una campaña mala (rinde o precio)?',
    ],
    umbrales: {
      deuda_ebitda: { sano: 3, alerta: 4.5 },
      deuda_neta_ebitda: { sano: 3, alerta: 4.5 },
    },
    noAplica: {
      liquidez_acida: 'Granos y hacienda son casi caja: excluirlos del activo corriente distorsiona la liquidez.',
      calidad_ganancia: 'La retención de granos como reserva de valor baja el flujo operativo sin ser un problema de cobro.',
    },
    senales: { deuda: { cortoPlazoShare: 0.9 }, liquidez: { ciclosDiasAumento: 60 } },
    ajustes: { margenEbitdaPromedio: true },
  },
  comercio: {
    label: 'Comercio y distribución',
    descripcion: 'Compra y venta de bienes, mayorista o minorista. Margen chico y rotación alta: el capital de trabajo es el negocio.',
    variableCritica: 'El consumo y el crédito que da a sus clientes.',
    kpisPrioritarios: ['dias_de_stock', 'dias_de_cobro', 'dias_de_pago', 'ciclo_conversion_caja', 'margen_bruto', 'margen_ebitda', 'deuda_comercial_bancaria'],
    preguntasClave: [
      '¿El ciclo de caja se está alargando?',
      '¿Financia a sus clientes con deuda bancaria?',
      '¿El margen aguanta una caída de volumen?',
    ],
    umbrales: {
      liquidez_acida: { sano: 0.8, alerta: 0.5 },
      deuda_ebitda: { sano: 2, alerta: 3 },
      deuda_neta_ebitda: { sano: 2, alerta: 3 },
      margen_ebitda: { sano: 0.05, alerta: 0.02 },
    },
    senales: { deuda: { pasivoPnMedia: 4, pasivoPnAlta: 6 }, liquidez: { ciclosDiasAumento: 20 } },
  },
  industria: {
    label: 'Industria',
    descripcion: 'Fabricación y transformación. Intensiva en capital: importa si reinvierte y cuánto depende de insumos y del tipo de cambio.',
    variableCritica: 'Costo de insumos / tipo de cambio y competencia importada.',
    kpisPrioritarios: ['margen_bruto', 'margen_ebitda', 'dscr', 'deuda_ebitda', 'capex_depreciacion', 'deuda_me_share'],
    preguntasClave: [
      '¿Reinvierte o consume sus activos (capex vs. depreciación)?',
      '¿Tiene deuda en dólares sin ingresos en dólares?',
      '¿El margen viene cayendo?',
    ],
    umbrales: {
      deuda_ebitda: { sano: 3, alerta: 4.5 },
      deuda_neta_ebitda: { sano: 3, alerta: 4.5 },
    },
  },
  construccion: {
    label: 'Construcción',
    descripcion: 'Obras públicas y privadas. Se financia con anticipos y certificados: la liquidez se mide sin los anticipos de clientes.',
    variableCritica: 'Continuidad de la obra y cobro de certificados.',
    kpisPrioritarios: ['dias_de_cobro', 'liquidez_corriente_sin_anticipos', 'anticipos_ventas', 'margen_ebitda', 'deuda_neta_ebitda'],
    preguntasClave: [
      '¿Depende de anticipos de clientes para financiarse?',
      '¿Cuánto tarda en cobrar los certificados?',
      '¿Qué pasa si se frena una obra grande?',
    ],
    umbrales: { margen_ebitda: { sano: 0.08, alerta: 0.04 } },
    senales: { deuda: { cortoPlazoShare: 0.8 }, liquidez: { ciclosDiasAumento: 45 } },
    ajustes: { excluirAnticiposClientes: true },
  },
  servicios: {
    label: 'Servicios',
    descripcion: 'Prestación de servicios con pocos activos. El respaldo es el flujo y la cartera de clientes, no el patrimonio.',
    variableCritica: 'Clientes y contratos.',
    kpisPrioritarios: ['margen_ebitda', 'dscr', 'calidad_ganancia', 'dias_de_cobro', 'pn_activo'],
    preguntasClave: [
      '¿Depende de pocos clientes?',
      '¿Qué respaldo patrimonial tiene, con pocos activos?',
      '¿El flujo es recurrente (contratos, abonos)?',
    ],
    umbrales: {
      deuda_ebitda: { sano: 2, alerta: 3 },
      deuda_neta_ebitda: { sano: 2, alerta: 3 },
      margen_ebitda: { sano: 0.15, alerta: 0.08 },
    },
    pesos: { negocio_mercado: 15, liquidez_solvencia: 10 },
  },
  financiera: {
    label: 'Financiera (no bancaria)',
    descripcion: 'Financieras no bancarias: consumo, prendarios, descuento de cheques / factoring, leasing y préstamos a empresas. El pasivo alto es su negocio: se analizan la cartera, el capital y el fondeo, no el EBITDA ni el DSCR.',
    variableCritica: 'Calidad de la cartera (mora) y costo / disponibilidad del fondeo.',
    modelo: 'financiera',
    requiereSubsegmento: true,
    kpisPrioritarios: ['mora', 'cobertura', 'pn_ajustado', 'liquidez_90d', 'concentracion_fondeo', 'cargo_sobre_resultado', 'pn_activo', 'roa'],
    preguntasClave: [
      '¿La mora está bien previsionada?',
      '¿Cuánto del patrimonio se comería la mora no cubierta?',
      '¿Puede renovar su fondeo si se le corta la fuente principal?',
      '¿La rentabilidad aguanta que se duplique la mora?',
      '¿La cartera crece más rápido que su patrimonio?',
    ],
    noAplica: {
      liquidez_corriente: 'En una financiera el activo y el pasivo corriente son su negocio: la liquidez se mide a 90 días.',
      liquidez_acida: 'No tiene bienes de cambio: la prueba ácida no agrega información.',
      solvencia: 'El apalancamiento alto es propio del negocio: se mide con PN / activo y el PN ajustado por mora.',
      deuda_ebitda: 'Los intereses son su costo de mercadería y la deuda se renueva: el EBITDA no mide capacidad de repago.',
      deuda_neta_ebitda: 'Idem deuda / EBITDA: no aplica a una financiera.',
      cobertura_intereses: 'Los intereses pagados son su costo de fondeo, no un servicio de deuda.',
      dscr: 'La deuda se renueva con la cartera: el DSCR no tiene sentido.',
      calidad_ganancia: 'El flujo operativo incluye el crecimiento de la cartera: no mide calidad de la ganancia.',
      margen_ebitda: 'El margen relevante es el financiero (ingresos − egresos financieros).',
    },
    senalesDesactivadas: [
      { id: 'dscr_menor_1', motivo: 'DSCR no aplica a financieras' },
      { id: 'dscr_ajustado', motivo: 'DSCR no aplica a financieras' },
      { id: 'ebitda_negativo_con_deuda', motivo: 'EBITDA no aplica a financieras' },
      { id: 'deuda_crecimiento_desmedido', motivo: 'Crecimiento de deuda vs. ventas no aplica: la deuda fondea la cartera' },
      { id: 'deuda_sube_ventas_bajan', motivo: 'Crecimiento de deuda vs. ventas no aplica: la deuda fondea la cartera' },
      { id: 'deuda_corto_plazo', motivo: 'Deuda a 12 meses no aplica: se mide la liquidez a 90 días' },
      { id: 'apalancamiento_alto', motivo: 'Pasivo / PN genérico no aplica: se mide con umbrales de financiera' },
      { id: 'ciclo_caja_crece', motivo: 'Ciclo de caja no aplica a financieras' },
      { id: 'ventas_caen', motivo: 'Caída de ventas no aplica: se mide la evolución de la cartera' },
      { id: 'margen_ebitda_cae', motivo: 'Margen EBITDA no aplica a financieras' },
    ],
    // Mora: depende del sub-segmento (SUBSEGMENTOS); acá el de prendario como referencia.
    umbralesPropios: {
      mora: { label: 'Mora (cartera > 90 días / cartera)', mejorSi: 'menor', sano: 0.05, alerta: 0.1, unidad: '%', inclusivo: true },
      cobertura: { label: 'Cobertura (previsiones / cartera > 90 días)', mejorSi: 'mayor', sano: 1, alerta: 0.7, unidad: '%', inclusivo: true },
      cargo_sobre_resultado: { label: 'Cargo por incobrabilidad / resultado antes de previsiones', mejorSi: 'menor', sano: 0.5, alerta: 0.8, unidad: '%', inclusivo: true },
      pn_activo: { label: 'PN / activo', mejorSi: 'mayor', sano: 0.2, alerta: 0.12, unidad: '%', inclusivo: true },
      endeudamiento: { label: 'Pasivo / PN', mejorSi: 'menor', sano: 4, alerta: 6, unidad: 'x', inclusivo: true },
      liquidez_90d: { label: 'Liquidez a 90 días', mejorSi: 'mayor', sano: 1.2, alerta: 1, unidad: 'x', inclusivo: true },
      concentracion_fondeo: { label: 'Concentración de fondeo (mayor fuente / total)', mejorSi: 'menor', sano: 0.5, alerta: 0.7, unidad: '%', inclusivo: true },
      roa: { label: 'ROA', mejorSi: 'mayor', sano: 0.02, alerta: 0, unidad: '%', inclusivo: true },
      eficiencia: { label: 'Eficiencia (gastos / margen financiero)', mejorSi: 'menor', sano: 0.6, alerta: 0.75, unidad: '%', inclusivo: true },
      top10_sobre_cartera: { label: 'Top 10 deudores / cartera', mejorSi: 'menor', sano: 0.2, alerta: 0.35, unidad: '%', inclusivo: true },
      brecha_crecimiento_cartera_pn: { label: 'Crecimiento de cartera − crecimiento del PN', mejorSi: 'menor', sano: 0.2, alerta: 0.4, unidad: 'pp', inclusivo: true },
    },
    pesos: {
      nosis_bcra: 20, calidad_cartera: 30, endeudamiento: 15, liquidez_solvencia: 15,
      rentabilidad: 10, ventas_post_balance: 0, negocio_mercado: 5, calidad_informacion: 5,
    },
    etiquetasDimensiones: {
      endeudamiento: 'Capital y apalancamiento',
      liquidez_solvencia: 'Fondeo y liquidez',
      rentabilidad: 'Rentabilidad',
    },
    bloques: [
      { bloque: 'Calidad de cartera', descripcion: 'Mora, previsiones y cuánto cuesta la incobrabilidad.', ratios: ['cartera_financiera', 'mora', 'cobertura', 'irregular_no_previsionada', 'cargo_sobre_resultado'] },
      { bloque: 'Capital', descripcion: 'Patrimonio real después de la mora no cubierta.', ratios: ['pn_ajustado', 'pn_ajustado_sobre_pn', 'pn_activo', 'endeudamiento', 'brecha_crecimiento_cartera_pn'] },
      { bloque: 'Fondeo y liquidez', descripcion: 'Si puede pagar lo que vence y de quién depende para fondearse.', ratios: ['liquidez_90d', 'concentracion_fondeo'] },
      { bloque: 'Rentabilidad', descripcion: 'Si el negocio deja resultado después de la mora y de la estructura.', ratios: ['roa', 'roe', 'eficiencia'] },
      { bloque: 'Concentración', descripcion: 'Dependencia de pocos deudores.', ratios: ['top10_sobre_cartera'] },
    ],
    documentosSectoriales: [{ tipo: 'reporte_mora', recomendado: true }],
    instruccionesOpinion: [
      'Orden de análisis: calidad de cartera → capital → fondeo y liquidez → rentabilidad → concentración.',
      'Nunca critiques el apalancamiento con la vara de una empresa productiva: el pasivo alto es el negocio de una financiera. Usá PN / activo, pasivo / PN de financiera y el PN ajustado.',
      'El reporte de mora es información declarada por el cliente, no auditada: decilo, y señalá si el cruce con el balance no cierra.',
      'Hacé explícitos en la lectura integral el sub-segmento, la fuente de la mora (reporte o balance) y su fecha de corte.',
      'Si no hay reporte de mora, pedilo en informacion_faltante.',
      'Puntuá también la dimensión calidad_cartera.',
    ],
  },
};

// Parámetros de las señales propias de financieras (la mora usa el umbral de
// alerta del sub-segmento).
export const SIGNAL_PARAMS_FINANCIERA = {
  coberturaMinima: 0.7,
  pnAjustadoMinimoSobrePn: 0.8,
  pnAjustadoNegativoPiso: 85,
  cargoSobreResultadoMaximo: 0.8,
  liquidez90Minima: 1,
  concentracionFondeoMaxima: 0.7,
  brechaCarteraPnMaxima: 0.4,
} as const;

// Perfil efectivo: genérico + overrides del rubro. Es lo que usan cálculos,
// señales y puntaje, y lo que se guarda como foto en el caso evaluado.
export type PerfilEfectivo = {
  rubro: RubroDisponible;
  subsegmento: SubSegmento | null;
  version: string;
  label: string;
  descripcion: string;
  variableCritica: string;
  modelo: 'productiva' | 'financiera';
  kpisPrioritarios: RatioKey[];
  preguntasClave: string[];
  // Umbrales genéricos (con overrides) + los propios del rubro.
  umbrales: Record<RatioWithThreshold, RatioThreshold> & Partial<Record<RatioKey, RatioThreshold>>;
  noAplica: Partial<Record<RatioKey, string>>;
  senales: SignalParams;
  senalesFinanciera: typeof SIGNAL_PARAMS_FINANCIERA | null;
  senalesDesactivadas: Array<{ id: string; motivo: string }>;
  pesos: Record<RiskDimension, number>;
  etiquetasDimensiones: Record<RiskDimension, string>;
  bloques: SectorProfile['bloques'] | null;
  documentos: NonNullable<SectorProfile['documentosSectoriales']>;
  instruccionesOpinion: string[];
  ajustes: NonNullable<SectorProfile['ajustes']>;
};

const fusionar = <T>(base: T, over: unknown): T => {
  if (over === undefined || over === null || typeof over !== 'object') return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) ? fusionar(out[k], v) : v;
  }
  return out as T;
};

export function perfilEfectivo(rubro: RubroDisponible = 'generico', subsegmento: SubSegmento | null = null): PerfilEfectivo {
  const p = SECTOR_PROFILES[rubro];
  const base = Object.fromEntries(
    (Object.keys(RATIO_THRESHOLDS) as RatioWithThreshold[]).map(k => [k, { ...RATIO_THRESHOLDS[k], ...(p.umbrales?.[k] ?? {}) }]),
  ) as Record<RatioWithThreshold, RatioThreshold>;
  const propios: Partial<Record<RatioKey, RatioThreshold>> = JSON.parse(JSON.stringify(p.umbralesPropios ?? {}));
  // Financiera: la mora depende del sub-segmento.
  const sub = p.requiereSubsegmento ? subsegmento : null;
  const umbralSub = SUBSEGMENTOS.find(x => x.id === sub)?.mora;
  if (umbralSub && propios.mora) propios.mora = { ...propios.mora, ...umbralSub };
  const umbrales = { ...base, ...propios } as PerfilEfectivo['umbrales'];

  const noAplica = { ...(p.noAplica ?? {}) };
  const desactivadas = [
    ...Object.entries(noAplica).flatMap(([ratio, motivo]) => {
      const id = SENAL_DE_RATIO[ratio as RatioKey];
      return id ? [{ id, motivo: `${RATIO_LABEL_CORTO[ratio as RatioKey] ?? ratio} no aplica: ${motivo}` }] : [];
    }),
    ...(p.senalesDesactivadas ?? []),
  ];
  const dims = Object.keys(DIMENSION_WEIGHTS) as RiskDimension[];
  const pesos = Object.fromEntries(dims.map(d => [d, p.pesos?.[d] ?? DIMENSION_WEIGHTS[d].weight])) as Record<RiskDimension, number>;
  const etiquetasDimensiones = Object.fromEntries(
    dims.map(d => [d, p.etiquetasDimensiones?.[d] ?? DIMENSION_WEIGHTS[d].label]),
  ) as Record<RiskDimension, string>;
  return {
    rubro,
    subsegmento: sub,
    version: POLICY_VERSION,
    label: p.label,
    descripcion: p.descripcion,
    variableCritica: p.variableCritica,
    modelo: p.modelo ?? 'productiva',
    kpisPrioritarios: [...p.kpisPrioritarios],
    preguntasClave: [...p.preguntasClave],
    umbrales,
    noAplica,
    senales: fusionar(JSON.parse(JSON.stringify(SIGNAL_PARAMS)) as SignalParams, p.senales),
    senalesFinanciera: p.modelo === 'financiera' ? { ...SIGNAL_PARAMS_FINANCIERA } : null,
    senalesDesactivadas: desactivadas,
    pesos,
    etiquetasDimensiones,
    bloques: p.bloques ? JSON.parse(JSON.stringify(p.bloques)) : null,
    documentos: [...(p.documentosSectoriales ?? [])],
    instruccionesOpinion: [...(p.instruccionesOpinion ?? [])],
    ajustes: { ...(p.ajustes ?? {}) },
  };
}

// Nombres cortos de los ratios para avisos y para la página de política.
export const RATIO_LABEL_CORTO: Partial<Record<RatioKey, string>> = {
  liquidez_corriente: 'Liquidez corriente',
  liquidez_acida: 'Prueba ácida',
  liquidez_inmediata: 'Liquidez inmediata',
  solvencia: 'Solvencia',
  deuda_ebitda: 'Deuda / EBITDA',
  deuda_neta_ebitda: 'Deuda neta / EBITDA',
  cobertura_intereses: 'Cobertura de intereses',
  dscr: 'DSCR',
  calidad_ganancia: 'Calidad de la ganancia',
  margen_ebitda: 'Margen EBITDA',
  margen_bruto: 'Margen bruto',
  roe: 'ROE',
  dias_de_stock: 'Días de stock',
  dias_de_cobro: 'Días de cobro',
  dias_de_pago: 'Días de pago',
  ciclo_conversion_caja: 'Ciclo de caja',
  bienes_cambio_deuda_cp: 'Bienes de cambio / deuda bancaria corriente',
  deuda_bancaria_ventas: 'Deuda bancaria / ventas',
  deuda_cp_share: 'Deuda bancaria que vence en 12 meses',
  margen_ebitda_promedio: 'Margen EBITDA promedio 2 ejercicios',
  deuda_comercial_bancaria: 'Deuda comercial / deuda bancaria',
  capex_depreciacion: 'Capex / depreciación',
  deuda_me_share: 'Deuda en moneda extranjera / deuda bancaria',
  liquidez_corriente_sin_anticipos: 'Liquidez corriente sin anticipos',
  anticipos_ventas: 'Anticipos de clientes / ventas',
  pn_activo: 'PN / activo',
  endeudamiento: 'Pasivo / PN',
  roa: 'ROA',
  mora: 'Mora',
  cobertura: 'Cobertura de la mora',
  irregular_no_previsionada: 'Cartera irregular no previsionada',
  pn_ajustado: 'PN ajustado',
  pn_ajustado_sobre_pn: 'PN ajustado / PN',
  cargo_sobre_resultado: 'Cargo / resultado antes de previsiones',
  liquidez_90d: 'Liquidez a 90 días',
  concentracion_fondeo: 'Concentración de fondeo',
  eficiencia: 'Eficiencia',
  top10_sobre_cartera: 'Top 10 deudores / cartera',
  brecha_crecimiento_cartera_pn: 'Crecimiento cartera − PN',
  cartera_financiera: 'Cartera',
};

// ---------- Sugerencia de rubro (determinística, sobre la actividad) ----------
// Se busca sobre el texto en minúscula y sin acentos. "fuertes" decide; las
// "debiles" ("servicio", "venta") solo cuentan si no hubo ninguna fuerte.
// "excluir": frases que anulan una coincidencia (ej. "obra social").
// El analista siempre confirma: esto es solo una sugerencia.
export const SUGERENCIA_RUBRO: {
  prioridad: Array<Exclude<RubroDisponible, 'generico'>>;
  reglas: Record<Exclude<RubroDisponible, 'generico'>, { fuertes: string[]; debiles?: string[]; excluir?: string[] }>;
} = {
  prioridad: ['financiera', 'construccion', 'agro', 'industria', 'comercio', 'servicios'],
  reglas: {
    financiera: {
      fuertes: ['financier', 'credito', 'prestamo', 'servicios financieros', 'factoring', 'leasing', 'descuento de cheques', 'mutuo', 'fideicomiso financiero'],
      excluir: ['credito fiscal', 'creditos fiscales'],
    },
    construccion: {
      fuertes: ['construccion', 'obra', 'obras', 'edific', 'vial', 'ingenieria civil'],
      excluir: ['obra social', 'obras sociales', 'mano de obra'],
    },
    agro: {
      fuertes: ['agricol', 'ganader', 'cereal', 'grano', 'oleagin', 'hacienda', 'tambo', 'cultivo', 'semilla', 'forraj', 'frutic'],
    },
    industria: {
      fuertes: ['fabricacion', 'elaboracion', 'manufactur', 'industri'],
    },
    comercio: {
      fuertes: ['por mayor', 'mayorista', 'por menor', 'minorista', 'comercializ', 'distribu', 'comercio'],
      debiles: ['venta'],
      excluir: ['distribucion de energia', 'distribucion de gas', 'distribucion electrica', 'distribucion de agua'],
    },
    servicios: {
      fuertes: [],
      debiles: ['servicio'],
    },
  },
};

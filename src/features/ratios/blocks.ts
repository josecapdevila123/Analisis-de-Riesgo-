import { RatioKey } from './calculations';
import type { PerfilEfectivo } from '../risk/policy';

// Agrupación de ratios por bloque, compartida por la pestaña Balance y Ratios,
// el resumen y el informe PDF (antes estaba duplicada en cada uno).

export type RatioKind = 'x' | 'pct' | 'dias' | 'monto';

export type RatioSpec = { key: RatioKey; name: string; kind: RatioKind; formula: string };

export const RATIO_BLOCKS: Array<{ bloque: string; descripcion: string; ratios: RatioSpec[] }> = [
  {
    bloque: 'Capacidad de pago',
    descripcion: 'Si el flujo alcanza para pagar intereses y capital.',
    ratios: [
      { key: 'dscr', name: 'DSCR (servicio de deuda)', kind: 'x', formula: '(EBITDA − capex mant. − impuestos) / (intereses + deuda bancaria corriente)' },
      { key: 'deuda_neta_ebitda', name: 'Deuda neta / EBITDA', kind: 'x', formula: '(Deuda bancaria − caja y bancos) / EBITDA' },
      { key: 'cobertura_intereses', name: 'Cobertura de intereses', kind: 'x', formula: 'EBITDA / gastos financieros' },
      { key: 'calidad_ganancia', name: 'Calidad de la ganancia', kind: 'pct', formula: 'Flujo operativo / EBITDA' },
    ],
  },
  {
    bloque: 'Liquidez',
    descripcion: 'Capacidad de cubrir el corto plazo.',
    ratios: [
      { key: 'liquidez_corriente', name: 'Liquidez corriente', kind: 'x', formula: 'Activo corriente / pasivo corriente' },
      { key: 'liquidez_acida', name: 'Prueba ácida', kind: 'x', formula: '(Activo corriente − bienes de cambio) / pasivo corriente' },
      { key: 'liquidez_inmediata', name: 'Liquidez inmediata', kind: 'x', formula: 'Caja y bancos / pasivo corriente' },
      { key: 'capital_de_trabajo', name: 'Capital de trabajo', kind: 'monto', formula: 'Activo corriente − pasivo corriente' },
      { key: 'ktno', name: 'KTNO', kind: 'monto', formula: 'Créditos por ventas + bienes de cambio − deudas comerciales' },
    ],
  },
  {
    bloque: 'Rentabilidad',
    descripcion: 'Márgenes y retorno sobre patrimonio y activos.',
    ratios: [
      { key: 'margen_bruto', name: 'Margen bruto', kind: 'pct', formula: 'Resultado bruto / ventas' },
      { key: 'margen_ebitda', name: 'Margen EBITDA', kind: 'pct', formula: 'EBITDA / ventas' },
      { key: 'margen_neto', name: 'Margen neto (rentabilidad s/ventas)', kind: 'pct', formula: 'Resultado neto / ventas' },
      { key: 'roe', name: 'ROE', kind: 'pct', formula: 'Resultado neto / patrimonio neto' },
      { key: 'roa', name: 'ROA', kind: 'pct', formula: 'Resultado neto / activo total' },
    ],
  },
  {
    bloque: 'Endeudamiento y solvencia',
    descripcion: 'Nivel, estructura y evolución de la deuda.',
    ratios: [
      { key: 'deuda_bancaria_total', name: 'Deuda bancaria total', kind: 'monto', formula: 'Deuda bancaria corriente + no corriente' },
      { key: 'deuda_ebitda', name: 'Deuda / EBITDA', kind: 'x', formula: 'Deuda bancaria / EBITDA' },
      { key: 'deuda_financiera_pn', name: 'Deuda financiera / PN', kind: 'x', formula: 'Deuda bancaria / patrimonio neto' },
      { key: 'endeudamiento', name: 'Endeudamiento total (pasivo / PN)', kind: 'x', formula: 'Pasivo total / patrimonio neto' },
      { key: 'solvencia', name: 'Solvencia (PN / pasivo)', kind: 'x', formula: 'Patrimonio neto / pasivo total' },
      { key: 'deuda_dias_ventas', name: 'Deuda en días de venta', kind: 'dias', formula: 'Deuda bancaria / ventas × 365' },
      { key: 'autofinanciamiento', name: 'Autofinanciamiento', kind: 'pct', formula: 'Flujo operativo / deuda bancaria' },
    ],
  },
  {
    bloque: 'Eficiencia operativa',
    descripcion: 'Ciclo de cobro, stock y pago.',
    ratios: [
      { key: 'dias_de_cobro', name: 'Días de cobro', kind: 'dias', formula: 'Créditos por ventas / ventas × 365' },
      { key: 'dias_de_stock', name: 'Días de stock', kind: 'dias', formula: 'Bienes de cambio / costo de ventas × 365' },
      { key: 'dias_de_pago', name: 'Días de pago', kind: 'dias', formula: 'Deudas comerciales / costo de ventas × 365' },
      { key: 'ciclo_conversion_caja', name: 'Ciclo de conversión de caja', kind: 'dias', formula: 'Días de cobro + días de stock − días de pago' },
      { key: 'indice_inmovilizacion', name: 'Índice de inmovilización', kind: 'pct', formula: 'Activo no corriente / activo total' },
    ],
  },
];

// ---------- Perfiles por rubro ----------
// Fórmulas de los KPIs sectoriales (los usa el bloque "Prioritarios del rubro").
export const SECTOR_KPI_SPECS: Partial<Record<RatioKey, RatioSpec>> = {
  bienes_cambio_deuda_cp: { key: 'bienes_cambio_deuda_cp', name: 'Bienes de cambio / deuda bancaria corriente', kind: 'x', formula: 'Bienes de cambio / deuda bancaria corriente' },
  deuda_bancaria_ventas: { key: 'deuda_bancaria_ventas', name: 'Deuda bancaria / ventas', kind: 'pct', formula: 'Deuda bancaria / ventas' },
  deuda_cp_share: { key: 'deuda_cp_share', name: 'Deuda que vence en 12 meses', kind: 'pct', formula: 'Deuda bancaria corriente / deuda bancaria total' },
  margen_ebitda_promedio: { key: 'margen_ebitda_promedio', name: 'Margen EBITDA promedio 2 ejercicios', kind: 'pct', formula: '(Margen EBITDA actual + anterior) / 2' },
  deuda_comercial_bancaria: { key: 'deuda_comercial_bancaria', name: 'Deuda comercial / deuda bancaria', kind: 'x', formula: 'Deudas comerciales / deuda bancaria' },
  capex_depreciacion: { key: 'capex_depreciacion', name: 'Capex / depreciación', kind: 'x', formula: 'Pagos por bienes de uso / depreciación (> 1: reinvierte)' },
  deuda_me_share: { key: 'deuda_me_share', name: 'Deuda en moneda extranjera', kind: 'pct', formula: 'Deuda financiera en ME / deuda bancaria' },
  anticipos_ventas: { key: 'anticipos_ventas', name: 'Anticipos de clientes / ventas', kind: 'pct', formula: 'Anticipos de clientes (pasivo) / ventas' },
  liquidez_corriente_sin_anticipos: { key: 'liquidez_corriente_sin_anticipos', name: 'Liquidez corriente sin anticipos', kind: 'x', formula: 'Activo corriente / (pasivo corriente − anticipos de clientes)' },
  pn_activo: { key: 'pn_activo', name: 'PN / activo', kind: 'pct', formula: 'Patrimonio neto / activo total' },
  // Financieras (fuente de mora y previsiones: reporte de mora si está; si no, balance)
  cartera_financiera: { key: 'cartera_financiera', name: 'Cartera', kind: 'monto', formula: 'Préstamos y créditos financieros, brutos de previsiones' },
  mora: { key: 'mora', name: 'Mora', kind: 'pct', formula: 'Cartera con más de 90 días de atraso / cartera total' },
  cobertura: { key: 'cobertura', name: 'Cobertura de la mora', kind: 'pct', formula: 'Previsiones / cartera con más de 90 días' },
  irregular_no_previsionada: { key: 'irregular_no_previsionada', name: 'Cartera irregular no previsionada', kind: 'monto', formula: 'máx(0, cartera > 90 días − previsiones)' },
  cargo_sobre_resultado: { key: 'cargo_sobre_resultado', name: 'Cargo / resultado antes de previsiones', kind: 'pct', formula: 'Cargo por incobrabilidad / (ingresos fin. − egresos fin. − gastos de estructura + cargo)' },
  pn_ajustado: { key: 'pn_ajustado', name: 'PN ajustado', kind: 'monto', formula: 'PN − (cartera > 90 días − previsiones)' },
  pn_ajustado_sobre_pn: { key: 'pn_ajustado_sobre_pn', name: 'PN ajustado / PN', kind: 'pct', formula: 'PN ajustado / patrimonio neto' },
  liquidez_90d: { key: 'liquidez_90d', name: 'Liquidez a 90 días', kind: 'x', formula: '(Caja + inversiones corrientes + créditos a vencer ≤ 90 días) / pasivos a vencer ≤ 90 días' },
  concentracion_fondeo: { key: 'concentracion_fondeo', name: 'Concentración de fondeo', kind: 'pct', formula: 'Mayor fuente de fondeo / fondeo total' },
  eficiencia: { key: 'eficiencia', name: 'Eficiencia', kind: 'pct', formula: 'Gastos de administración y comercialización / (ingresos fin. − egresos fin.)' },
  top10_sobre_cartera: { key: 'top10_sobre_cartera', name: 'Top 10 deudores / cartera', kind: 'pct', formula: 'Monto de los 10 principales deudores (carga manual) / cartera' },
  brecha_crecimiento_cartera_pn: { key: 'brecha_crecimiento_cartera_pn', name: 'Crecimiento cartera − PN (p.p.)', kind: 'pct', formula: 'Variación de la cartera − variación del PN' },
  endeudamiento: { key: 'endeudamiento', name: 'Pasivo / PN', kind: 'x', formula: 'Pasivo total / patrimonio neto' },
  roa: { key: 'roa', name: 'ROA', kind: 'pct', formula: 'Resultado neto / activo total' },
  roe: { key: 'roe', name: 'ROE', kind: 'pct', formula: 'Resultado neto / patrimonio neto' },
};

const specDe = (key: RatioKey): RatioSpec | null =>
  RATIO_BLOCKS.flatMap(b => b.ratios).find(r => r.key === key) ?? SECTOR_KPI_SPECS[key] ?? null;

export type RatioSpecConPerfil = RatioSpec & { noAplica?: string };
export type BloqueConPerfil = { bloque: string; descripcion: string; ratios: RatioSpecConPerfil[]; colapsado?: boolean };

// Bloques para un perfil: primero los KPIs prioritarios del rubro (en el orden
// en que los lee la opinión) y después los bloques de siempre. Los ratios que
// no aplican llevan su motivo (se muestran "No aplica", sin semáforo).
export function bloquesDelPerfil(perfil: PerfilEfectivo): BloqueConPerfil[] {
  const marcar = (r: RatioSpec): RatioSpecConPerfil => (perfil.noAplica[r.key] ? { ...r, noAplica: perfil.noAplica[r.key] } : r);
  const prioritarios = perfil.kpisPrioritarios.map(specDe).filter((r): r is RatioSpec => r !== null).map(marcar);
  const bloquePrioritarios = { bloque: `Prioritarios · ${perfil.label}`, descripcion: perfil.variableCritica, ratios: prioritarios };

  // Perfiles con agrupación propia (financiera: 5 ejes). Los ratios de siempre
  // que no aplican van al final, colapsados.
  if (perfil.bloques) {
    const propios = perfil.bloques.map(b => ({
      bloque: b.bloque,
      descripcion: b.descripcion,
      ratios: b.ratios.map(k => SECTOR_KPI_SPECS[k] ?? specDe(k)).filter((r): r is RatioSpec => !!r).map(marcar),
    }));
    const usados = new Set(perfil.bloques.flatMap(b => b.ratios));
    const noAplican = RATIO_BLOCKS.flatMap(b => b.ratios).filter(r => !usados.has(r.key) && perfil.noAplica[r.key]).map(marcar);
    return [
      bloquePrioritarios,
      ...propios,
      { bloque: 'Ratios de empresa productiva (no aplican)', descripcion: 'Se calculan pero no se evalúan en este rubro.', ratios: noAplican, colapsado: true },
    ];
  }
  return [bloquePrioritarios, ...RATIO_BLOCKS.map(b => ({ ...b, ratios: b.ratios.map(marcar) }))];
}

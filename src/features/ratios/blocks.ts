import { RatioKey } from './calculations';

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

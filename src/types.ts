export interface AccountItem {
  rubro: string;
  monto: number | null;
}

export interface AssetLiabilityGroup {
  total: number | null;
  detalles: AccountItem[];
}

export interface BalanceSheetExercise {
  activo: {
    activo_corriente: AssetLiabilityGroup;
    activo_no_corriente: AssetLiabilityGroup;
    total_del_activo: number | null;
  };
  pasivo: {
    pasivo_corriente: AssetLiabilityGroup;
    pasivo_no_corriente: AssetLiabilityGroup;
    total_del_pasivo: number | null;
  };
  patrimonio_neto_total: number | null;
}

export interface IncomeStatement {
  ventas_netas: number | null;
  costo_de_ventas: number | null;
  resultado_bruto: number | null;
  resultado_valuacion_bienes_de_cambio: number | null;
  gastos_administracion: number | null;
  gastos_comercializacion: number | null;
  resultado_inversiones_permanentes: number | null;
  resultado_ordinario: number | null;
  resultado_financiero_y_por_tenencia: number | null;
  resultado_del_ejercicio_final: number | null;
}

export interface EquityEvolution {
  capital_social_cooperativo: number | null;
  ajuste_capital_cooperativo: number | null;
  reserva_legal: number | null;
  reserva_especial_art42: number | null;
  resultados_no_asignados: number | null;
}

export interface CashFlow {
  depreciacion_bienes_de_uso: number | null;
  flujo_neto_actividades_operativas: number | null;
}

export interface MonthlySale {
  mes: string;
  monto: number;
  monto_anio_anterior?: number;
  moneda: string;
}

export interface PostClosingAnalysis {
  periodo_analizado: {
    fecha_inicio: string;
    fecha_fin: string;
  };
  detalle_ventas_mensuales: MonthlySale[];
  total_ventas_post_cierre: number;
  notas_relevantes: string;
  deuda_bancaria_post_balance_detalle?: { entidad: string; monto: number; moneda?: string }[];
}

export interface FinancialData {
  hoja_estado_situacion_patrimonial: {
    titulo_referencia: string;
    ejercicio_actual: BalanceSheetExercise;
    ejercicio_anterior: BalanceSheetExercise;
  };
  hoja_estado_resultados: {
    titulo_referencia: string;
    ejercicio_actual: IncomeStatement;
    ejercicio_anterior: IncomeStatement;
  };
  hoja_evolucion_patrimonio_neto: {
    titulo_referencia: string;
    ejercicio_actual: EquityEvolution;
    ejercicio_anterior: EquityEvolution;
  };
  hoja_flujo_efectivo: {
    titulo_referencia: string;
    ejercicio_actual: CashFlow;
    ejercicio_anterior: CashFlow;
  };
  analisis_post_cierre?: PostClosingAnalysis;
}

export interface Ratio {
  name: string;
  value: number | string;
  status: 'critical' | 'alert' | 'healthy';
  description?: string;
}

export interface CrossCheck {
  nosis_debt: number | null;
  balance_debt: number | null;
  match: boolean;
  difference: number | null;
  status: 'critical' | 'alert' | 'healthy';
}

export interface SalesAnalysis {
  evolution_text: string;
  projection_text: string;
  status: 'critical' | 'alert' | 'healthy';
}

export interface CompanyProfile {
  name: string;
  cuit: string;
  activity: string;
  anio_actual: string | number;
  anio_anterior: string | number;
}

export interface EquityAnalysis {
  trend_text: string;
  status: 'organic' | 'contributions' | 'mixed' | 'undefined';
}

export interface MotorDeRatios {
  ebitda: number | 'N/A';
  ebitda_anterior?: number | 'N/A';
  liquidez: number | 'N/A';
  liquidez_anterior?: number | 'N/A';
  liquidez_acida: number | 'N/A';
  liquidez_acida_anterior?: number | 'N/A';
  endeudamiento: number | 'N/A';
  endeudamiento_anterior?: number | 'N/A';
  capital_de_trabajo: number | 'N/A';
  capital_de_trabajo_anterior?: number | 'N/A';
  margen_ebitda_ventas: number | 'N/A';
  margen_ebitda_ventas_anterior?: number | 'N/A';
  resultados_financieros_ventas: number | 'N/A';
  resultados_financieros_ventas_anterior?: number | 'N/A';
  cobertura_intereses: number | 'N/A';
  cobertura_intereses_anterior?: number | 'N/A';
  deuda_bancaria_total: number | 'N/A';
  deuda_bancaria_total_anterior?: number | 'N/A';
  deuda_bancaria_ebitda: number | 'N/A';
  deuda_bancaria_ebitda_anterior?: number | 'N/A';
  deuda_bancaria_dias_ventas: number | 'N/A';
  deuda_bancaria_dias_ventas_anterior?: number | 'N/A';
  rentabilidad: number | 'N/A';
  rentabilidad_anterior?: number | 'N/A';
}

export interface NosisEntityDetail {
  entidad: string;
  situacion: number;
  monto: number;
}

export interface NosisExtraction {
  score_crediticio: number;
  situacion_bcra_peor_estado: number;
  cheques_rechazados_cantidad: number;
  cheques_rechazados_monto: number;
  deuda_financiera_total_nosis: number;
  detalle_entidades: NosisEntityDetail[];
}

export interface AdditionalBalanceData {
  deuda_bancaria_post_balance: number;
}

export interface Shareholder {
  nombre: string;
  dni_cuit: string;
  participacion: number;
  subAccionistas?: Shareholder[];
}

export interface BoardMember {
  cargo: string;
  nombre: string;
}

export interface AccionistasYDirectorio {
  accionistas: Shareholder[];
  directorio: BoardMember[];
}

export interface DashboardData {
  company_profile: CompanyProfile;
  ratios: Ratio[];
  motor_de_ratios?: MotorDeRatios;
  cross_check: CrossCheck | null;
  sales_analysis: SalesAnalysis;
  equity_analysis: EquityAnalysis;
  informe_markdown?: string;
  extraccion_nosis?: NosisExtraction;
  datos_adicionales_balance?: AdditionalBalanceData;
  executive_summary?: string;
  accionistas_y_directorio?: AccionistasYDirectorio;
  analisis_mercado?: string;
}

export interface ExtractionResult {
  id: string;
  timestamp: string;
  fileNames: string[];
  data: FinancialData | null;
  dashboardData: DashboardData | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

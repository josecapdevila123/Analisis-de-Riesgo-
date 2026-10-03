// Proyección de flujo de fondos para capacidad de repago.
// Montos en MILES de pesos, en moneda constante del CIERRE del balance.
// Tasas, márgenes y crecimientos como fracción decimal (0,05 = 5%).

export type EscenarioId = 'base' | 'directorio' | 'estres';
export const ESCENARIOS: EscenarioId[] = ['base', 'directorio', 'estres'];
export const ESCENARIO_LABEL: Record<EscenarioId, string> = {
  base: 'Base',
  directorio: 'Directorio',
  estres: 'Estrés',
};

// Supuestos efectivos de un escenario (ya resueltos: sugerido o editado).
export type Supuestos = {
  horizonte: number;                  // años, 1–5
  crecimiento: Array<number | null>;  // crecimiento real de ventas por año (largo = horizonte)
  margenEbitda: number | null;
  capexPct: number | null;            // capex de mantenimiento como % de ventas
  capitalTrabajoPct: number | null;   // capital de trabajo como % de ventas
  liberarCapitalTrabajo: boolean;     // false: un ΔCT negativo se toma como 0
  tasaReal: number;
  alicuota: number;
  aniosAmortizacionNoCorriente: number;
  aniosAmortizacionPostBalance: number;
  // Solo para tests: capex como monto fijo en lugar de % de ventas.
  capexMonto?: number;
};

// Año base del modelo.
export type BaseModelo = {
  ventas: number;
  deudaCorriente: number;     // se amortiza en el año 1
  deudaNoCorriente: number;   // en partes iguales desde el año 2
  deudaPostBalance: number;   // en partes iguales desde el año 1
};

export type FilaProyeccion = {
  anio: number;
  ventas: number;
  ebitda: number;
  impuestos: number;
  capex: number;
  deltaCapitalTrabajo: number;
  cfads: number;              // flujo disponible para el servicio de deuda
  intereses: number;
  amortizacion: number;
  // Preparado para la futura pestaña de propuesta de crédito.
  servicioDeudaNueva: number;
  servicio: number;
  dscr: number | null;        // null = sin servicio de deuda ese año
  saldoInicio: number;
  saldoFin: number;
  deudaEbitda: number | null; // null si el EBITDA ≤ 0
  cajaAcumulada: number;
};

export type ResultadoProyeccion = {
  filas: FilaProyeccion[];
  dscrMinimo: { valor: number; anio: number } | null; // null si no hay servicio de deuda
};

// Lo que se guarda en el caso: SOLO lo editado por el analista. Lo demás se
// recalcula desde la extracción, así nunca queda un sugerido desactualizado.
export type CampoSupuesto =
  | 'horizonte'
  | 'margenEbitda'
  | 'capexPct'
  | 'capitalTrabajoPct'
  | 'liberarCapitalTrabajo'
  | 'tasaReal'
  | 'alicuota'
  | 'aniosAmortizacionNoCorriente'
  | 'aniosAmortizacionPostBalance';

export type OverridesEscenario = Partial<Record<CampoSupuesto, number | boolean | null>> & {
  crecimiento?: Record<number, number | null>; // índice de año (0 = año 1) → valor
};

export type OverridesBase = {
  inflacionMensual?: number | null;
  ventas?: number | null;
  deudaCorriente?: number | null;
  deudaNoCorriente?: number | null;
  deudaPostBalance?: number | null;
  incluirDeudaPostBalance?: boolean;
};

export type ProyeccionesGuardadas = {
  base: OverridesBase;
  escenarios: Record<EscenarioId, OverridesEscenario>;
  actualizadoEn: string;
};

export const proyeccionesVacias = (): ProyeccionesGuardadas => ({
  base: {},
  escenarios: { base: {}, directorio: {}, estres: {} },
  actualizadoEn: new Date(0).toISOString(),
});

// Un valor sugerido con su fuente (y aviso si no se pudo sugerir).
export type Sugerido<T> = { valor: T | null; fuente: string; aviso?: string };

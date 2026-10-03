import { RawExtraction } from '../extraction/schemas';
import { DocumentoSectorial, normalizarFecha, ReporteMora, TRAMOS_MAS_90 } from '../sectorDocs/tipos';

// Indicadores de financieras no bancarias. Funciones puras, sin IA.
// Fuente de la mora y las previsiones: el reporte de mora más reciente si está
// cargado; si no, el bloque financiero de los EECC. Dato faltante → null con
// motivo, nunca 0 por defecto. Montos en miles de pesos; ratios como fracción.

export type FinKey =
  | 'mora'
  | 'cobertura'
  | 'irregular_no_previsionada'
  | 'pn_ajustado'
  | 'pn_ajustado_sobre_pn'
  | 'cargo_sobre_resultado'
  | 'liquidez_90d'
  | 'concentracion_fondeo'
  | 'eficiencia'
  | 'top10_sobre_cartera'
  | 'brecha_crecimiento_cartera_pn'
  | 'cartera_financiera';

export const FIN_KEYS: FinKey[] = [
  'mora', 'cobertura', 'irregular_no_previsionada', 'pn_ajustado', 'pn_ajustado_sobre_pn', 'cargo_sobre_resultado',
  'liquidez_90d', 'concentracion_fondeo', 'eficiencia', 'top10_sobre_cartera', 'brecha_crecimiento_cartera_pn', 'cartera_financiera',
];

export type ValorFin = { actual: number | null; motivo?: string };

export type FuenteMora = {
  fuente: 'reporte' | 'balance' | null;
  fechaCorte: string | null;
  documentoId: string | null;
  cartera: number | null;
  vencida90: number | null;
  previsiones: number | null;
  fuentePrevisiones: 'reporte' | 'balance' | null;
};

export type CruceCartera = {
  carteraReporte: number;
  fechaReporte: string | null;
  carteraBalance: number;
  fechaBalance: string | null;
  diferenciaPct: number;   // (reporte − balance) / balance
  alerta: boolean;
};

export type IndicadoresFinancieros = {
  valores: Record<FinKey, ValorFin>;
  mora: FuenteMora;
  // Mora calculada solo con el balance: para que un documento declarado no
  // pueda levantar una señal con piso que el balance sí dispara.
  moraBalance: FuenteMora;
  pnAjustadoBalance: number | null;
  cruce: CruceCartera | null;
  moraPorProducto: Array<{ producto: string; cartera: number | null; mora_90: number | null; mora: number | null }>;
};

export const TOLERANCIA_CRUCE_CARTERA = 0.15;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const div = (n: number | null, d: number | null): number | null => (fin(n) && fin(d) && d !== 0 ? n / d : null);

// ---------- fuentes de la mora ----------

export function moraDesdeBalance(extraction: RawExtraction): FuenteMora {
  const f = extraction.extraccion_financiera ?? null;
  const vacio: FuenteMora = { fuente: null, fechaCorte: null, documentoId: null, cartera: null, vencida90: null, previsiones: null, fuentePrevisiones: null };
  if (!f) return vacio;
  const tramos = f.cartera_vencida_por_tramo ?? [];
  // Tramos de más de 90 días: los que empiezan en 90 días o después.
  const clasificables = tramos.filter(t => fin(t.desde_dias) && fin(t.monto));
  const vencida90 = clasificables.length > 0
    ? clasificables.filter(t => (t.desde_dias as number) >= 90).reduce((a, t) => a + (t.monto as number), 0)
    : null;
  return {
    fuente: 'balance',
    fechaCorte: normalizarFecha(f.fecha_cierre ?? null),
    documentoId: null,
    cartera: fin(f.cartera_total) ? f.cartera_total : null,
    vencida90,
    previsiones: fin(f.previsiones_incobrabilidad) ? f.previsiones_incobrabilidad : null,
    fuentePrevisiones: fin(f.previsiones_incobrabilidad) ? 'balance' : null,
  };
}

export function moraDesdeReporte(doc: DocumentoSectorial): FuenteMora {
  const r = doc.extraccion as ReporteMora;
  const tramos = r.tramos.filter(t => fin(t.monto));
  const cartera = tramos.length ? tramos.reduce((a, t) => a + (t.monto as number), 0) : null;
  const vencida90 = tramos.length ? tramos.filter(t => TRAMOS_MAS_90.includes(t.tramo)).reduce((a, t) => a + (t.monto as number), 0) : null;
  return {
    fuente: 'reporte',
    fechaCorte: normalizarFecha(r.fecha_corte) ?? doc.fechaDocumento,
    documentoId: doc.id,
    cartera,
    vencida90,
    previsiones: fin(r.previsiones) ? r.previsiones : null,
    fuentePrevisiones: fin(r.previsiones) ? 'reporte' : null,
  };
}

// Reporte de mora más reciente (por fecha de corte) entre los cargados.
export function reporteVigente(documentos: DocumentoSectorial[] | null | undefined): DocumentoSectorial | null {
  const reportes = (documentos ?? []).filter(d => d.tipo === 'reporte_mora' && d.estado === 'ok' && d.extraccion);
  if (reportes.length === 0) return null;
  return [...reportes].sort((a, b) => (normalizarFecha(b.fechaDocumento) ?? '').localeCompare(normalizarFecha(a.fechaDocumento) ?? ''))[0];
}

// Mora y previsiones del reporte si está; si no, del balance. Si el reporte no
// trae previsiones, se toman las del balance (y se dice).
export function elegirFuenteMora(extraction: RawExtraction, documentos?: DocumentoSectorial[] | null): FuenteMora {
  const balance = moraDesdeBalance(extraction);
  const doc = reporteVigente(documentos);
  if (!doc) return balance;
  const rep = moraDesdeReporte(doc);
  if (rep.previsiones === null && balance.previsiones !== null) {
    return { ...rep, previsiones: balance.previsiones, fuentePrevisiones: 'balance' };
  }
  return rep;
}

// ---------- indicadores ----------

const pnAjustadoDe = (pn: number, m: FuenteMora) => {
  if (!fin(m.vencida90) || !fin(m.previsiones)) return null;
  return pn - Math.max(0, m.vencida90 - m.previsiones);
};

export type InsumosEmpresa = {
  // Caja y bancos del balance (lo calcula calculations.ts con sus palabras clave).
  disponibilidades: number | null;
};

export function indicadoresFinancieros(
  extraction: RawExtraction,
  documentos: DocumentoSectorial[] | null | undefined,
  insumos: InsumosEmpresa,
): IndicadoresFinancieros {
  const f = extraction.extraccion_financiera ?? null;
  const esp = extraction.ejercicio_actual.estado_situacion_patrimonial;
  const er = extraction.ejercicio_actual.estado_resultados;
  const espAnt = extraction.ejercicio_anterior?.estado_situacion_patrimonial ?? null;
  const pn = esp.patrimonio_neto;
  const m = elegirFuenteMora(extraction, documentos);
  const mb = moraDesdeBalance(extraction);

  const sinDatos = (motivo: string): ValorFin => ({ actual: null, motivo });
  const SIN_CARTERA = f || m.fuente ? 'Falta la cartera vencida por tramo o la cartera total.' : 'Sin bloque financiero del balance ni reporte de mora.';
  const valor = (v: number | null, motivo: string): ValorFin => (v === null ? sinDatos(motivo) : { actual: v });

  const irregular = fin(m.vencida90) && fin(m.previsiones) ? Math.max(0, m.vencida90 - m.previsiones) : null;
  const pnAjustado = pnAjustadoDe(pn, m);

  // Resultado antes de previsiones = ingresos fin. − egresos fin. − gastos de estructura + cargo.
  const gastos = Math.abs(er.gastos_administracion) + Math.abs(er.gastos_comercializacion);
  const margenFinanciero = f && fin(f.ingresos_financieros) && fin(f.egresos_financieros)
    ? f.ingresos_financieros - Math.abs(f.egresos_financieros)
    : null;
  const resultadoPrePrevisiones = margenFinanciero !== null && f && fin(f.cargo_incobrabilidad)
    ? margenFinanciero - gastos + Math.abs(f.cargo_incobrabilidad)
    : null;

  // Liquidez a 90 días: disponibilidades e inversiones corrientes suman si están informadas.
  const activo90 = f && fin(f.creditos_a_vencer_90_dias)
    ? f.creditos_a_vencer_90_dias + (insumos.disponibilidades ?? 0) + (fin(f.inversiones_corrientes) ? f.inversiones_corrientes : 0)
    : null;

  const fondeo = (f?.fondeo ?? []).filter(x => fin(x.monto) && (x.monto as number) > 0);
  const totalFondeo = fondeo.reduce((a, x) => a + (x.monto as number), 0);
  const mayorFondeo = fondeo.reduce((a, x) => Math.max(a, x.monto as number), 0);

  const carteraBalance = f && fin(f.cartera_total) ? f.cartera_total : null;
  const carteraAnt = f && fin(f.cartera_total_anterior) ? f.cartera_total_anterior : null;
  const varCartera = div(carteraBalance !== null && carteraAnt !== null ? carteraBalance - carteraAnt : null, carteraAnt);
  const varPn = espAnt && espAnt.patrimonio_neto !== 0 ? (pn - espAnt.patrimonio_neto) / Math.abs(espAnt.patrimonio_neto) : null;

  const valores: Record<FinKey, ValorFin> = {
    cartera_financiera: valor(m.cartera, SIN_CARTERA),
    mora: valor(div(m.vencida90, m.cartera), SIN_CARTERA),
    cobertura: valor(
      div(m.previsiones, m.vencida90),
      m.vencida90 === 0 ? 'Sin cartera con más de 90 días de atraso: la cobertura no se calcula.' : m.previsiones === null ? 'Faltan las previsiones por incobrabilidad.' : SIN_CARTERA,
    ),
    irregular_no_previsionada: valor(irregular, m.previsiones === null ? 'Faltan las previsiones por incobrabilidad.' : SIN_CARTERA),
    pn_ajustado: valor(pnAjustado, 'Falta la cartera con más de 90 días o las previsiones.'),
    pn_ajustado_sobre_pn: valor(pn > 0 ? div(pnAjustado, pn) : null, pn <= 0 ? 'Patrimonio neto no positivo.' : 'Falta la cartera con más de 90 días o las previsiones.'),
    cargo_sobre_resultado: valor(
      f && fin(f.cargo_incobrabilidad) && resultadoPrePrevisiones !== null && resultadoPrePrevisiones > 0 ? Math.abs(f.cargo_incobrabilidad) / resultadoPrePrevisiones : null,
      resultadoPrePrevisiones !== null && resultadoPrePrevisiones <= 0 ? 'Resultado antes de previsiones no positivo.' : 'Faltan ingresos, egresos financieros o el cargo por incobrabilidad.',
    ),
    liquidez_90d: valor(
      f && fin(f.pasivos_a_vencer_90_dias) ? div(activo90, f.pasivos_a_vencer_90_dias) : null,
      'Faltan los créditos o los pasivos a vencer en 90 días.',
    ),
    concentracion_fondeo: valor(totalFondeo > 0 ? mayorFondeo / totalFondeo : null, 'Sin apertura de las fuentes de fondeo.'),
    eficiencia: valor(margenFinanciero !== null && margenFinanciero > 0 ? gastos / margenFinanciero : null,
      margenFinanciero !== null && margenFinanciero <= 0 ? 'Margen financiero no positivo.' : 'Faltan ingresos o egresos financieros.'),
    top10_sobre_cartera: valor(
      f && fin(f.top10_deudores_monto) ? div(f.top10_deudores_monto, m.cartera ?? carteraBalance) : null,
      'Cargá a mano el monto de los 10 principales deudores.',
    ),
    brecha_crecimiento_cartera_pn: valor(
      varCartera !== null && varPn !== null ? varCartera - varPn : null,
      'Falta la cartera del ejercicio anterior o el comparativo.',
    ),
  };

  // Cruce: cartera del reporte vs créditos financieros del balance.
  let cruce: CruceCartera | null = null;
  if (m.fuente === 'reporte' && fin(m.cartera) && carteraBalance !== null && carteraBalance !== 0) {
    const diferenciaPct = (m.cartera - carteraBalance) / carteraBalance;
    cruce = {
      carteraReporte: m.cartera,
      fechaReporte: m.fechaCorte,
      carteraBalance,
      fechaBalance: mb.fechaCorte,
      diferenciaPct,
      alerta: Math.abs(diferenciaPct) > TOLERANCIA_CRUCE_CARTERA,
    };
  }

  const doc = reporteVigente(documentos);
  const moraPorProducto = ((doc?.extraccion as ReporteMora | undefined)?.por_producto ?? []).map(p => ({
    producto: p.producto ?? 'Sin nombre',
    cartera: p.cartera ?? null,
    mora_90: p.mora_90 ?? null,
    mora: div(p.mora_90 ?? null, p.cartera ?? null),
  }));

  return { valores, mora: m, moraBalance: mb, pnAjustadoBalance: pnAjustadoDe(pn, mb), cruce, moraPorProducto };
}

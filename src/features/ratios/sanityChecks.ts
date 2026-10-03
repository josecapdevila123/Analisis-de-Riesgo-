import { RawExtraction } from '../extraction/schemas';

export type Severidad = 'warning' | 'error';

export type Inconsistencia = {
  campo: string;
  esperado: number | null;
  observado: number;
  diferencia_pct: number | null;
  severidad: Severidad;
  mensaje: string;
};

const TOLERANCIA_ECUACION = 0.01; // 1%
const VARIACION_EXTREMA_PCT = 200;

type Ejercicio = RawExtraction['ejercicio_actual'];

const relativeDiffWithin = (a: number, b: number, tolerance: number): boolean => {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return a === b;
  return Math.abs(a - b) / denom <= tolerance;
};

const pctDiff = (observado: number, esperado: number): number | null => {
  if (esperado === 0) return null;
  return ((observado - esperado) / Math.abs(esperado)) * 100;
};

const checkEcuacionContable = (label: string, year: Ejercicio, out: Inconsistencia[]) => {
  const esp = year.estado_situacion_patrimonial;
  const esperado = esp.total_pasivo + esp.patrimonio_neto;
  if (!relativeDiffWithin(esp.total_activo, esperado, TOLERANCIA_ECUACION)) {
    out.push({
      campo: `${label}.total_activo`,
      esperado,
      observado: esp.total_activo,
      diferencia_pct: pctDiff(esp.total_activo, esperado),
      severidad: 'error',
      mensaje: 'Ecuación contable no balancea: total_activo ≠ total_pasivo + patrimonio_neto',
    });
  }
};

const checkSubtotales = (label: string, year: Ejercicio, out: Inconsistencia[]) => {
  const esp = year.estado_situacion_patrimonial;

  const esperadoActivo = esp.activo_corriente.total + esp.activo_no_corriente.total;
  if (!relativeDiffWithin(esp.total_activo, esperadoActivo, TOLERANCIA_ECUACION)) {
    out.push({
      campo: `${label}.total_activo (subtotales)`,
      esperado: esperadoActivo,
      observado: esp.total_activo,
      diferencia_pct: pctDiff(esp.total_activo, esperadoActivo),
      severidad: 'error',
      mensaje: 'Subtotales no cuadran: total_activo ≠ activo_corriente + activo_no_corriente',
    });
  }

  const esperadoPasivo = esp.pasivo_corriente.total + esp.pasivo_no_corriente.total;
  if (!relativeDiffWithin(esp.total_pasivo, esperadoPasivo, TOLERANCIA_ECUACION)) {
    out.push({
      campo: `${label}.total_pasivo (subtotales)`,
      esperado: esperadoPasivo,
      observado: esp.total_pasivo,
      diferencia_pct: pctDiff(esp.total_pasivo, esperadoPasivo),
      severidad: 'error',
      mensaje: 'Subtotales no cuadran: total_pasivo ≠ pasivo_corriente + pasivo_no_corriente',
    });
  }
};

const checkPatrimonioNegativo = (label: string, year: Ejercicio, out: Inconsistencia[]) => {
  const pn = year.estado_situacion_patrimonial.patrimonio_neto;
  if (pn < 0) {
    out.push({
      campo: `${label}.patrimonio_neto`,
      esperado: null,
      observado: pn,
      diferencia_pct: null,
      severidad: 'error',
      mensaje: 'Patrimonio neto negativo (quiebra técnica): endeudamiento y ROE no son calculables',
    });
  }
};

const checkVariacionesExtremas = (actual: Ejercicio, anterior: Ejercicio, out: Inconsistencia[]) => {
  const compare = (campo: string, actualVal: number, anteriorVal: number) => {
    const variacion = pctDiff(actualVal, anteriorVal);
    if (variacion === null) return;
    if (Math.abs(variacion) > VARIACION_EXTREMA_PCT) {
      out.push({
        campo,
        esperado: null,
        observado: actualVal,
        diferencia_pct: variacion,
        severidad: 'warning',
        mensaje: `Variación interanual extrema (${variacion.toFixed(0)}%) — requiere explicación`,
      });
    }
  };

  compare('ventas_netas', actual.estado_resultados.ventas_netas, anterior.estado_resultados.ventas_netas);
  compare('total_activo', actual.estado_situacion_patrimonial.total_activo, anterior.estado_situacion_patrimonial.total_activo);
  compare('total_pasivo', actual.estado_situacion_patrimonial.total_pasivo, anterior.estado_situacion_patrimonial.total_pasivo);
  compare('patrimonio_neto', actual.estado_situacion_patrimonial.patrimonio_neto, anterior.estado_situacion_patrimonial.patrimonio_neto);
  compare('resultado_neto', actual.estado_resultados.resultado_neto, anterior.estado_resultados.resultado_neto);
};

export function runSanityChecks(extraction: RawExtraction): Inconsistencia[] {
  const out: Inconsistencia[] = [];
  checkEcuacionContable('ejercicio_actual', extraction.ejercicio_actual, out);
  checkSubtotales('ejercicio_actual', extraction.ejercicio_actual, out);
  checkPatrimonioNegativo('ejercicio_actual', extraction.ejercicio_actual, out);

  if (extraction.ejercicio_anterior) {
    checkEcuacionContable('ejercicio_anterior', extraction.ejercicio_anterior, out);
    checkSubtotales('ejercicio_anterior', extraction.ejercicio_anterior, out);
    checkPatrimonioNegativo('ejercicio_anterior', extraction.ejercicio_anterior, out);
    checkVariacionesExtremas(extraction.ejercicio_actual, extraction.ejercicio_anterior, out);
  }

  return out;
}

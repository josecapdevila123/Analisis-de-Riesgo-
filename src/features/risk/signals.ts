import { CompanyHistory, RawExtraction, RiskDimension, SeveridadRiesgo } from '../extraction/schemas';
import { ComputedRatios } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';
import { pceProxy } from './score';

// Señales de riesgo objetivas, calculadas con reglas fijas (sin IA). Se le pasan
// al modelo como evidencia y algunas fijan un PISO al puntaje final, para que una
// lectura optimista no pueda ocultar un hecho grave (ej. situación 3 en BCRA).
// Umbrales iniciales: ajustarlos acá, con tests.

export type RiskSignal = {
  id: string;
  dimension: RiskDimension;
  severidad: SeveridadRiesgo;
  titulo: string;
  detalle: string;
  piso: number | null;
};

export type SignalsInput = {
  extraction: RawExtraction;
  ratios: ComputedRatios;
  inconsistencias: Inconsistencia[];
  crossCheck: CrossCheckResult | null;
  companyHistory?: CompanyHistory | null;
};

const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
const fmtX = (v: number) => `${v.toFixed(2).replace('.', ',')}x`;
const fmtMiles = (v: number) => `$ ${Math.round(v).toLocaleString('es-AR')} miles`;

const variation = (actual: number | null | undefined, anterior: number | null | undefined): number | null => {
  if (actual === null || actual === undefined || anterior === null || anterior === undefined || anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
};

export function detectSignals({ extraction, ratios, inconsistencias, crossCheck, companyHistory }: SignalsInput): RiskSignal[] {
  const out: RiskSignal[] = [];
  const add = (s: RiskSignal) => out.push(s);

  const er = extraction.ejercicio_actual.estado_resultados;
  const erAnt = extraction.ejercicio_anterior?.estado_resultados ?? null;
  const ventasVar = variation(er.ventas_netas, erAnt?.ventas_netas);

  // ---------- Nosis / BCRA ----------
  const nosis = extraction.extraccion_nosis;
  if (!nosis) {
    add({
      id: 'sin_nosis', dimension: 'calidad_informacion', severidad: 'media', piso: null,
      titulo: 'Sin informe Nosis',
      detalle: 'No se recibió informe Nosis: no se puede validar la situación en el sistema financiero.',
    });
  } else {
    const peor = nosis.situacion_bcra_peor_estado;
    const entidadesMal = nosis.detalle_entidades.filter(e => (e.situacion ?? 1) >= 2);
    const listado = entidadesMal.map(e => `${e.entidad} (sit. ${e.situacion})`).join(', ');
    if (peor !== null && peor >= 4) {
      add({
        id: 'bcra_situacion_4', dimension: 'nosis_bcra', severidad: 'critica', piso: 90,
        titulo: `Situación ${peor} en BCRA`,
        detalle: `Peor situación informada: ${peor} (alto riesgo de insolvencia / irrecuperable).${listado ? ` Entidades: ${listado}.` : ''}`,
      });
    } else if (peor === 3) {
      add({
        id: 'bcra_situacion_3', dimension: 'nosis_bcra', severidad: 'critica', piso: 75,
        titulo: 'Situación 3 en BCRA',
        detalle: `Peor situación informada: 3 (con problemas).${listado ? ` Entidades: ${listado}.` : ''}`,
      });
    } else if (peor === 2) {
      add({
        id: 'bcra_situacion_2', dimension: 'nosis_bcra', severidad: 'alta', piso: 55,
        titulo: 'Situación 2 en BCRA',
        detalle: `Peor situación informada: 2 (seguimiento especial / riesgo bajo).${listado ? ` Entidades: ${listado}.` : ''}`,
      });
    }

    const cheques = nosis.cheques_rechazados_cantidad ?? 0;
    if (cheques > 0) {
      const monto = nosis.cheques_rechazados_monto ?? 0;
      const sobreVentas = er.ventas_netas > 0 ? (monto / er.ventas_netas) * 100 : null;
      const grave = cheques >= 5 || (sobreVentas !== null && sobreVentas >= 1);
      add({
        id: 'cheques_rechazados', dimension: 'nosis_bcra', severidad: grave ? 'alta' : 'media', piso: grave ? 60 : null,
        titulo: 'Cheques rechazados',
        detalle: `${cheques} cheque(s) rechazado(s) por ${fmtMiles(monto)}${sobreVentas !== null ? ` (${sobreVentas.toFixed(1).replace('.', ',')}% de las ventas anuales)` : ''}.`,
      });
    }

    const pce = pceProxy(nosis.score_crediticio);
    if (pce !== null && pce >= 40) {
      add({
        id: 'score_nosis', dimension: 'nosis_bcra', severidad: pce >= 60 ? 'alta' : 'media', piso: null,
        titulo: 'Score Nosis bajo',
        detalle: `Score ${nosis.score_crediticio}: pérdida esperada (proxy) ${pce}/100.`,
      });
    }
  }

  if (crossCheck && crossCheck.match === false && crossCheck.nosis_debt !== null) {
    const nosisMayor = crossCheck.nosis_debt > crossCheck.balance_debt;
    add({
      id: 'cruce_nosis', dimension: 'nosis_bcra', severidad: nosisMayor ? 'alta' : 'media', piso: null,
      titulo: nosisMayor ? 'Nosis informa más deuda que el balance' : 'Deuda de balance difiere de Nosis',
      detalle: `Balance ${fmtMiles(crossCheck.balance_debt)} vs Nosis ${fmtMiles(crossCheck.nosis_debt)}${crossCheck.difference_pct !== null ? ` (${fmtPct(crossCheck.difference_pct)})` : ''}.${nosisMayor ? ' Posible deuda tomada después del cierre o no expuesta.' : ''}`,
    });
  }

  // ---------- Endeudamiento ----------
  const deudaVar = ratios.deuda_bancaria_total.variacion_pct;
  if (deudaVar !== null && deudaVar > 20 && ventasVar !== null && ventasVar < 0) {
    add({
      id: 'deuda_sube_ventas_bajan', dimension: 'endeudamiento', severidad: 'alta', piso: null,
      titulo: 'La deuda crece mientras las ventas caen',
      detalle: `Deuda bancaria ${fmtPct(deudaVar)} con ventas ${fmtPct(ventasVar)}.`,
    });
  } else if (deudaVar !== null && deudaVar > 50 && (ventasVar === null || deudaVar - ventasVar > 20)) {
    add({
      id: 'deuda_crecimiento_desmedido', dimension: 'endeudamiento', severidad: 'alta', piso: null,
      titulo: 'Crecimiento desmedido de la deuda bancaria',
      detalle: `Deuda bancaria ${fmtPct(deudaVar)}${ventasVar !== null ? ` vs ventas ${fmtPct(ventasVar)}` : ''}.`,
    });
  }

  const ebitda = ratios.ebitda.actual;
  const deudaTotal = ratios.deuda_bancaria_total.actual ?? 0;
  if (ebitda !== null && ebitda <= 0 && deudaTotal > 0) {
    add({
      id: 'ebitda_negativo_con_deuda', dimension: 'endeudamiento', severidad: 'critica', piso: 65,
      titulo: 'EBITDA negativo con deuda bancaria',
      detalle: `EBITDA ${fmtMiles(ebitda)} y deuda bancaria ${fmtMiles(deudaTotal)}: sin capacidad operativa de repago.`,
    });
  } else if (ratios.deuda_ebitda.actual !== null && ratios.deuda_ebitda.actual > 3.5) {
    add({
      id: 'deuda_ebitda_alta', dimension: 'endeudamiento', severidad: 'alta', piso: null,
      titulo: 'Deuda / EBITDA elevada',
      detalle: `Deuda / EBITDA ${fmtX(ratios.deuda_ebitda.actual)} (umbral 3,5x).`,
    });
  }

  const cobertura = ratios.cobertura_intereses.actual;
  if (cobertura !== null && cobertura < 1.5) {
    add({
      id: 'cobertura_baja', dimension: 'endeudamiento', severidad: cobertura < 1 ? 'alta' : 'media', piso: null,
      titulo: 'Baja cobertura de intereses',
      detalle: `EBITDA / intereses ${fmtX(cobertura)}${cobertura < 1 ? ': el EBITDA no cubre los intereses' : ''}.`,
    });
  }

  const deudaCP = extraction.deuda_bancaria_actual.corriente.total;
  if (deudaTotal > 0 && deudaCP / deudaTotal > 0.7) {
    add({
      id: 'deuda_corto_plazo', dimension: 'endeudamiento', severidad: 'media', piso: null,
      titulo: 'Deuda concentrada en el corto plazo',
      detalle: `${Math.round((deudaCP / deudaTotal) * 100)}% de la deuda bancaria vence en los próximos 12 meses.`,
    });
  }

  const endeud = ratios.endeudamiento.actual;
  if (endeud !== null && endeud > 3) {
    add({
      id: 'apalancamiento_alto', dimension: 'endeudamiento', severidad: endeud > 5 ? 'alta' : 'media', piso: null,
      titulo: 'Apalancamiento elevado',
      detalle: `Pasivo / patrimonio neto ${fmtX(endeud)}.`,
    });
  }

  // ---------- Liquidez y solvencia ----------
  const pn = extraction.ejercicio_actual.estado_situacion_patrimonial.patrimonio_neto;
  if (pn < 0) {
    add({
      id: 'patrimonio_negativo', dimension: 'liquidez_solvencia', severidad: 'critica', piso: 85,
      titulo: 'Patrimonio neto negativo',
      detalle: `Patrimonio neto ${fmtMiles(pn)}: quiebra técnica.`,
    });
  }

  const lc = ratios.liquidez_corriente.actual;
  if (lc !== null && lc < 1) {
    add({
      id: 'liquidez_corriente_baja', dimension: 'liquidez_solvencia', severidad: 'alta', piso: null,
      titulo: 'Liquidez corriente menor a 1',
      detalle: `Liquidez corriente ${fmtX(lc)}: el pasivo de corto plazo supera al activo corriente (capital de trabajo ${fmtMiles(ratios.capital_de_trabajo.actual ?? 0)}).`,
    });
  }
  const acida = ratios.liquidez_acida.actual;
  if (acida !== null && acida < 0.7 && !(lc !== null && lc < 1)) {
    add({
      id: 'prueba_acida_baja', dimension: 'liquidez_solvencia', severidad: 'media', piso: null,
      titulo: 'Prueba ácida baja',
      detalle: `Prueba ácida ${fmtX(acida)}: la liquidez depende de vender stock.`,
    });
  }

  const ciclo = ratios.ciclo_conversion_caja;
  if (ciclo.actual !== null && ciclo.anterior !== null && ciclo.actual - ciclo.anterior > 30) {
    add({
      id: 'ciclo_caja_crece', dimension: 'liquidez_solvencia', severidad: 'media', piso: null,
      titulo: 'Se alarga el ciclo de conversión de caja',
      detalle: `Pasa de ${Math.round(ciclo.anterior)} a ${Math.round(ciclo.actual)} días: más necesidad de financiar capital de trabajo.`,
    });
  }

  // ---------- Rentabilidad y ventas ----------
  if (ventasVar !== null && ventasVar < 0) {
    add({
      id: 'ventas_caen_nominal', dimension: 'rentabilidad', severidad: 'alta', piso: null,
      titulo: 'Caída nominal de ventas',
      detalle: `Ventas ${fmtPct(ventasVar)} en pesos corrientes: con inflación, la caída real es mayor.`,
    });
  }

  if (er.resultado_neto < 0) {
    const perdidaRepetida = erAnt !== null && erAnt.resultado_neto < 0;
    add({
      id: 'resultado_negativo', dimension: 'rentabilidad', severidad: perdidaRepetida ? 'alta' : 'media', piso: null,
      titulo: perdidaRepetida ? 'Pérdidas en los dos ejercicios' : 'Resultado neto negativo',
      detalle: `Resultado neto ${fmtMiles(er.resultado_neto)}${perdidaRepetida ? ` (anterior ${fmtMiles(erAnt!.resultado_neto)})` : ''}.`,
    });
  }

  const me = ratios.margen_ebitda;
  if (me.actual !== null && me.anterior !== null && (me.anterior - me.actual) * 100 > 5) {
    add({
      id: 'margen_ebitda_cae', dimension: 'rentabilidad', severidad: 'media', piso: null,
      titulo: 'Caída del margen EBITDA',
      detalle: `Margen EBITDA de ${(me.anterior * 100).toFixed(1)}% a ${(me.actual * 100).toFixed(1)}%.`,
    });
  }

  // ---------- Post balance ----------
  const post = extraction.analisis_post_cierre;
  if (post) {
    const meses = post.detalle_ventas_mensuales.filter(v => v.monto_anio_anterior !== null && v.monto_anio_anterior > 0);
    if (meses.length > 0) {
      const actual = meses.reduce((a, v) => a + v.monto, 0);
      const anterior = meses.reduce((a, v) => a + (v.monto_anio_anterior ?? 0), 0);
      const varPost = variation(actual, anterior);
      if (varPost !== null && varPost < 0) {
        add({
          id: 'ventas_post_balance_caen', dimension: 'ventas_post_balance', severidad: 'alta', piso: null,
          titulo: 'Ventas post balance en caída',
          detalle: `Ventas de ${meses.length} mes(es) posteriores al cierre ${fmtPct(varPost)} interanual (nominal).`,
        });
      }
    }

    const deudaPost = post.deuda_bancaria_post_balance_detalle;
    const deudaPostArs = deudaPost.filter(d => (d.moneda ?? 'ARS') === 'ARS').reduce((a, d) => a + d.monto, 0);
    if (deudaPostArs > 0 && deudaTotal > 0) {
      const ratio = deudaPostArs / deudaTotal;
      if (ratio > 0.3) {
        add({
          id: 'deuda_post_balance', dimension: 'ventas_post_balance', severidad: ratio > 0.6 ? 'alta' : 'media', piso: null,
          titulo: 'Deuda bancaria tomada después del cierre',
          detalle: `${fmtMiles(deudaPostArs)} asumidos post balance (${Math.round(ratio * 100)}% de la deuda bancaria al cierre).`,
        });
      }
    }
    if (deudaPost.some(d => d.moneda === 'USD')) {
      add({
        id: 'deuda_post_balance_usd', dimension: 'ventas_post_balance', severidad: 'media', piso: null,
        titulo: 'Deuda en dólares tomada después del cierre',
        detalle: 'Exposición a tipo de cambio: revisar si las ventas están dolarizadas.',
      });
    }
  }

  // ---------- Calidad de la información ----------
  const errores = inconsistencias.filter(i => i.severidad === 'error');
  if (errores.length > 0) {
    add({
      id: 'balance_no_cuadra', dimension: 'calidad_informacion', severidad: 'alta', piso: null,
      titulo: 'El balance extraído no cuadra',
      detalle: `${errores.length} inconsistencia(s) contable(s): ${errores.map(e => e.mensaje).join('; ')}.`,
    });
  }
  if (!extraction.ejercicio_anterior) {
    add({
      id: 'sin_comparativo', dimension: 'calidad_informacion', severidad: 'media', piso: null,
      titulo: 'Sin ejercicio comparativo',
      detalle: 'No hay ejercicio anterior: no se pueden evaluar tendencias.',
    });
  }
  if (companyHistory && !companyHistory.memoria_disponible) {
    add({
      id: 'sin_memoria', dimension: 'calidad_informacion', severidad: 'baja', piso: null,
      titulo: 'Sin Memoria del Directorio',
      detalle: 'No se recibió la Memoria: falta la explicación de la gestión y las proyecciones.',
    });
  }

  const orden: Record<SeveridadRiesgo, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  return out.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}

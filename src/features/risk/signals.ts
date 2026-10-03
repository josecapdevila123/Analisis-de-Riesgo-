import { CompanyHistory, RawExtraction, RiskDimension, SeveridadRiesgo } from '../extraction/schemas';
import { ComputedRatios } from '../ratios/calculations';
import { Inconsistencia } from '../ratios/sanityChecks';
import { CrossCheckResult } from '../ratios/crossCheck';
import { pceProxy } from './score';
import { PerfilEfectivo, perfilEfectivo } from './policy';
import { disponibilidadesActuales } from '../ratios/calculations';
import { indicadoresFinancieros } from '../ratios/financieras';
import type { DocumentoSectorial } from '../sectorDocs/tipos';

// Señales de riesgo objetivas, calculadas con reglas fijas (sin IA). Se le pasan
// al modelo como evidencia y algunas fijan un PISO al puntaje final, para que una
// lectura optimista no pueda ocultar un hecho grave (ej. situación 3 en BCRA).
// Todos los umbrales viven en policy.ts; acá solo se aplican.

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
  // Perfil del rubro confirmado (por defecto, el genérico).
  perfil?: PerfilEfectivo;
  // Documentos sectoriales (ej. reporte de mora). Declarados, no auditados.
  documentos?: DocumentoSectorial[] | null;
};

const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
const fmtX = (v: number) => `${v.toFixed(2).replace('.', ',')}x`;
const fmtMiles = (v: number) => `$ ${Math.round(v).toLocaleString('es-AR')} miles`;

const variation = (actual: number | null | undefined, anterior: number | null | undefined): number | null => {
  if (actual === null || actual === undefined || anterior === null || anterior === undefined || anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
};

export function detectSignals({ extraction, ratios, inconsistencias, crossCheck, companyHistory, perfil = perfilEfectivo('generico'), documentos = null }: SignalsInput): RiskSignal[] {
  const out: RiskSignal[] = [];
  // Parámetros y umbrales del perfil efectivo (genérico + overrides del rubro).
  const P = perfil.senales;
  const RATIO_THRESHOLDS = perfil.umbrales;
  const sinAnticipos = perfil.ajustes.excluirAnticiposClientes === true;
  const anticipos = ratios.anticipos_clientes?.actual ?? null;
  const notaAnticipos = sinAnticipos && anticipos !== null ? ` (sin anticipos de clientes: ${fmtMiles(anticipos)} excluidos)` : '';
  const add = (s: RiskSignal) => out.push(s);

  const er = extraction.ejercicio_actual.estado_resultados;
  const erAnt = extraction.ejercicio_anterior?.estado_resultados ?? null;
  const ventasVar = variation(er.ventas_netas, erAnt?.ventas_netas);
  const info = extraction.informacion_complementaria ?? null;
  // Con RT 6 el comparativo está reexpresado: las variaciones ya son reales.
  const enMonedaHomogenea = info?.balance_ajustado_por_inflacion === true;

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
    const conListado = (texto: string) => `${texto}${listado ? ` Entidades: ${listado}.` : ''}`;
    if (peor !== null && peor >= 4) {
      add({
        id: 'bcra_situacion_4', dimension: 'nosis_bcra', severidad: P.bcra.sit4omas.severidad, piso: P.bcra.sit4omas.piso,
        titulo: `Situación ${peor} en BCRA`,
        detalle: conListado(`Peor situación informada: ${peor} (alto riesgo de insolvencia / irrecuperable).`),
      });
    } else if (peor === 3) {
      add({
        id: 'bcra_situacion_3', dimension: 'nosis_bcra', severidad: P.bcra.sit3.severidad, piso: P.bcra.sit3.piso,
        titulo: 'Situación 3 en BCRA',
        detalle: conListado('Peor situación informada: 3 (con problemas).'),
      });
    } else if (peor === 2) {
      add({
        id: 'bcra_situacion_2', dimension: 'nosis_bcra', severidad: P.bcra.sit2.severidad, piso: P.bcra.sit2.piso,
        titulo: 'Situación 2 en BCRA',
        detalle: conListado('Peor situación informada: 2 (seguimiento especial / riesgo bajo).'),
      });
    }

    // Antecedentes de los últimos 24 meses peores que la situación actual.
    const peor24 = nosis.peor_situacion_24_meses ?? null;
    if (peor24 !== null && peor24 >= 2 && peor24 > (peor ?? 1)) {
      const sev = peor24 >= 3 ? P.bcra.historial24mSit3.severidad : P.bcra.historial24mSit2.severidad;
      add({
        id: 'bcra_historial_24m', dimension: 'nosis_bcra', severidad: sev, piso: null,
        titulo: `Situación ${peor24} en los últimos 24 meses`,
        detalle: `Hoy informa situación ${peor ?? 1}, pero registró situación ${peor24} en los últimos 24 meses.`,
      });
    }

    const cheques = nosis.cheques_rechazados_cantidad ?? 0;
    if (cheques > 0) {
      const levantados = Math.min(cheques, nosis.cheques_rechazados_levantados ?? 0);
      const pendientes = cheques - levantados;
      const monto = nosis.cheques_rechazados_monto ?? 0;
      const sobreVentas = er.ventas_netas > 0 ? (monto / er.ventas_netas) * 100 : null;
      const grave = pendientes >= P.cheques.cantidadGrave || (pendientes > 0 && sobreVentas !== null && sobreVentas >= P.cheques.pctVentasGrave);
      add({
        id: 'cheques_rechazados', dimension: 'nosis_bcra',
        severidad: pendientes === 0 ? 'baja' : grave ? 'alta' : 'media',
        piso: grave ? P.cheques.pisoGrave : null,
        titulo: pendientes === 0 ? 'Cheques rechazados (levantados)' : 'Cheques rechazados',
        detalle: `${cheques} cheque(s) rechazado(s) por ${fmtMiles(monto)}${sobreVentas !== null ? ` (${sobreVentas.toFixed(1).replace('.', ',')}% de las ventas anuales)` : ''}${levantados > 0 ? `; ${levantados} levantado(s)` : ''}.`,
      });
    }

    const pce = pceProxy(nosis.score_crediticio);
    if (pce !== null && pce >= P.pce.media) {
      add({
        id: 'score_nosis', dimension: 'nosis_bcra', severidad: pce >= P.pce.alta ? 'alta' : 'media', piso: null,
        titulo: 'Score Nosis bajo',
        detalle: `Score ${nosis.score_crediticio}: pérdida esperada (proxy) ${pce}/100.`,
      });
    }

    const deudaArca = nosis.deuda_fiscal_previsional ?? 0;
    if (deudaArca > 0) {
      add({
        id: 'deuda_arca', dimension: 'nosis_bcra', severidad: P.arca.deudaSeveridad, piso: null,
        titulo: 'Deuda fiscal o previsional con ARCA',
        detalle: `${fmtMiles(deudaArca)} informados en Nosis.`,
      });
    }
    if (nosis.planes_de_pago_arca === true) {
      add({
        id: 'planes_arca', dimension: 'nosis_bcra', severidad: P.arca.planesSeveridad, piso: null,
        titulo: 'Planes de pago vigentes con ARCA',
        detalle: 'Tiene deuda fiscal o previsional refinanciada en planes de pago.',
      });
    }

    const juicios = nosis.juicios_cantidad ?? 0;
    const embargos = nosis.embargos_cantidad ?? 0;
    if (juicios + embargos > 0) {
      add({
        id: 'juicios_embargos', dimension: 'nosis_bcra', severidad: P.judicial.juiciosEmbargosSeveridad, piso: null,
        titulo: 'Juicios o embargos',
        detalle: `${juicios} juicio(s) y ${embargos} embargo(s) informados.`,
      });
    }
    const quiebras = nosis.pedidos_quiebra_cantidad ?? 0;
    if (quiebras > 0) {
      add({
        id: 'pedido_quiebra', dimension: 'nosis_bcra',
        severidad: P.judicial.pedidoQuiebra.severidad, piso: P.judicial.pedidoQuiebra.piso,
        titulo: 'Pedidos de quiebra',
        detalle: `${quiebras} pedido(s) de quiebra informados.`,
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

  // ---------- Endeudamiento y capacidad de pago ----------
  const deudaVar = ratios.deuda_bancaria_total.variacion_pct;
  if (deudaVar !== null && deudaVar > P.deuda.crecimientoConVentasEnCaidaPct && ventasVar !== null && ventasVar < 0) {
    add({
      id: 'deuda_sube_ventas_bajan', dimension: 'endeudamiento', severidad: 'alta', piso: null,
      titulo: 'La deuda crece mientras las ventas caen',
      detalle: `Deuda bancaria ${fmtPct(deudaVar)} con ventas ${fmtPct(ventasVar)}.`,
    });
  } else if (deudaVar !== null && deudaVar > P.deuda.crecimientoPct && (ventasVar === null || deudaVar - ventasVar > P.deuda.brechaVsVentasPp)) {
    add({
      id: 'deuda_crecimiento_desmedido', dimension: 'endeudamiento', severidad: 'alta', piso: null,
      titulo: 'Crecimiento desmedido de la deuda bancaria',
      detalle: `Deuda bancaria ${fmtPct(deudaVar)}${ventasVar !== null ? ` vs ventas ${fmtPct(ventasVar)}` : ''}.`,
    });
  }

  const ebitda = ratios.ebitda.actual;
  const deudaTotal = ratios.deuda_bancaria_total.actual ?? 0;
  const ebitdaNegativoConDeuda = ebitda !== null && ebitda <= 0 && deudaTotal > 0;
  if (ebitdaNegativoConDeuda) {
    add({
      id: 'ebitda_negativo_con_deuda', dimension: 'endeudamiento', severidad: 'critica', piso: P.deuda.ebitdaNegativoPiso,
      titulo: 'EBITDA negativo con deuda bancaria',
      detalle: `EBITDA ${fmtMiles(ebitda!)} y deuda bancaria ${fmtMiles(deudaTotal)}: sin capacidad operativa de repago.`,
    });
  } else {
    const neta = ratios.deuda_neta_ebitda.actual;
    if (neta !== null && neta > RATIO_THRESHOLDS.deuda_neta_ebitda.alerta) {
      add({
        id: 'deuda_neta_ebitda_alta', dimension: 'endeudamiento', severidad: 'alta', piso: null,
        titulo: 'Deuda neta / EBITDA elevada',
        detalle: `Deuda financiera neta / EBITDA ${fmtX(neta)} (alerta por encima de ${fmtX(RATIO_THRESHOLDS.deuda_neta_ebitda.alerta)}).`,
      });
    }
  }

  // DSCR: si el flujo alcanza para intereses + capital. Con EBITDA negativo ya
  // hay una señal crítica: no se duplica.
  const dscr = ratios.dscr.actual;
  if (dscr !== null && !ebitdaNegativoConDeuda) {
    if (dscr < RATIO_THRESHOLDS.dscr.alerta) {
      add({
        id: 'dscr_menor_1', dimension: 'endeudamiento', severidad: 'critica', piso: P.dscr.criticoPiso,
        titulo: 'DSCR menor a 1: no repaga con su propio flujo',
        detalle: `DSCR ${fmtX(dscr)}: el flujo (EBITDA − capex de mantenimiento − impuestos) no cubre intereses + capital del año.`,
      });
    } else if (dscr <= RATIO_THRESHOLDS.dscr.sano) {
      add({
        id: 'dscr_ajustado', dimension: 'endeudamiento', severidad: 'alta', piso: null,
        titulo: 'DSCR ajustado',
        detalle: `DSCR ${fmtX(dscr)}: margen escaso sobre el servicio de deuda (mínimo sano ${fmtX(RATIO_THRESHOLDS.dscr.sano)}).`,
      });
    }
  }

  const cobertura = ratios.cobertura_intereses.actual;
  if (cobertura !== null && cobertura < RATIO_THRESHOLDS.cobertura_intereses.alerta) {
    add({
      id: 'cobertura_baja', dimension: 'endeudamiento', severidad: cobertura < 1 ? 'alta' : 'media', piso: null,
      titulo: 'Baja cobertura de intereses',
      detalle: `EBITDA / intereses ${fmtX(cobertura)}${cobertura < 1 ? ': el EBITDA no cubre los intereses' : ''}.`,
    });
  }

  const deudaCP = extraction.deuda_bancaria_actual.corriente.total;
  if (deudaTotal > 0 && deudaCP / deudaTotal > P.deuda.cortoPlazoShare) {
    add({
      id: 'deuda_corto_plazo', dimension: 'endeudamiento', severidad: 'media', piso: null,
      titulo: 'Deuda concentrada en el corto plazo',
      detalle: `${Math.round((deudaCP / deudaTotal) * 100)}% de la deuda bancaria vence en los próximos 12 meses: riesgo de refinanciación.`,
    });
  }

  const endeud = sinAnticipos ? ratios.endeudamiento_sin_anticipos.actual : ratios.endeudamiento.actual;
  if (endeud !== null && endeud > P.deuda.pasivoPnMedia) {
    add({
      id: 'apalancamiento_alto', dimension: 'endeudamiento', severidad: endeud > P.deuda.pasivoPnAlta ? 'alta' : 'media', piso: null,
      titulo: 'Apalancamiento elevado',
      detalle: `Pasivo / patrimonio neto ${fmtX(endeud)}${notaAnticipos}.`,
    });
  }

  const deudaME = info?.deuda_financiera_moneda_extranjera ?? 0;
  const exportPct = info?.porcentaje_ventas_exportacion ?? 0;
  if (deudaME > 0 && exportPct < P.descalce.exportacionCubrePct) {
    const share = deudaTotal > 0 ? deudaME / deudaTotal : 1;
    add({
      id: 'descalce_moneda', dimension: 'endeudamiento', severidad: share > P.descalce.shareAlto ? 'alta' : 'media', piso: null,
      titulo: 'Descalce de moneda',
      detalle: `Deuda en moneda extranjera ${fmtMiles(deudaME)} (${Math.round(share * 100)}% de la deuda bancaria) con exportaciones del ${Math.round(exportPct)}% de las ventas.`,
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

  const lc = sinAnticipos ? ratios.liquidez_corriente_sin_anticipos.actual : ratios.liquidez_corriente.actual;
  const lcBaja = lc !== null && lc < RATIO_THRESHOLDS.liquidez_corriente.alerta;
  if (lcBaja) {
    add({
      id: 'liquidez_corriente_baja', dimension: 'liquidez_solvencia', severidad: 'alta', piso: null,
      titulo: 'Liquidez corriente menor a 1',
      detalle: `Liquidez corriente ${fmtX(lc!)}${notaAnticipos}: el pasivo de corto plazo supera al activo corriente (capital de trabajo ${fmtMiles(ratios.capital_de_trabajo.actual ?? 0)}).`,
    });
  }
  const acida = ratios.liquidez_acida.actual;
  if (acida !== null && acida < RATIO_THRESHOLDS.liquidez_acida.alerta && !lcBaja) {
    add({
      id: 'prueba_acida_baja', dimension: 'liquidez_solvencia', severidad: 'media', piso: null,
      titulo: 'Prueba ácida baja',
      detalle: `Prueba ácida ${fmtX(acida)}: la liquidez depende de vender stock.`,
    });
  }

  const ciclo = ratios.ciclo_conversion_caja;
  if (ciclo.actual !== null && ciclo.anterior !== null && ciclo.actual - ciclo.anterior > P.liquidez.ciclosDiasAumento) {
    add({
      id: 'ciclo_caja_crece', dimension: 'liquidez_solvencia', severidad: 'media', piso: null,
      titulo: 'Se alarga el ciclo de conversión de caja',
      detalle: `Pasa de ${Math.round(ciclo.anterior)} a ${Math.round(ciclo.actual)} días: más necesidad de financiar capital de trabajo.`,
    });
  }

  const calidad = ratios.calidad_ganancia.actual;
  if (calidad !== null && calidad < RATIO_THRESHOLDS.calidad_ganancia.alerta) {
    add({
      id: 'calidad_ganancia_baja', dimension: 'liquidez_solvencia', severidad: 'media', piso: null,
      titulo: 'Baja calidad de la ganancia',
      detalle: `Flujo operativo / EBITDA ${Math.round(calidad * 100)}%: el EBITDA queda atrapado en capital de trabajo.`,
    });
  }

  // ---------- Rentabilidad y ventas ----------
  if (ventasVar !== null && ventasVar < 0) {
    add({
      id: 'ventas_caen', dimension: 'rentabilidad', severidad: 'alta', piso: null,
      titulo: enMonedaHomogenea ? 'Caída real de ventas' : 'Caída nominal de ventas',
      detalle: enMonedaHomogenea
        ? `Ventas ${fmtPct(ventasVar)} en moneda homogénea (RT 6).`
        : `Ventas ${fmtPct(ventasVar)} en pesos corrientes: con inflación, la caída real es mayor.`,
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
  if (me.actual !== null && me.anterior !== null && (me.anterior - me.actual) * 100 > P.rentabilidad.caidaMargenEbitdaPp) {
    add({
      id: 'margen_ebitda_cae', dimension: 'rentabilidad', severidad: 'media', piso: null,
      titulo: 'Caída del margen EBITDA',
      detalle: `Margen EBITDA de ${(me.anterior * 100).toFixed(1)}% a ${(me.actual * 100).toFixed(1)}%.`,
    });
  }

  const recpam = er.recpam ?? null;
  if (recpam !== null && er.resultado_neto !== 0 && Math.abs(recpam) > Math.abs(er.resultado_neto) * P.rentabilidad.recpamSobreResultado) {
    add({
      id: 'recpam_relevante', dimension: 'rentabilidad', severidad: 'media', piso: null,
      titulo: 'El resultado depende del RECPAM',
      detalle: `RECPAM ${fmtMiles(recpam)} frente a un resultado neto de ${fmtMiles(er.resultado_neto)}: separarlo para ver el resultado operativo genuino.`,
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
      if (ratio > P.postBalance.deudaShareMedia) {
        add({
          id: 'deuda_post_balance', dimension: 'ventas_post_balance', severidad: ratio > P.postBalance.deudaShareAlta ? 'alta' : 'media', piso: null,
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
  if (info?.opinion_auditor === 'adversa' || info?.opinion_auditor === 'abstencion') {
    add({
      id: 'auditor_adverso', dimension: 'calidad_informacion',
      severidad: P.auditor.adversaOAbstencion.severidad, piso: P.auditor.adversaOAbstencion.piso,
      titulo: info.opinion_auditor === 'adversa' ? 'Opinión adversa del auditor' : 'Abstención de opinión del auditor',
      detalle: info.detalle_opinion_auditor ?? 'Los estados contables no son confiables según el auditor.',
    });
  } else if (info?.opinion_auditor === 'con_salvedades') {
    add({
      id: 'auditor_salvedades', dimension: 'calidad_informacion', severidad: P.auditor.conSalvedades.severidad, piso: null,
      titulo: 'Opinión del auditor con salvedades',
      detalle: info.detalle_opinion_auditor ?? 'El informe del auditor incluye salvedades.',
    });
  }
  if (info?.balance_ajustado_por_inflacion === false) {
    add({
      id: 'sin_ajuste_inflacion', dimension: 'calidad_informacion', severidad: 'media', piso: null,
      titulo: 'Balance no expresado en moneda homogénea',
      detalle: 'Sin ajuste por inflación (RT 6): las comparaciones interanuales están distorsionadas.',
    });
  }

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

  // ---------- Financieras (modelo propio) ----------
  if (perfil.modelo === 'financiera' && perfil.senalesFinanciera) {
    detectarSenalesFinanciera(extraction, ratios, perfil, documentos, add);
  }

  // Señales desactivadas por el rubro (o de ratios que no aplican): no suman.
  const desactivadas = new Set(perfil.senalesDesactivadas.map(d => d.id));
  const orden: Record<SeveridadRiesgo, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  return out.filter(s => !desactivadas.has(s.id)).sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}

// Señales de financieras. Los documentos (reporte de mora) son declarados por el
// cliente: pueden agregar señales, pero una señal con piso que dispara el
// balance no se levanta por un reporte más favorable.
function detectarSenalesFinanciera(
  extraction: RawExtraction,
  ratios: ComputedRatios,
  perfil: PerfilEfectivo,
  documentos: DocumentoSectorial[] | null,
  add: (s: RiskSignal) => void,
) {
  const F = perfil.senalesFinanciera!;
  const U = perfil.umbrales;
  const ind = indicadoresFinancieros(extraction, documentos, { disponibilidades: disponibilidadesActuales(extraction) });
  const v = ind.valores;
  const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
  const fuente = ind.mora.fuente === 'reporte'
    ? ` (fuente: reporte de mora${ind.mora.fechaCorte ? ` al ${ind.mora.fechaCorte}` : ''}, declarado por el cliente)`
    : ind.mora.fuente === 'balance' ? ' (fuente: balance)' : '';

  if (ind.mora.fuente === null) {
    add({
      id: 'sin_datos_cartera', dimension: 'calidad_informacion', severidad: 'alta', piso: null,
      titulo: 'Sin datos de la cartera',
      detalle: 'No hay reporte de mora ni bloque financiero del balance: no se puede medir la calidad de la cartera.',
    });
  }

  const mora = v.mora.actual;
  if (mora !== null && U.mora && mora > U.mora.alerta) {
    add({
      id: 'mora_alta', dimension: 'calidad_cartera', severidad: 'alta', piso: null,
      titulo: 'Mora por encima del umbral de alerta',
      detalle: `Mora ${pct(mora)}${fuente}; alerta del sub-segmento: ${pct(U.mora.alerta)}.`,
    });
  }
  const cob = v.cobertura.actual;
  if (cob !== null && cob < F.coberturaMinima) {
    add({
      id: 'cobertura_mora_baja', dimension: 'calidad_cartera', severidad: 'alta', piso: null,
      titulo: 'Mora poco previsionada',
      detalle: `Previsiones / cartera > 90 días ${pct(cob)}${fuente} (mínimo ${pct(F.coberturaMinima)}).`,
    });
  }

  // PN ajustado: se evalúa con la fuente elegida y con el balance; manda el peor.
  const pn = extraction.ejercicio_actual.estado_situacion_patrimonial.patrimonio_neto;
  const candidatos = [v.pn_ajustado.actual, ind.pnAjustadoBalance].filter((x): x is number => x !== null);
  const pnAj = candidatos.length ? Math.min(...candidatos) : null;
  if (pnAj !== null && pnAj <= 0) {
    add({
      id: 'pn_ajustado_negativo', dimension: 'endeudamiento', severidad: 'critica', piso: F.pnAjustadoNegativoPiso,
      titulo: 'La mora no cubierta se come el patrimonio',
      detalle: `PN ajustado $ ${Math.round(pnAj).toLocaleString('es-AR')} miles (PN − cartera > 90 días no previsionada).`,
    });
  } else if (pnAj !== null && pn > 0 && pnAj / pn < F.pnAjustadoMinimoSobrePn) {
    add({
      id: 'pn_ajustado_bajo', dimension: 'endeudamiento', severidad: 'alta', piso: null,
      titulo: 'PN ajustado por mora bajo',
      detalle: `PN ajustado $ ${Math.round(pnAj).toLocaleString('es-AR')} miles: ${pct(pnAj / pn)} del PN (mínimo ${pct(F.pnAjustadoMinimoSobrePn)}).`,
    });
  }

  const cargo = v.cargo_sobre_resultado.actual;
  if (cargo !== null && cargo > F.cargoSobreResultadoMaximo) {
    add({
      id: 'cargo_incobrabilidad_alto', dimension: 'calidad_cartera', severidad: 'alta', piso: null,
      titulo: 'La incobrabilidad se come el resultado',
      detalle: `Cargo por incobrabilidad / resultado antes de previsiones ${pct(cargo)} (máximo ${pct(F.cargoSobreResultadoMaximo)}).`,
    });
  }
  const liq = v.liquidez_90d.actual;
  if (liq !== null && liq < F.liquidez90Minima) {
    add({
      id: 'liquidez_90d_baja', dimension: 'liquidez_solvencia', severidad: 'alta', piso: null,
      titulo: 'No cubre lo que vence en 90 días',
      detalle: `Liquidez a 90 días ${liq.toFixed(2).replace('.', ',')}x: lo que cobra y tiene en caja no alcanza para los pasivos que vencen.`,
    });
  }
  const conc = v.concentracion_fondeo.actual;
  if (conc !== null && conc > F.concentracionFondeoMaxima) {
    add({
      id: 'fondeo_concentrado', dimension: 'liquidez_solvencia', severidad: 'media', piso: null,
      titulo: 'Fondeo concentrado',
      detalle: `La principal fuente de fondeo es el ${pct(conc)} del total.`,
    });
  }
  const roa = ratios.roa;
  if (roa.actual !== null && roa.actual < 0) {
    const repetido = roa.anterior !== null && roa.anterior < 0;
    add({
      id: 'roa_negativo', dimension: 'rentabilidad', severidad: repetido ? 'alta' : 'media', piso: null,
      titulo: repetido ? 'ROA negativo en los dos ejercicios' : 'ROA negativo',
      detalle: `ROA ${pct(roa.actual)}${repetido ? ` (anterior ${pct(roa.anterior!)})` : ''}.`,
    });
  }
  const brecha = v.brecha_crecimiento_cartera_pn.actual;
  if (brecha !== null && brecha > F.brechaCarteraPnMaxima) {
    add({
      id: 'cartera_crece_sobre_pn', dimension: 'endeudamiento', severidad: 'media', piso: null,
      titulo: 'La cartera crece mucho más que el patrimonio',
      detalle: `La cartera crece ${(brecha * 100).toFixed(0)} p.p. por encima del PN (máximo ${(F.brechaCarteraPnMaxima * 100).toFixed(0)} p.p.).`,
    });
  }
}

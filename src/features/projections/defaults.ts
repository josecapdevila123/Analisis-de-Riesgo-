import { RawExtraction } from '../extraction/schemas';
import { ComputedRatios } from '../ratios/calculations';
import { PROJECTION_PARAMS as P } from '../risk/policy';
import {
  BaseModelo,
  CampoSupuesto,
  ESCENARIOS,
  EscenarioId,
  OverridesBase,
  OverridesEscenario,
  ProyeccionesGuardadas,
  Sugerido,
  Supuestos,
} from './types';

// Supuestos SUGERIDOS a partir de la extracción y los ratios, cada uno con su
// fuente. Funciones puras. Nunca se inventa un valor: si falta un dato, el
// sugerido queda en null con un aviso y el analista lo completa.
//
// Moneda: todo en pesos del CIERRE del balance. El balance no se toca; lo
// posterior al cierre (ventas mensuales y deuda post balance) se lleva a esa
// moneda con la inflación mensual que carga el analista.

const pct = (v: number, dec = 1) => `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: dec })}%`;
const miles = (v: number) => Math.round(v).toLocaleString('es-AR');

type MesPost = { mes: string; k: number; monto: number; anterior: number | null };

// Meses posteriores al cierre en pesos (los USD se excluyen: no hay tipo de cambio confiable).
// k = meses desde el cierre (1 = primer mes posterior), según el orden informado.
export function mesesPostCierre(extraction: RawExtraction): { meses: MesPost[]; excluidosUsd: number } {
  const todos = extraction.analisis_post_cierre?.detalle_ventas_mensuales ?? [];
  const ars = todos.filter(v => (v.moneda ?? 'ARS') === 'ARS');
  return {
    meses: ars.slice(0, 12).map((v, i) => ({ mes: v.mes, k: i + 1, monto: v.monto, anterior: v.monto_anio_anterior })),
    excluidosUsd: todos.length - ars.length,
  };
}

// Ventas post cierre y del mismo período del año anterior, en moneda de cierre:
// un mes k posterior se deflacta k meses; el mismo mes del año anterior (12 − k
// meses antes del cierre) se infla hasta el cierre.
export function ventasPostEnMonedaCierre(meses: MesPost[], inflacionMensual: number) {
  const conComparativo = meses.filter(m => m.anterior !== null && m.anterior > 0);
  const actual = conComparativo.reduce((a, m) => a + m.monto / Math.pow(1 + inflacionMensual, m.k), 0);
  const anterior = conComparativo.reduce((a, m) => a + (m.anterior as number) * Math.pow(1 + inflacionMensual, 12 - m.k), 0);
  return { actual, anterior, meses: conComparativo.length };
}

export type SugeridosBase = {
  inflacionRequerida: boolean;
  ventas: Sugerido<number>;
  deudaCorriente: Sugerido<number>;
  deudaNoCorriente: Sugerido<number>;
  deudaPostBalance: Sugerido<number>;
  avisos: string[];
};

export function sugerirBase(extraction: RawExtraction, inflacionMensual: number | null): SugeridosBase {
  const anio = extraction.company_profile.anio_actual || 'actual';
  const ventasEj = extraction.ejercicio_actual.estado_resultados.ventas_netas;
  const rt6 = extraction.informacion_complementaria?.balance_ajustado_por_inflacion === true;
  const { meses, excluidosUsd } = mesesPostCierre(extraction);
  const conComparativo = meses.filter(m => m.anterior !== null && m.anterior > 0);
  const deudaPost = (extraction.analisis_post_cierre?.deuda_bancaria_post_balance_detalle ?? []);
  const deudaPostArs = deudaPost.filter(d => (d.moneda ?? 'ARS') === 'ARS').reduce((a, d) => a + d.monto, 0);
  const deudaPostUsd = deudaPost.some(d => d.moneda === 'USD');
  const avisos: string[] = [];
  if (excluidosUsd > 0) avisos.push(`${excluidosUsd} mes(es) de ventas post cierre en USD quedan fuera: no hay tipo de cambio confiable.`);
  if (deudaPostUsd) avisos.push('La deuda post balance en USD queda fuera; cargala a mano en pesos si corresponde.');
  if (!rt6) avisos.push('El balance no informa ajuste por inflación (RT 6): las cifras del ejercicio son nominales.');

  const inflacionRequerida = conComparativo.length > 0 || deudaPostArs > 0 || (!rt6 && extraction.ejercicio_anterior !== null);
  const faltaInflacion = 'Cargá la inflación mensual para llevar los datos post cierre a moneda de cierre.';

  // Ventas base: últimos 12 meses si hay post cierre con comparativo; si no, las del ejercicio.
  let ventas: Sugerido<number>;
  if (conComparativo.length > 0) {
    if (inflacionMensual === null) {
      ventas = { valor: null, fuente: `Ventas ${anio} + ${conComparativo.length} meses post cierre − mismos meses del año anterior`, aviso: faltaInflacion };
    } else {
      const post = ventasPostEnMonedaCierre(meses, inflacionMensual);
      ventas = {
        valor: ventasEj + post.actual - post.anterior,
        fuente: `Últimos 12 meses: ventas ${anio} (${miles(ventasEj)}) + ${post.meses} meses post cierre (${miles(post.actual)}) − mismos meses del año anterior (${miles(post.anterior)}), en moneda de cierre con inflación mensual ${pct(inflacionMensual)}`,
      };
    }
  } else {
    ventas = { valor: ventasEj, fuente: `Ventas netas del ejercicio ${anio}${rt6 ? ' (moneda homogénea)' : ''}`, aviso: rt6 ? undefined : 'Ventas nominales del ejercicio: el balance no está en moneda homogénea.' };
  }

  const deudaCorriente = { valor: extraction.deuda_bancaria_actual.corriente.total, fuente: `Deuda bancaria corriente del balance ${anio}` };
  const deudaNoCorriente = { valor: extraction.deuda_bancaria_actual.no_corriente.total, fuente: `Deuda bancaria no corriente del balance ${anio}` };

  // Deuda post balance: se asume tomada al final del período post cierre informado.
  let deudaPostBalance: Sugerido<number>;
  if (deudaPostArs <= 0) {
    deudaPostBalance = { valor: 0, fuente: 'Sin deuda bancaria post balance en pesos' };
  } else if (inflacionMensual === null) {
    deudaPostBalance = { valor: null, fuente: `Deuda post balance informada: ${miles(deudaPostArs)} nominal`, aviso: faltaInflacion };
  } else {
    const n = meses.length;
    deudaPostBalance = {
      valor: deudaPostArs / Math.pow(1 + inflacionMensual, n),
      fuente: `Deuda post balance ${miles(deudaPostArs)} nominal, llevada a moneda de cierre (${n} meses con inflación ${pct(inflacionMensual)} mensual)`,
    };
  }

  return { inflacionRequerida, ventas, deudaCorriente, deudaNoCorriente, deudaPostBalance, avisos };
}

// ---------- Supuestos por escenario ----------

export type SugeridosEscenario = {
  horizonte: Sugerido<number>;
  crecimiento: Array<Sugerido<number>>;
} & Record<Exclude<CampoSupuesto, 'horizonte'>, Sugerido<number | boolean>>;

const clamp = (v: number) => Math.max(P.crecimientoMin, Math.min(P.crecimientoMax, v));

export function sugerirCrecimiento(extraction: RawExtraction, inflacionMensual: number | null): Sugerido<number> {
  const rt6 = extraction.informacion_complementaria?.balance_ajustado_por_inflacion === true;
  const { meses } = mesesPostCierre(extraction);
  const acotar = (g: number, fuente: string): Sugerido<number> => {
    const c = clamp(g);
    return { valor: c, fuente: c !== g ? `${fuente}: ${pct(g)}, acotado a ${pct(c)}` : fuente };
  };
  if (meses.some(m => m.anterior !== null && m.anterior > 0)) {
    if (inflacionMensual === null) {
      return { valor: null, fuente: 'Ventas post cierre vs. mismos meses del año anterior', aviso: 'Falta la inflación mensual para calcular el crecimiento real.' };
    }
    const post = ventasPostEnMonedaCierre(meses, inflacionMensual);
    return acotar(post.actual / post.anterior - 1, `Crecimiento real de ${post.meses} meses post cierre vs. el año anterior`);
  }
  const act = extraction.ejercicio_actual.estado_resultados.ventas_netas;
  const ant = extraction.ejercicio_anterior?.estado_resultados.ventas_netas;
  if (!ant) {
    return { valor: null, fuente: 'Sin ejercicio anterior ni ventas post cierre con comparativo', aviso: 'No hay con qué estimar el crecimiento: cargalo a mano.' };
  }
  const anios = `${extraction.company_profile.anio_anterior || 'anterior'}→${extraction.company_profile.anio_actual || 'actual'}`;
  if (rt6) return acotar(act / ant - 1, `Variación de ventas ${anios} en moneda homogénea (RT 6)`);
  if (inflacionMensual === null) {
    return { valor: null, fuente: `Variación de ventas ${anios}, deflactada`, aviso: 'El balance no está ajustado por inflación: falta la inflación mensual para deflactar.' };
  }
  const anual = Math.pow(1 + inflacionMensual, 12) - 1;
  return acotar(act / (ant * (1 + anual)) - 1, `Variación de ventas ${anios} deflactada con inflación anual ${pct(anual)}`);
}

function sugerirBaseEscenario(extraction: RawExtraction, ratios: ComputedRatios, inflacionMensual: number | null): SugeridosEscenario {
  const anio = extraction.company_profile.anio_actual || 'actual';
  const anioAnt = extraction.company_profile.anio_anterior || 'anterior';
  const ventas = extraction.ejercicio_actual.estado_resultados.ventas_netas;

  const me = ratios.margen_ebitda;
  const margenEbitda: Sugerido<number> = me.actual !== null && me.anterior !== null
    ? { valor: (me.actual + me.anterior) / 2, fuente: `Promedio margen EBITDA ${anioAnt}–${anio} (${pct(me.anterior)} y ${pct(me.actual)})` }
    : me.actual !== null
      ? { valor: me.actual, fuente: `Margen EBITDA ${anio} (sin ejercicio anterior)` }
      : { valor: null, fuente: 'Margen EBITDA', aviso: 'No se pudo calcular el margen EBITDA.' };

  const dep = extraction.ejercicio_actual.flujo_efectivo.depreciacion_bienes_de_uso;
  const capexPct: Sugerido<number> = dep !== null && ventas > 0
    ? { valor: Math.abs(dep) / ventas, fuente: `Depreciación / ventas ${anio} (proxy de capex de mantenimiento)` }
    : { valor: null, fuente: 'Depreciación / ventas', aviso: 'Sin depreciación informada en el flujo de efectivo.' };

  const ktno = ratios.ktno.actual;
  const capitalTrabajoPct: Sugerido<number> = ktno !== null && ventas > 0
    ? { valor: ktno / ventas, fuente: `(Créditos por ventas + bienes de cambio − deudas comerciales) / ventas ${anio}` }
    : { valor: null, fuente: 'Capital de trabajo / ventas', aviso: 'No se pudieron identificar los rubros de capital de trabajo.' };

  const g = sugerirCrecimiento(extraction, inflacionMensual);
  const politica = (valor: number) => ({ valor, fuente: 'Política de riesgos (propuesta inicial)' });
  return {
    horizonte: politica(P.horizonte),
    crecimiento: Array.from({ length: 5 }, () => g),
    margenEbitda,
    capexPct,
    capitalTrabajoPct,
    liberarCapitalTrabajo: { valor: true, fuente: 'Escenario base: el capital de trabajo se libera si caen las ventas' },
    tasaReal: politica(P.tasaReal),
    alicuota: politica(P.alicuota),
    aniosAmortizacionNoCorriente: politica(P.aniosAmortizacionNoCorriente),
    aniosAmortizacionPostBalance: politica(P.aniosAmortizacionPostBalance),
  };
}

// ---------- Resolución: sugerido + lo editado ----------

const aplicar = (s: SugeridosEscenario, o: OverridesEscenario): Supuestos => {
  const pick = <T,>(campo: CampoSupuesto): T => (campo in o ? o[campo] : s[campo].valor) as T;
  const horizonte = Math.max(1, Math.min(5, Math.round(pick<number | null>('horizonte') ?? P.horizonte)));
  return {
    horizonte,
    crecimiento: Array.from({ length: horizonte }, (_, i) =>
      o.crecimiento && i in o.crecimiento ? (o.crecimiento[i] ?? null) : s.crecimiento[i]?.valor ?? null),
    margenEbitda: pick('margenEbitda'),
    capexPct: pick('capexPct'),
    capitalTrabajoPct: pick('capitalTrabajoPct'),
    liberarCapitalTrabajo: pick<boolean | null>('liberarCapitalTrabajo') ?? true,
    tasaReal: pick<number | null>('tasaReal') ?? P.tasaReal,
    alicuota: pick<number | null>('alicuota') ?? P.alicuota,
    aniosAmortizacionNoCorriente: pick<number | null>('aniosAmortizacionNoCorriente') ?? P.aniosAmortizacionNoCorriente,
    aniosAmortizacionPostBalance: pick<number | null>('aniosAmortizacionPostBalance') ?? P.aniosAmortizacionPostBalance,
  };
};

// Directorio y Estrés se derivan del Base EFECTIVO (con lo que haya editado el analista).
const derivar = (baseEf: Supuestos, sBase: SugeridosEscenario, esc: Exclude<EscenarioId, 'base'>): SugeridosEscenario => {
  const igual = <T,>(valor: T, nombre: string) => ({ valor, fuente: `Igual al escenario Base (${nombre})` });
  const comun = {
    horizonte: igual(baseEf.horizonte, 'horizonte'),
    capexPct: igual(baseEf.capexPct, 'capex'),
    capitalTrabajoPct: igual(baseEf.capitalTrabajoPct, 'capital de trabajo'),
    alicuota: igual(baseEf.alicuota, 'alícuota'),
    aniosAmortizacionNoCorriente: igual(baseEf.aniosAmortizacionNoCorriente, 'amortización'),
    aniosAmortizacionPostBalance: igual(baseEf.aniosAmortizacionPostBalance, 'amortización post balance'),
  };
  if (esc === 'directorio') {
    return {
      ...comun,
      crecimiento: Array.from({ length: 5 }, (_, i) => ({
        valor: baseEf.crecimiento[i] ?? sBase.crecimiento[i]?.valor ?? null,
        fuente: 'Inicia igual al Base: completalo con lo que proyecta el Directorio',
      })),
      margenEbitda: igual(baseEf.margenEbitda, 'margen'),
      liberarCapitalTrabajo: igual(baseEf.liberarCapitalTrabajo, 'capital de trabajo'),
      tasaReal: igual(baseEf.tasaReal, 'tasa'),
    };
  }
  const e = P.estres;
  return {
    ...comun,
    crecimiento: Array.from({ length: 5 }, (_, i) => ({
      valor: i === 0 ? e.crecimientoAnio1 : e.crecimientoSiguientes,
      fuente: i === 0 ? 'Política: caída real de ventas en el año 1' : 'Política: sin crecimiento después del año 1',
    })),
    margenEbitda: baseEf.margenEbitda === null
      ? { valor: null, fuente: 'Margen Base − 3 p.p.', aviso: 'Falta el margen del escenario Base.' }
      : { valor: baseEf.margenEbitda + e.margenEbitdaDelta, fuente: `Margen Base (${pct(baseEf.margenEbitda)}) − ${Math.abs(e.margenEbitdaDelta * 100)} p.p.` },
    liberarCapitalTrabajo: { valor: e.liberarCapitalTrabajo, fuente: 'Política: en estrés no se libera capital de trabajo' },
    tasaReal: { valor: baseEf.tasaReal + e.tasaRealDelta, fuente: `Tasa Base (${pct(baseEf.tasaReal)}) + ${e.tasaRealDelta * 100} p.p.` },
  };
};

export type ProyeccionResuelta = {
  sugeridosBase: SugeridosBase;
  base: BaseModelo | null;         // null si falta algún dato del año base
  faltaBase: string[];
  incluirDeudaPostBalance: boolean;
  sugeridos: Record<EscenarioId, SugeridosEscenario>;
  supuestos: Record<EscenarioId, Supuestos>;
};

export function resolverProyeccion(
  extraction: RawExtraction,
  ratios: ComputedRatios,
  guardadas: ProyeccionesGuardadas
): ProyeccionResuelta {
  const ob: OverridesBase = guardadas.base;
  const inflacion = ob.inflacionMensual ?? null;
  const sugeridosBase = sugerirBase(extraction, inflacion);
  const val = (k: 'ventas' | 'deudaCorriente' | 'deudaNoCorriente' | 'deudaPostBalance') =>
    k in ob && ob[k] !== undefined ? (ob[k] as number | null) : sugeridosBase[k].valor;
  const incluirDeudaPostBalance = ob.incluirDeudaPostBalance ?? true;

  const faltaBase: string[] = [];
  if (sugeridosBase.inflacionRequerida && inflacion === null) faltaBase.push('inflación mensual');
  const ventas = val('ventas');
  const deudaCorriente = val('deudaCorriente');
  const deudaNoCorriente = val('deudaNoCorriente');
  const deudaPost = incluirDeudaPostBalance ? val('deudaPostBalance') : 0;
  if (ventas === null) faltaBase.push('ventas base');
  if (deudaPost === null) faltaBase.push('deuda post balance');
  const base = ventas !== null && deudaCorriente !== null && deudaNoCorriente !== null && deudaPost !== null
    ? { ventas, deudaCorriente, deudaNoCorriente, deudaPostBalance: deudaPost }
    : null;

  const sBase = sugerirBaseEscenario(extraction, ratios, inflacion);
  const baseEf = aplicar(sBase, guardadas.escenarios.base);
  const sDir = derivar(baseEf, sBase, 'directorio');
  const sEst = derivar(baseEf, sBase, 'estres');
  const sugeridos = { base: sBase, directorio: sDir, estres: sEst };
  const supuestos = Object.fromEntries(
    ESCENARIOS.map(e => [e, e === 'base' ? baseEf : aplicar(sugeridos[e], guardadas.escenarios[e])])
  ) as Record<EscenarioId, Supuestos>;

  return { sugeridosBase, base, faltaBase, incluirDeudaPostBalance, sugeridos, supuestos };
}

import { BaseModelo, FilaProyeccion, ResultadoProyeccion, Supuestos } from './types';

// Modelo determinístico de flujo de fondos para capacidad de repago. Sin IA,
// sin React, sin efectos: mismos datos → mismo resultado.
//
// Por año t = 1..N:
//   Ventas_t     = Ventas_{t-1} × (1 + crecimiento_t)
//   EBITDA_t     = Ventas_t × margen
//   Capex_t      = Ventas_t × capex%            (o monto fijo, solo en tests)
//   Intereses_t  = SaldoDeuda_inicio_t × tasa real
//   Impuestos_t  = max(0, alícuota × (EBITDA_t − Capex_t − Intereses_t))
//                  → el capex de mantenimiento se usa como proxy de la depreciación.
//   ΔCT_t        = CT% × (Ventas_t − Ventas_{t-1}); sin liberación: max(0, ΔCT_t)
//   CFADS_t      = EBITDA_t − Impuestos_t − Capex_t − ΔCT_t
//   Amortización = deuda corriente en t=1; no corriente en partes iguales desde t=2;
//                  deuda post balance en partes iguales desde t=1.
//   Servicio_t   = Intereses_t + Amortización_t (+ servicio de deuda nueva, hoy 0)
//   DSCR_t       = CFADS_t / Servicio_t (servicio 0 → null, "sin deuda")

export type ProyectarOpciones = {
  // Servicio anual de una deuda nueva (para la futura propuesta de crédito).
  servicioDeudaNueva?: number[];
};

// Supuestos mínimos para poder proyectar.
export const faltantes = (s: Supuestos): string[] => {
  const out: string[] = [];
  if (s.margenEbitda === null) out.push('margen EBITDA');
  if (s.capexPct === null && s.capexMonto === undefined) out.push('capex de mantenimiento');
  if (s.capitalTrabajoPct === null) out.push('capital de trabajo');
  if (s.crecimiento.slice(0, s.horizonte).some(g => g === null)) out.push('crecimiento de ventas');
  return out;
};

const cuotas = (monto: number, anios: number, desde: number, t: number) => {
  if (monto <= 0 || anios <= 0) return 0;
  return t >= desde && t < desde + anios ? monto / anios : 0;
};

export function proyectar(base: BaseModelo, s: Supuestos, opciones: ProyectarOpciones = {}): ResultadoProyeccion {
  const falta = faltantes(s);
  if (falta.length > 0) throw new Error(`Faltan supuestos: ${falta.join(', ')}`);

  const horizonte = Math.max(1, Math.min(5, Math.round(s.horizonte)));
  const filas: FilaProyeccion[] = [];
  let ventasPrev = base.ventas;
  let saldo = base.deudaCorriente + base.deudaNoCorriente + base.deudaPostBalance;
  let caja = 0;

  for (let t = 1; t <= horizonte; t++) {
    const ventas = ventasPrev * (1 + (s.crecimiento[t - 1] as number));
    const ebitda = ventas * (s.margenEbitda as number);
    const capex = s.capexMonto ?? ventas * (s.capexPct as number);
    const intereses = saldo * s.tasaReal;
    const impuestos = Math.max(0, s.alicuota * (ebitda - capex - intereses));
    const deltaBruto = (s.capitalTrabajoPct as number) * (ventas - ventasPrev);
    const deltaCapitalTrabajo = s.liberarCapitalTrabajo ? deltaBruto : Math.max(0, deltaBruto);
    const cfads = ebitda - impuestos - capex - deltaCapitalTrabajo;

    const amortizacion = Math.min(
      saldo,
      (t === 1 ? base.deudaCorriente : 0) +
        cuotas(base.deudaNoCorriente, s.aniosAmortizacionNoCorriente, 2, t) +
        cuotas(base.deudaPostBalance, s.aniosAmortizacionPostBalance, 1, t)
    );
    const servicioDeudaNueva = opciones.servicioDeudaNueva?.[t - 1] ?? 0;
    const servicio = intereses + amortizacion + servicioDeudaNueva;
    const saldoFin = saldo - amortizacion;
    caja += cfads - servicio;

    filas.push({
      anio: t,
      ventas,
      ebitda,
      impuestos,
      capex,
      deltaCapitalTrabajo,
      cfads,
      intereses,
      amortizacion,
      servicioDeudaNueva,
      servicio,
      dscr: servicio > 0 ? cfads / servicio : null,
      saldoInicio: saldo,
      saldoFin,
      deudaEbitda: ebitda > 0 ? saldoFin / ebitda : null,
      cajaAcumulada: caja,
    });
    ventasPrev = ventas;
    saldo = saldoFin;
  }

  const conServicio = filas.filter(f => f.dscr !== null);
  const min = conServicio.reduce<FilaProyeccion | null>((m, f) => (m === null || (f.dscr as number) < (m.dscr as number) ? f : m), null);
  return { filas, dscrMinimo: min ? { valor: min.dscr as number, anio: min.anio } : null };
}

// Punto de quiebre: caída real de ventas en el año 1 (manteniendo el resto de
// los supuestos) que lleva el DSCR mínimo a 1,0x. Se calcula SIN liberación de
// capital de trabajo: si no, una caída de ventas libera caja y el DSCR no baja
// en forma monótona, y el punto de quiebre sería engañoso.
export type PuntoDeQuiebre =
  | { tipo: 'valor'; crecimientoAnio1: number }
  | { tipo: 'no_se_alcanza' }   // ni con −90% de ventas el DSCR baja de 1x
  | { tipo: 'ya_debajo' }       // aun con +50% el DSCR mínimo queda debajo de 1x
  | { tipo: 'sin_deuda' };

const LIMITE_CAIDA = -0.9;
const LIMITE_SUBA = 0.5;

export function puntoDeQuiebre(base: BaseModelo, s: Supuestos, objetivo = 1): PuntoDeQuiebre {
  const sinLiberacion: Supuestos = { ...s, liberarCapitalTrabajo: false };
  const dscrMin = (g: number) => {
    const crecimiento = [...sinLiberacion.crecimiento];
    crecimiento[0] = g;
    return proyectar(base, { ...sinLiberacion, crecimiento }).dscrMinimo?.valor ?? null;
  };
  const enCaida = dscrMin(LIMITE_CAIDA);
  const enSuba = dscrMin(LIMITE_SUBA);
  if (enCaida === null || enSuba === null) return { tipo: 'sin_deuda' };
  if (enCaida >= objetivo) return { tipo: 'no_se_alcanza' };
  if (enSuba < objetivo) return { tipo: 'ya_debajo' };

  let lo = LIMITE_CAIDA;
  let hi = LIMITE_SUBA;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if ((dscrMin(mid) as number) < objetivo) lo = mid;
    else hi = mid;
  }
  return { tipo: 'valor', crecimientoAnio1: hi };
}

// Margen para deuda nueva: cuota anual adicional que el flujo soporta manteniendo
// el DSCR objetivo en todos los años: min_t(CFADS_t / objetivo − Servicio_t).
export function margenDeudaNueva(resultado: ResultadoProyeccion, dscrObjetivo: number): number {
  return Math.min(...resultado.filas.map(f => f.cfads / dscrObjetivo - f.servicio));
}

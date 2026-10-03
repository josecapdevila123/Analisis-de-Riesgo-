// Evolución de la deuda en el sistema financiero (Nosis / Central de Deudores).
// Sin IA y sin React: arma la serie mensual a partir de las filas extraídas
// (una por entidad y por mes). Montos en miles de pesos corrientes de cada mes:
// la serie NO está ajustada por inflación.

export type FilaEvolucion = {
  periodo?: string | null;
  entidad?: string | null;
  monto?: number | null;
  situacion?: number | null;
};

export type PuntoTotal = {
  periodo: string;            // "AAAA-MM"
  total: number;
  peorSituacion: number | null;
  entidades: number;          // entidades con deuda > 0 ese mes
};

export type SerieEntidad = {
  entidad: string;
  puntos: Array<{ periodo: string; monto: number; situacion: number | null }>; // alineada a todos los períodos
  ultimo: number;
  peorSituacion: number | null; // peor en todo el período
};

export type Variacion = { desde: string; hasta: string; abs: number; pct: number | null };

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

// Acepta "AAAA-MM", "AAAA/MM", "MM/AAAA", "MM-AAAA" y "ene-25" / "ene 2025".
export function normalizarPeriodo(p: string | null | undefined): string | null {
  if (!p) return null;
  const s = p.trim().toLowerCase();
  const armar = (anio: number, mes: number) =>
    mes >= 1 && mes <= 12 && anio >= 1990 && anio <= 2100 ? `${anio}-${String(mes).padStart(2, '0')}` : null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return armar(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return armar(+m[2], +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*[-/\s.]*(\d{2}|\d{4})$/);
  if (m && MESES[m[1]]) {
    const anio = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    return armar(anio, MESES[m[1]]);
  }
  return null;
}

const ETIQUETA_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const etiquetaPeriodo = (p: string) => `${ETIQUETA_MES[+p.slice(5, 7) - 1]}-${p.slice(2, 4)}`;

const mesesEntre = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

const peor = (a: number | null, b: number | null | undefined) =>
  b === null || b === undefined ? a : a === null ? b : Math.max(a, b);

// Filas válidas: período reconocible y monto numérico.
const validas = (filas: FilaEvolucion[]) =>
  filas
    .map(f => ({ ...f, periodo: normalizarPeriodo(f.periodo), monto: Number(f.monto) }))
    .filter((f): f is FilaEvolucion & { periodo: string; monto: number } => f.periodo !== null && Number.isFinite(f.monto));

const esTotal = (e: string | null | undefined) => (e ?? '').trim().toUpperCase() === 'TOTAL';

// Total por mes. Si un mes tiene filas por entidad, se suman esas; la fila
// "TOTAL" se usa solo en los meses que no vienen abiertos por entidad.
export function serieTotal(filas: FilaEvolucion[]): PuntoTotal[] {
  const porMes = new Map<string, ReturnType<typeof validas>>();
  for (const f of validas(filas)) {
    const lista = porMes.get(f.periodo) ?? [];
    lista.push(f);
    porMes.set(f.periodo, lista);
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, lista]) => {
      const abiertas = lista.filter(f => !esTotal(f.entidad));
      const usadas = abiertas.length > 0 ? abiertas : lista;
      return {
        periodo,
        total: usadas.reduce((a, f) => a + f.monto, 0),
        peorSituacion: usadas.reduce<number | null>((a, f) => peor(a, f.situacion), null),
        entidades: abiertas.filter(f => f.monto > 0).length,
      };
    });
}

// Serie por entidad, alineada a todos los períodos de la serie total. Un mes en
// el que la entidad no figura se toma como deuda 0 (en la Central de Deudores,
// no figurar es no deber). Ordenadas por deuda del último mes, de mayor a menor.
export function seriePorEntidad(filas: FilaEvolucion[]): SerieEntidad[] {
  const periodos = serieTotal(filas).map(p => p.periodo);
  const porEntidad = new Map<string, Map<string, { monto: number; situacion: number | null }>>();
  for (const f of validas(filas)) {
    if (esTotal(f.entidad)) continue;
    const nombre = (f.entidad ?? '').trim() || 'Sin nombre';
    const meses = porEntidad.get(nombre) ?? new Map();
    const previo = meses.get(f.periodo);
    meses.set(f.periodo, {
      monto: (previo?.monto ?? 0) + f.monto,
      situacion: peor(previo?.situacion ?? null, f.situacion),
    });
    porEntidad.set(nombre, meses);
  }
  return [...porEntidad.entries()]
    .map(([entidad, meses]) => {
      const puntos = periodos.map(periodo => ({ periodo, monto: meses.get(periodo)?.monto ?? 0, situacion: meses.get(periodo)?.situacion ?? null }));
      return {
        entidad,
        puntos,
        ultimo: puntos[puntos.length - 1]?.monto ?? 0,
        peorSituacion: puntos.reduce<number | null>((a, p) => peor(a, p.situacion), null),
      };
    })
    .sort((a, b) => b.ultimo - a.ultimo);
}

// Variación entre el último mes y el de `meses` atrás (por calendario, no por
// posición). null si ese mes no está en la serie. pct null si la base es 0.
export function variacion(serie: Array<{ periodo: string; total: number }>, meses: number): Variacion | null {
  if (serie.length < 2) return null;
  const hasta = serie[serie.length - 1];
  const desde = serie.find(p => mesesEntre(p.periodo, hasta.periodo) === meses);
  if (!desde) return null;
  const abs = hasta.total - desde.total;
  return { desde: desde.periodo, hasta: hasta.periodo, abs, pct: desde.total !== 0 ? abs / desde.total : null };
}

// Variación de punta a punta (primer y último mes informados).
export function variacionTotalPeriodo(serie: Array<{ periodo: string; total: number }>): Variacion | null {
  if (serie.length < 2) return null;
  const desde = serie[0];
  const hasta = serie[serie.length - 1];
  const abs = hasta.total - desde.total;
  return { desde: desde.periodo, hasta: hasta.periodo, abs, pct: desde.total !== 0 ? abs / desde.total : null };
}

export const mesesDeSerie = (serie: Array<{ periodo: string }>) =>
  serie.length < 2 ? serie.length : mesesEntre(serie[0].periodo, serie[serie.length - 1].periodo) + 1;

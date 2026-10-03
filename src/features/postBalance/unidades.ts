// Ventas post balance en unidades físicas (toneladas, clientes, litros…).
// Sin IA y sin React. Agrupa por mes respetando el orden del documento: si un
// mes viene en dos filas (pesos y dólares), suma las cantidades informadas.

export type VentaConCantidad = {
  mes: string;
  cantidad?: number | null;
  cantidad_anio_anterior?: number | null;
};

export type PuntoUnidades = {
  mes: string;
  cantidad: number | null;
  cantidadAnterior: number | null;
  variacion: number | null; // en %, null sin comparativo o base 0
};

const sumar = (a: number | null, b: number | null | undefined) =>
  b === null || b === undefined || !Number.isFinite(b) ? a : (a ?? 0) + b;

export function serieUnidades(ventas: VentaConCantidad[]): PuntoUnidades[] {
  const orden: string[] = [];
  const porMes = new Map<string, { cantidad: number | null; cantidadAnterior: number | null }>();
  for (const v of ventas) {
    const mes = (v.mes ?? '').trim();
    if (!porMes.has(mes)) {
      orden.push(mes);
      porMes.set(mes, { cantidad: null, cantidadAnterior: null });
    }
    const p = porMes.get(mes)!;
    p.cantidad = sumar(p.cantidad, v.cantidad);
    p.cantidadAnterior = sumar(p.cantidadAnterior, v.cantidad_anio_anterior);
  }
  return orden.map(mes => {
    const { cantidad, cantidadAnterior } = porMes.get(mes)!;
    const variacion = cantidad !== null && cantidadAnterior ? ((cantidad - cantidadAnterior) / cantidadAnterior) * 100 : null;
    return { mes, cantidad, cantidadAnterior, variacion };
  });
}

export const hayUnidades = (serie: PuntoUnidades[]) => serie.some(p => p.cantidad !== null || p.cantidadAnterior !== null);

// Totales y variación sobre los meses que tienen los dos años (comparación pareja).
export function totalesUnidades(serie: PuntoUnidades[]) {
  const total = serie.reduce((a, p) => a + (p.cantidad ?? 0), 0);
  const pares = serie.filter(p => p.cantidad !== null && p.cantidadAnterior !== null);
  const actPares = pares.reduce((a, p) => a + (p.cantidad as number), 0);
  const antPares = pares.reduce((a, p) => a + (p.cantidadAnterior as number), 0);
  return {
    total,
    totalAnterior: serie.reduce((a, p) => a + (p.cantidadAnterior ?? 0), 0),
    mesesComparables: pares.length,
    variacion: antPares > 0 ? ((actPares - antPares) / antPares) * 100 : null,
  };
}

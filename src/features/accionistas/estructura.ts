import { Accionista } from '../extraction/schemas';

// Estructura societaria: participación indirecta a lo largo de la cadena y
// chequeos de la suma por nivel. Sin IA y sin React. Porcentajes como número
// natural (52,99 = 52,99%), igual que en la extracción.

export type NodoAccionista = {
  nombre: string;
  dni_cuit: string;
  directa: number | null;          // % sobre su sociedad madre
  indirecta: number | null;        // % sobre la empresa analizada (producto de la cadena)
  nivel: number;                   // 1 = accionista directo
  indices: number[];               // posición en el árbol (para editar)
  hijos: NodoAccionista[];
  sumaHijos: number | null;        // suma de % de los hijos (null si no tiene)
};

const limpio = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t === '' || t.toUpperCase() === 'N/A' ? '' : t;
};

export function armarArbol(accionistas: Accionista[] | null | undefined, padre: number | null = 100, nivel = 1, indices: number[] = []): NodoAccionista[] {
  return (accionistas ?? []).map((a, i) => {
    const directa = a.participacion === null || a.participacion === undefined || !Number.isFinite(Number(a.participacion)) ? null : Number(a.participacion);
    const indirecta = padre === null || directa === null ? null : (padre * directa) / 100;
    const hijosRaw = a.subAccionistas ?? [];
    const hijos = armarArbol(hijosRaw, indirecta, nivel + 1, [...indices, i]);
    return {
      nombre: limpio(a.nombre),
      dni_cuit: limpio(a.dni_cuit),
      directa,
      indirecta,
      nivel,
      indices: [...indices, i],
      hijos,
      sumaHijos: hijosRaw.length > 0 ? sumaParticipaciones(hijosRaw) : null,
    };
  });
}

export const sumaParticipaciones = (lista: Accionista[] | null | undefined) =>
  (lista ?? []).reduce((a, x) => a + (Number(x.participacion) || 0), 0);

// La suma de un nivel "cierra" si da 100% con tolerancia de redondeo.
export const sumaCierra = (suma: number, tolerancia = 0.5) => Math.abs(suma - 100) <= tolerancia;

// Hojas del árbol: quienes están al final de cada cadena, con su participación
// indirecta total (si alguien aparece en más de una cadena, se suma).
export function finalesDeCadena(arbol: NodoAccionista[]): Array<{ nombre: string; dni_cuit: string; indirecta: number | null; cadenas: number }> {
  const porClave = new Map<string, { nombre: string; dni_cuit: string; indirecta: number | null; cadenas: number }>();
  const visitar = (n: NodoAccionista) => {
    if (n.hijos.length > 0) return n.hijos.forEach(visitar);
    const clave = n.dni_cuit ? n.dni_cuit.replace(/\D/g, '') : n.nombre.toLowerCase();
    const previo = porClave.get(clave);
    if (!previo) {
      porClave.set(clave, { nombre: n.nombre, dni_cuit: n.dni_cuit, indirecta: n.indirecta, cadenas: 1 });
    } else {
      previo.indirecta = previo.indirecta === null || n.indirecta === null ? null : previo.indirecta + n.indirecta;
      previo.cadenas += 1;
    }
  };
  arbol.forEach(visitar);
  return [...porClave.values()].sort((a, b) => (b.indirecta ?? -1) - (a.indirecta ?? -1));
}

const normNombre = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

// ¿Este nombre del directorio figura entre los accionistas (en cualquier nivel)?
// Compara palabras sin importar orden, acentos ni comas, y tolera un segundo
// nombre de más: coincide si todas las palabras del nombre más corto (al menos
// dos) están en el otro ("Guillermo Avaca" = "Guillermo Fabián Avaca").
export function nombresDeAccionistas(arbol: NodoAccionista[]): Set<string> {
  const out = new Set<string>();
  const visitar = (n: NodoAccionista) => {
    if (n.nombre) out.add(normNombre(n.nombre));
    n.hijos.forEach(visitar);
  };
  arbol.forEach(visitar);
  return out;
}

const contiene = (a: string[], b: string[]) => {
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  return corto.length >= 2 && corto.every(p => largo.includes(p));
};

export const esAccionista = (nombre: string | null | undefined, nombres: Set<string>) => {
  const n = normNombre(limpio(nombre));
  if (n === '') return false;
  const palabras = n.split(' ');
  return [...nombres].some(x => x === n || contiene(palabras, x.split(' ')));
};

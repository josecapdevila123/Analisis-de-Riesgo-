import type { ExtractionResult } from '../../types';
import { estadoPorton, sectorInicial } from '../risk/porton';
import { CATEGORY_LABEL, RiskCategory } from '../risk/score';

// Historial del sidebar: una fila por empresa (agrupando corridas en el
// frontend, sin tocar Firestore), con el estado de la última corrida.

export const normalizarTexto = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const soloDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
// CUIT válido para agrupar: 11 dígitos.
const cuitDe = (r: ExtractionResult) => {
  const d = soloDigitos(r.extraction?.company_profile?.cuit);
  return d.length === 11 ? d : null;
};
const nombreDe = (r: ExtractionResult) => {
  const n = r.extraction?.company_profile?.name?.trim();
  return n && n.toUpperCase() !== 'N/A' ? n : null;
};

export type EstadoCorrida =
  | { tipo: 'score'; score: number; categoria: RiskCategory; etiqueta: string }
  | { tipo: 'en_proceso' | 'error' | 'sin_opinion' | 'pendiente_documentacion' | 'desactualizada'; etiqueta: string };

// Lo mismo que muestra el dashboard: el score solo con el rubro confirmado y la
// opinión vigente (portón).
export function estadoCorrida(r: ExtractionResult): EstadoCorrida {
  if (r.status === 'processing') return { tipo: 'en_proceso', etiqueta: 'En proceso' };
  if (r.status === 'error') return { tipo: 'error', etiqueta: 'Error' };
  const sector = r.sector ?? (r.extraction ? sectorInicial(r.extraction) : null);
  const p = estadoPorton(sector, r.riskAssessment, r.documentosSectoriales ?? []);
  if (!p.rubroConfirmado) return { tipo: 'pendiente_documentacion', etiqueta: 'Pendiente de documentación' };
  if (!r.riskAssessment) return { tipo: 'sin_opinion', etiqueta: 'Sin opinión' };
  if (p.opinion === 'desactualizada') return { tipo: 'desactualizada', etiqueta: 'Desactualizada' };
  const { final, categoria } = r.riskAssessment.puntaje;
  const corta = CATEGORY_LABEL[categoria].replace('Riesgo ', '');
  return { tipo: 'score', score: final, categoria, etiqueta: corta.charAt(0).toUpperCase() + corta.slice(1) };
}

export type GrupoEmpresa = {
  clave: string;
  nombre: string;
  cuit: string | null;
  corridas: ExtractionResult[]; // de la más reciente a la más vieja
  ultima: ExtractionResult;
};

export function agruparPorEmpresa(results: ExtractionResult[]): GrupoEmpresa[] {
  const grupos = new Map<string, ExtractionResult[]>();
  const claveDeNombre = new Map<string, string>(); // nombre normalizado → clave del grupo

  // 1) Corridas con CUIT: agrupan por CUIT y registran su nombre.
  for (const r of results) {
    const cuit = cuitDe(r);
    if (!cuit) continue;
    const clave = `cuit:${cuit}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), r]);
    const n = normalizarTexto(nombreDe(r));
    if (n && !claveDeNombre.has(n)) claveDeNombre.set(n, clave);
  }
  // 2) Sin CUIT: se suman al grupo con la misma razón social; si no hay, por nombre.
  //    Sin nombre (en proceso o con error de extracción): fila propia.
  for (const r of results) {
    if (cuitDe(r)) continue;
    const n = normalizarTexto(nombreDe(r));
    const clave = n ? (claveDeNombre.get(n) ?? `nombre:${n}`) : `id:${r.id}`;
    if (n && !claveDeNombre.has(n)) claveDeNombre.set(n, clave);
    grupos.set(clave, [...(grupos.get(clave) ?? []), r]);
  }

  return [...grupos.entries()]
    .map(([clave, corridas]) => {
      const orden = [...corridas].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const conNombre = orden.find(c => nombreDe(c));
      return {
        clave,
        nombre: conNombre ? nombreDe(conNombre)! : `${orden[0].fileNames.length} archivo(s)`,
        cuit: orden.map(cuitDe).find(Boolean) ?? null,
        corridas: orden,
        ultima: orden[0],
      };
    })
    .sort((a, b) => b.ultima.timestamp.localeCompare(a.ultima.timestamp));
}

// Búsqueda en vivo por razón social o CUIT, sin mayúsculas ni acentos.
export function filtrarGrupos(grupos: GrupoEmpresa[], consulta: string): GrupoEmpresa[] {
  const q = normalizarTexto(consulta);
  if (!q) return grupos;
  const qDigitos = soloDigitos(consulta);
  return grupos.filter(g =>
    normalizarTexto(g.nombre).includes(q) ||
    (qDigitos.length > 0 && (g.cuit ?? '').includes(qDigitos)) ||
    g.corridas.some(c => normalizarTexto(nombreDe(c)).includes(q)),
  );
}

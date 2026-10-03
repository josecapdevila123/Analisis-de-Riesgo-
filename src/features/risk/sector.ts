import { RawExtraction } from '../extraction/schemas';
import { RubroDisponible, SUGERENCIA_RUBRO } from './policy';

// Sugerencia de rubro por palabras clave sobre la actividad declarada. Sin IA:
// el rubro lo decide siempre el analista; esto solo preselecciona.

type RubroSugerible = Exclude<RubroDisponible, 'generico'>;
export type Coincidencia = { rubro: RubroSugerible; palabra: string; fuerza: 'fuerte' | 'debil' };
export type SugerenciaRubro = { rubro: RubroSugerible | null; coincidencias: Coincidencia[] };

const normalizar = (s: string) =>
  ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

// Palabras de una sola pieza y cortas ("obra", "vial") se buscan como palabra
// entera para no matchear dentro de otras ("maniobra", "provincial").
const PALABRA_ENTERA = new Set(['obra', 'obras', 'vial', 'tambo', 'grano']);

const aparece = (texto: string, palabra: string) =>
  PALABRA_ENTERA.has(palabra) ? texto.includes(` ${palabra} `) || texto.includes(` ${palabra}s `) : texto.includes(palabra);

export function sugerirRubro(extraction: Pick<RawExtraction, 'company_profile'> | null | undefined): SugerenciaRubro {
  const actividad = extraction?.company_profile?.activity ?? '';
  const texto = normalizar(actividad);
  const coincidencias: Coincidencia[] = [];

  for (const rubro of SUGERENCIA_RUBRO.prioridad) {
    const regla = SUGERENCIA_RUBRO.reglas[rubro];
    // Las frases excluidas se borran del texto antes de buscar (solo para este rubro).
    let t = texto;
    for (const ex of regla.excluir ?? []) t = t.split(` ${ex}`).join(' ');
    for (const p of regla.fuertes) if (aparece(t, p)) coincidencias.push({ rubro, palabra: p, fuerza: 'fuerte' });
    for (const p of regla.debiles ?? []) if (aparece(t, p)) coincidencias.push({ rubro, palabra: p, fuerza: 'debil' });
  }

  const fuertes = coincidencias.filter(c => c.fuerza === 'fuerte');
  const candidatas = fuertes.length > 0 ? fuertes : coincidencias;
  const rubro = SUGERENCIA_RUBRO.prioridad.find(r => candidatas.some(c => c.rubro === r)) ?? null;
  return { rubro, coincidencias };
}

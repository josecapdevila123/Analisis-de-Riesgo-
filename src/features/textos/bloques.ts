import type { CompanyHistory } from '../extraction/schemas';

// Textos editables por bloques (Historia y actividad, Mercado). El original de
// la IA no se toca: la versión editada se guarda aparte y es la que usan la
// pantalla, el PDF y la opinión. "Restaurar original" la descarta.

export type BloqueTexto = { id: string; titulo: string; texto: string };

const nuevoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
export const bloqueVacio = (): BloqueTexto => ({ id: nuevoId(), titulo: '', texto: '' });

const lista = (items: string[]) => items.filter(x => x.trim()).map(x => `- ${x.trim()}`).join('\n');

// Historia (estructura fija de la IA) → bloques con los mismos títulos que la pantalla.
export function historiaABloques(h: CompanyHistory | null | undefined): BloqueTexto[] {
  if (!h) return [];
  const bloques: Array<[string, string]> = [
    ['Core business', h.core_business ?? ''],
    ['Historia', h.historia ?? ''],
    ['Datos relevantes', lista(h.datos_relevantes ?? [])],
    ['Proyecciones del Directorio', lista(h.proyecciones ?? [])],
    ['Explicaciones del Directorio sobre el balance', (h.explicaciones_balance ?? []).filter(e => e.explicacion?.trim()).map(e => `- **${e.tema}:** ${e.explicacion}`).join('\n')],
  ];
  return bloques.filter(([, t]) => t.trim() && t.trim().toUpperCase() !== 'N/A').map(([titulo, texto]) => ({ id: nuevoId(), titulo, texto }));
}

// Markdown (análisis de mercado) → un bloque por título. El texto antes del
// primer título queda como bloque sin título.
export function markdownABloques(md: string | null | undefined): BloqueTexto[] {
  if (!md?.trim()) return [];
  const bloques: BloqueTexto[] = [];
  let actual: BloqueTexto | null = null;
  for (const linea of md.split('\n')) {
    const m = linea.match(/^#{1,4}\s+(.*)$/);
    if (m) {
      if (actual) bloques.push(actual);
      actual = { id: nuevoId(), titulo: m[1].replace(/\*\*/g, '').trim(), texto: '' };
    } else {
      if (!actual) actual = { id: nuevoId(), titulo: '', texto: '' };
      actual.texto += `${linea}\n`;
    }
  }
  if (actual) bloques.push(actual);
  return bloques.map(b => ({ ...b, texto: b.texto.trim() })).filter(b => b.titulo || b.texto);
}

// Bloques → markdown (para el PDF, la opinión y la pantalla).
export const bloquesAMarkdown = (bloques: BloqueTexto[]) =>
  bloques
    .filter(b => b.titulo.trim() || b.texto.trim())
    .map(b => [b.titulo.trim() ? `## ${b.titulo.trim()}` : '', b.texto.trim()].filter(Boolean).join('\n\n'))
    .join('\n\n');

// "Qué hace la empresa" (resumen ejecutivo y PDF): el bloque "Core business"
// editado si existe; si el analista lo sacó, nada (se usa la actividad).
export function coreBusinessDe(r: { historiaEditada?: BloqueTexto[] | null; companyHistory?: CompanyHistory | null }): string | null {
  if (r.historiaEditada) return r.historiaEditada.find(b => b.titulo.trim().toLowerCase() === 'core business')?.texto.trim() || null;
  return r.companyHistory?.core_business ?? null;
}

// La Opinión de riesgos es la única fuente del dictamen. Los resúmenes
// ejecutivos generados antes de ese cambio terminaban con un párrafo
// "**Conclusión:** ..." que podía contradecirla: se quita al mostrarlos.
const CONCLUSION_PARAGRAPH = /^\s*(\*\*|__)?\s*conclusi[oó]n\s*:?/i;

export function stripRiskConclusion(summary: string): string {
  return summary
    .split(/\n\s*\n/)
    .filter(paragraph => !CONCLUSION_PARAGRAPH.test(paragraph))
    .join('\n\n')
    .trim();
}

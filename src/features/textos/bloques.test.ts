import { describe, expect, it } from 'vitest';
import { bloquesAMarkdown, historiaABloques, markdownABloques } from './bloques';

describe('bloques de texto', () => {
  it('historia → bloques con títulos; saltea lo vacío', () => {
    const b = historiaABloques({
      memoria_disponible: true, core_business: 'Distribución de congelados.', historia: 'Fundada en 1995.',
      datos_relevantes: ['Planta en Neuquén', ''], proyecciones: [], explicaciones_balance: [{ tema: 'Ventas', explicacion: 'Crecieron por precios.' }],
    });
    expect(b.map(x => x.titulo)).toEqual(['Core business', 'Historia', 'Datos relevantes', 'Explicaciones del Directorio sobre el balance']);
    expect(b[2].texto).toBe('- Planta en Neuquén');
    expect(b[3].texto).toBe('- **Ventas:** Crecieron por precios.');
  });

  it('markdown → un bloque por título; el texto previo queda sin título', () => {
    const b = markdownABloques('Intro del sector.\n\n## Contexto macro\nInflación alta.\n\n### **Competencia**\nMuchos jugadores.');
    expect(b.map(x => [x.titulo, x.texto])).toEqual([['', 'Intro del sector.'], ['Contexto macro', 'Inflación alta.'], ['Competencia', 'Muchos jugadores.']]);
  });

  it('ida y vuelta: sacar un bloque lo saca del texto final', () => {
    const b = markdownABloques('## A\nuno\n\n## B\ndos\n\n## C\ntres');
    const sinB = b.filter(x => x.titulo !== 'B');
    const md = bloquesAMarkdown(sinB);
    expect(md).toBe('## A\n\nuno\n\n## C\n\ntres');
    expect(md).not.toContain('dos');
  });

  it('bloques vacíos no aparecen', () => {
    expect(bloquesAMarkdown([{ id: '1', titulo: '', texto: '  ' }, { id: '2', titulo: 'X', texto: 'y' }])).toBe('## X\n\ny');
  });
});

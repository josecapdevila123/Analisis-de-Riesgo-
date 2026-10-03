import { describe, expect, it } from 'vitest';
import { stripRiskConclusion } from './summary';

describe('stripRiskConclusion', () => {
  it('quita el párrafo final de conclusión (en negrita, con o sin tilde)', () => {
    const s = 'Primer párrafo.\n\nSegundo párrafo.\n\n**Conclusión:** perfil adecuado.';
    expect(stripRiskConclusion(s)).toBe('Primer párrafo.\n\nSegundo párrafo.');
    expect(stripRiskConclusion('Uno.\n\nConclusion: bajo riesgo.')).toBe('Uno.');
    expect(stripRiskConclusion('Uno.\n\n**Conclusión**: algo')).toBe('Uno.');
  });

  it('no toca párrafos que mencionan "conclusión" en el medio', () => {
    const s = 'La conclusión del auditor fue favorable.\n\nOtro.';
    expect(stripRiskConclusion(s)).toBe(s);
  });
});

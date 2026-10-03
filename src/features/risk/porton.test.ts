import { describe, expect, it } from 'vitest';
import { confirmarRubro, estadoPorton, perfilDelCaso, sectorInicial, validarConfirmacion } from './porton';
import { perfilEfectivo, POLICY_VERSION } from './policy';
import { buildExtraction } from '../ratios/__fixtures__/extraction';

const sector = sectorInicial(buildExtraction()); // "Venta al por mayor…" → comercio

describe('portón del rubro', () => {
  it('caso nuevo: sugiere comercio y queda sin confirmar', () => {
    expect(sector).toMatchObject({ sugerido: 'comercio', confirmado: null });
  });

  it('sin confirmar: no hay semáforos, opinión ni PDF', () => {
    const e = estadoPorton(sector, null);
    expect(e).toMatchObject({ rubroConfirmado: false, puedeVerSemaforos: false, puedeGenerarOpinion: false, puedeExportarPdf: false });
    expect(e.motivo).toMatch(/Pendiente de rubro/);
  });

  it('confirmar el sugerido no pide motivo; uno distinto exige 10 caracteres', () => {
    expect(validarConfirmacion(sector, 'comercio', '')).toBeNull();
    expect(validarConfirmacion(sector, 'industria', 'corto')).toMatch(/motivo/);
    expect(validarConfirmacion(sector, 'industria', 'Fabrica lo que vende')).toBeNull();
    expect(() => confirmarRubro(sector, 'industria', '', '', 'a@b.com')).toThrow(/motivo/);
  });

  it('confirmar guarda quién, cuándo y el motivo solo si cambió', () => {
    const c = confirmarRubro(sector, 'industria', '  Fabrica lo que vende ', 'Mixto: 70% fabricación', 'ana@bibank.com', new Date('2026-10-03T12:00:00Z'));
    expect(c).toMatchObject({ confirmado: 'industria', confirmadoPor: 'ana@bibank.com', confirmadoEn: '2026-10-03T12:00:00.000Z', motivoCambio: 'Fabrica lo que vende', nota: 'Mixto: 70% fabricación' });
    expect(confirmarRubro(sector, 'comercio', 'cualquier cosa', '', null).motivoCambio).toBeNull();
  });

  it('sin sugerencia: se puede elegir cualquiera sin motivo', () => {
    const s = { ...sector, sugerido: null };
    expect(validarConfirmacion(s, 'agro', '')).toBeNull();
    expect(validarConfirmacion(s, null, '')).toMatch(/Elegí/);
  });

  it('confirmado sin opinión: se puede generar la opinión y exportar el PDF', () => {
    const c = confirmarRubro(sector, 'comercio', '', '', null);
    expect(estadoPorton(c, null)).toMatchObject({ opinion: 'sin_opinion', puedeGenerarOpinion: true, puedeExportarPdf: true });
  });

  it('cambiar el rubro después de la opinión la deja desactualizada y bloquea el PDF', () => {
    const c = confirmarRubro(sector, 'comercio', '', '', null);
    const opinion = { perfil: perfilEfectivo('comercio'), politicaVersion: POLICY_VERSION };
    expect(estadoPorton(c, opinion)).toMatchObject({ opinion: 'vigente', puedeExportarPdf: true });
    const cambiado = confirmarRubro(c, 'industria', 'Fabrica lo que vende', '', null);
    const e = estadoPorton(cambiado, opinion);
    expect(e).toMatchObject({ opinion: 'desactualizada', puedeExportarPdf: false, puedeGenerarOpinion: true });
    expect(e.motivo).toMatch(/volvé a generarla/);
  });

  it('caso viejo con opinión sin foto: confirmar Genérico la mantiene vigente (evaluada con v1.0.0)', () => {
    const viejo = sectorInicial(buildExtraction());
    const opinionVieja = {};
    const g = confirmarRubro(viejo, 'generico', 'Prefiero criterios generales', '', null);
    expect(estadoPorton(g, opinionVieja)).toMatchObject({ opinion: 'vigente', puedeExportarPdf: true, politicaEvaluada: '1.0.0', politicaDesactualizada: true });
    const otro = confirmarRubro(viejo, 'comercio', '', '', null);
    expect(estadoPorton(otro, opinionVieja).opinion).toBe('desactualizada');
  });

  it('perfil del caso: la foto si la opinión está vigente; si no, el del rubro confirmado', () => {
    const c = confirmarRubro(sector, 'comercio', '', '', null);
    const foto = { ...perfilEfectivo('comercio'), version: '1.9.0' };
    expect(perfilDelCaso(c, { perfil: foto }).version).toBe('1.9.0');
    const cambiado = confirmarRubro(c, 'agro', 'Es productor agropecuario', '', null);
    expect(perfilDelCaso(cambiado, { perfil: foto }).rubro).toBe('agro');
    expect(perfilDelCaso(null, null).rubro).toBe('generico');
  });
});

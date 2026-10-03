import { describe, expect, it } from 'vitest';
import { armarContextoOpinion } from './contextoOpinion';
import { perfilEfectivo } from './policy';
import { confirmarRubro, sectorInicial } from './porton';
import { detectSignals } from './signals';
import { computeRatios } from '../ratios/calculations';
import { runSanityChecks } from '../ratios/sanityChecks';
import { runCrossCheck } from '../ratios/crossCheck';
import { buildExtraction } from '../ratios/__fixtures__/extraction';
import { RISK_OPINION_PROMPT } from '../../lib/prompts/riskOpinion';

const e = buildExtraction();
const sector = confirmarRubro(sectorInicial(e), 'agro', 'Es productor de granos', 'Mixto con acopio', 'ana@bibank.com');
const perfil = perfilEfectivo('agro');
const ratios = computeRatios(e, perfil);
const ctx = armarContextoOpinion({
  extraction: e, ratios, inconsistencias: runSanityChecks(e), crossCheck: runCrossCheck(e), verification: null,
  marketAnalysis: null, companyHistory: null, pce: 12, perfil, sector,
  senales: detectSignals({ extraction: e, ratios, inconsistencias: [], crossCheck: null, perfil }),
});

describe('contexto de la opinión de riesgos', () => {
  it('incluye el perfil confirmado, quién lo confirmó y el motivo del cambio', () => {
    expect(ctx.perfil_de_evaluacion).toMatchObject({
      rubro: 'Agropecuario',
      confirmado_por: 'ana@bibank.com',
      sugerido_por_el_sistema: 'Comercio y distribución',
      motivo_del_cambio: 'Es productor de granos',
      nota_del_analista: 'Mixto con acopio',
      variable_critica: perfil.variableCritica,
    });
  });

  it('KPIs prioritarios en orden, con valor y semáforo ya calculados', () => {
    const kpis = ctx.perfil_de_evaluacion.kpis_prioritarios;
    expect(kpis.map(k => k.indicador)).toEqual([
      'Liquidez corriente', 'Bienes de cambio / deuda bancaria corriente', 'Deuda bancaria / ventas',
      'Deuda bancaria que vence en 12 meses', 'Margen EBITDA promedio 2 ejercicios',
    ]);
    expect(kpis[0]).toMatchObject({ actual: 2, semaforo: 'sano' });
    expect(kpis[1].actual).toBeCloseTo(2200 / 600, 6);
  });

  it('preguntas clave y ratios que no aplican, con motivo', () => {
    expect(ctx.perfil_de_evaluacion.preguntas_clave).toEqual(perfil.preguntasClave);
    expect(ctx.perfil_de_evaluacion.no_aplican.map(n => n.indicador).sort()).toEqual(['Calidad de la ganancia', 'Prueba ácida']);
    expect(ctx.ratios.liquidez_acida.status).toBeNull();
  });

  it('el prompt le pide empezar por los KPIs del rubro, responder las preguntas y no penalizar lo que no aplica', () => {
    expect(RISK_OPINION_PROMPT).toContain('kpis_prioritarios');
    expect(RISK_OPINION_PROMPT).toContain('preguntas_clave');
    expect(RISK_OPINION_PROMPT).toContain('NO se penalizan');
    expect(RISK_OPINION_PROMPT).toContain('Mencioná con qué perfil se evaluó');
  });
});

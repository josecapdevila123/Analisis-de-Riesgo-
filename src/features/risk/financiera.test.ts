import { describe, expect, it } from 'vitest';
import { detectSignals } from './signals';
import { perfilEfectivo, SubSegmento } from './policy';
import { confirmarRubro, estadoPorton, sectorInicial, validarConfirmacion } from './porton';
import { sugerirRubro } from './sector';
import { armarContextoOpinion } from './contextoOpinion';
import { computeRatios } from '../ratios/calculations';
import { indicadoresFinancieros } from '../ratios/financieras';
import { runSanityChecks } from '../ratios/sanityChecks';
import { extractionWith } from '../ratios/__fixtures__/extraction';
import { RawExtraction } from '../extraction/schemas';
import { DocumentoSectorial, firmaDocumentos } from '../sectorDocs/tipos';
import { RISK_OPINION_PROMPT } from '../../lib/prompts/riskOpinion';

// Financiera tipo (miles de $): activo 1.000 (cartera 850, caja 100), pasivo 750, PN 250.
const financiera = (vencida90: number, previsiones: number, extra?: (x: RawExtraction) => void) => extractionWith(x => {
  x.company_profile.activity = 'Servicios financieros y otorgamiento de préstamos';
  const esp = x.ejercicio_actual.estado_situacion_patrimonial;
  esp.activo_corriente = { total: 950, detalles: [{ rubro: 'Caja y Bancos', monto: 100 }, { rubro: 'Créditos financieros', monto: 850 }] };
  esp.activo_no_corriente = { total: 50, detalles: [{ rubro: 'Bienes de uso', monto: 50 }] };
  esp.total_activo = 1000;
  esp.pasivo_corriente = { total: 600, detalles: [{ rubro: 'Deudas financieras', monto: 600 }] };
  esp.pasivo_no_corriente = { total: 150, detalles: [{ rubro: 'Obligaciones negociables', monto: 150 }] };
  esp.total_pasivo = 750;
  esp.patrimonio_neto = 250;
  esp.bienes_de_cambio = null;
  x.extraccion_financiera = {
    fecha_cierre: '2025-12-31',
    cartera_total: 850,
    cartera_total_anterior: 800,
    cartera_vencida_por_tramo: [
      { tramo: 'hasta 3 meses', desde_dias: 0, hasta_dias: 90, monto: 40 },
      { tramo: 'de 3 a 6 meses', desde_dias: 90, hasta_dias: 180, monto: vencida90 },
    ],
    previsiones_incobrabilidad: previsiones,
    cargo_incobrabilidad: 20,
    ingresos_financieros: 300,
    egresos_financieros: 100,
    creditos_a_vencer_90_dias: 400,
    pasivos_a_vencer_90_dias: 350,
    inversiones_corrientes: null,
    fondeo: [{ fuente: 'bancos', monto: 450 }, { fuente: 'obligaciones_negociables', monto: 300 }],
  };
  extra?.(x);
});

const evaluar = (e: RawExtraction, sub: SubSegmento = 'prendario_empresas', documentos: DocumentoSectorial[] = []) => {
  const perfil = perfilEfectivo('financiera', sub);
  const ratios = computeRatios(e, perfil, documentos);
  const senales = detectSignals({ extraction: e, ratios, inconsistencias: runSanityChecks(e), crossCheck: null, perfil, documentos });
  return { perfil, ratios, senales, ids: senales.map(s => s.id) };
};

const reporte = (tramos: Array<[string, number]>, previsiones: number | null, fecha = '2026-03-31'): DocumentoSectorial => ({
  id: 'doc1', tipo: 'reporte_mora', nombreArchivo: 'mora.xlsx', fechaDocumento: fecha, cargadoPor: null,
  cargadoEn: '2026-04-10T00:00:00Z', actualizadoEn: '2026-04-10T00:00:00Z', estado: 'ok', editado: false,
  extraccion: { fecha_corte: fecha, tramos: tramos.map(([tramo, monto]) => ({ tramo: tramo as never, monto })), previsiones, por_producto: null },
});

describe('caso A — financiera sana (prendario)', () => {
  const { ratios, senales } = evaluar(financiera(34, 37.4));

  it('mora 4% sana, cobertura 110% sana, PN / activo 25% sano, pasivo / PN 3x sano', () => {
    expect(ratios.mora.actual).toBeCloseTo(34 / 850, 10);
    expect(ratios.mora.status).toBe('healthy');
    expect(ratios.cobertura.actual).toBeCloseTo(1.1, 10);
    expect(ratios.cobertura.status).toBe('healthy');
    expect(ratios.pn_activo.actual).toBeCloseTo(0.25, 10);
    expect(ratios.pn_activo.status).toBe('healthy');
    expect(ratios.endeudamiento.actual).toBeCloseTo(3, 10);
    expect(ratios.endeudamiento.status).toBe('healthy');
  });

  it('PN ajustado = 250 (las previsiones cubren la mora)', () => {
    expect(ratios.pn_ajustado.actual).toBe(250);
    expect(ratios.irregular_no_previsionada.actual).toBe(0);
  });

  it('ninguna señal genérica de endeudamiento (DSCR, EBITDA, apalancamiento, deuda a 12 meses…)', () => {
    const genericas = ['dscr_menor_1', 'dscr_ajustado', 'ebitda_negativo_con_deuda', 'deuda_crecimiento_desmedido',
      'deuda_sube_ventas_bajan', 'deuda_corto_plazo', 'apalancamiento_alto', 'deuda_neta_ebitda_alta', 'cobertura_baja',
      'liquidez_corriente_baja', 'prueba_acida_baja', 'calidad_ganancia_baja', 'ciclo_caja_crece', 'ventas_caen', 'margen_ebitda_cae'];
    expect(senales.filter(s => genericas.includes(s.id))).toEqual([]);
  });

  it('ratios de empresa productiva sin semáforo (no aplican)', () => {
    expect(ratios.liquidez_corriente.status).toBeNull();
    expect(ratios.dscr.status).toBeNull();
    expect(ratios.margen_ebitda.status).toBeNull();
  });

  it('umbral inclusivo: cobertura de exactamente 100% es sana', () => {
    expect(evaluar(financiera(34, 34)).ratios.cobertura.status).toBe('healthy');
  });
});

describe('caso B — financiera estresada', () => {
  const { ratios, senales } = evaluar(financiera(102, 51));

  it('mora 12% crítica, cobertura 50% crítica', () => {
    expect(ratios.mora.actual).toBeCloseTo(0.12, 10);
    expect(ratios.mora.status).toBe('critical');
    expect(ratios.cobertura.actual).toBeCloseTo(0.5, 10);
    expect(ratios.cobertura.status).toBe('critical');
  });

  it('PN ajustado 199 (79,6% del PN) → señal alta', () => {
    expect(ratios.pn_ajustado.actual).toBe(199);
    expect(ratios.pn_ajustado_sobre_pn.actual).toBeCloseTo(0.796, 10);
    expect(senales.find(s => s.id === 'pn_ajustado_bajo')).toMatchObject({ severidad: 'alta', piso: null });
    expect(senales.find(s => s.id === 'mora_alta')?.severidad).toBe('alta');
    expect(senales.find(s => s.id === 'cobertura_mora_baja')?.severidad).toBe('alta');
  });
});

describe('caso C y D — PN ajustado', () => {
  it('C: previsiones mayores que la mora → PN ajustado = PN', () => {
    expect(evaluar(financiera(30, 60)).ratios.pn_ajustado.actual).toBe(250);
  });

  it('D: PN ajustado ≤ 0 → señal crítica con piso 85', () => {
    const { ratios, senales } = evaluar(financiera(400, 100)); // 250 − (400 − 100) = −50
    expect(ratios.pn_ajustado.actual).toBe(-50);
    expect(senales.find(s => s.id === 'pn_ajustado_negativo')).toMatchObject({ severidad: 'critica', piso: 85 });
    expect(senales.some(s => s.id === 'pn_ajustado_bajo')).toBe(false);
  });
});

describe('sub-segmento', () => {
  it('mora 7%: sana en consumo masivo (≤ 8%), crítica en factoring (> 6%)', () => {
    const e = financiera(59.5, 60); // 59,5 / 850 = 7%
    expect(evaluar(e, 'consumo').ratios.mora.status).toBe('healthy');
    expect(evaluar(e, 'factoring').ratios.mora.status).toBe('critical');
  });
});

describe('fuente de la mora', () => {
  const e = financiera(34, 37.4);

  it('sin reporte: sale del balance', () => {
    const f = indicadoresFinancieros(e, [], { disponibilidades: 100 });
    expect(f.mora.fuente).toBe('balance');
    expect(f.valores.mora.actual).toBeCloseTo(0.04, 10);
  });

  it('con reporte y balance: sale del reporte (con su fecha de corte)', () => {
    const doc = reporte([['al_dia', 800], ['31-90', 50], ['91-180', 30], ['+365', 20]], 60);
    const f = indicadoresFinancieros(e, [doc], { disponibilidades: 100 });
    expect(f.mora).toMatchObject({ fuente: 'reporte', fechaCorte: '2026-03-31', cartera: 900, vencida90: 50, previsiones: 60 });
    expect(f.valores.mora.actual).toBeCloseTo(50 / 900, 10);
  });

  it('si el reporte no trae previsiones, se toman las del balance y se dice', () => {
    const f = indicadoresFinancieros(e, [reporte([['al_dia', 850], ['91-180', 34]], null)], { disponibilidades: 100 });
    expect(f.mora).toMatchObject({ fuente: 'reporte', previsiones: 37.4, fuentePrevisiones: 'balance' });
  });

  it('cruce: reporte 1.000 vs balance 850 → alerta (fechas distintas a la vista)', () => {
    const f = indicadoresFinancieros(e, [reporte([['al_dia', 950], ['91-180', 50]], 60)], { disponibilidades: 100 });
    expect(f.cruce).toMatchObject({ carteraReporte: 1000, carteraBalance: 850, alerta: true, fechaReporte: '2026-03-31', fechaBalance: '2025-12-31' });
  });

  it('dato faltante → null con motivo, nunca 0', () => {
    const f = indicadoresFinancieros(financiera(34, 37.4, x => { x.extraccion_financiera!.fondeo = []; }), [], { disponibilidades: 100 });
    expect(f.valores.concentracion_fondeo).toEqual({ actual: null, motivo: 'Sin apertura de las fuentes de fondeo.' });
    expect(f.valores.top10_sobre_cartera.actual).toBeNull();
  });
});

describe('otros indicadores (a mano)', () => {
  const f = indicadoresFinancieros(financiera(34, 37.4, x => { x.extraccion_financiera!.top10_deudores_monto = 170; }), [], { disponibilidades: 100 });

  it('liquidez 90d = (caja 100 + créditos 400) / pasivos 350', () => {
    expect(f.valores.liquidez_90d.actual).toBeCloseTo(500 / 350, 10);
  });
  it('concentración de fondeo = 450 / 750', () => {
    expect(f.valores.concentracion_fondeo.actual).toBeCloseTo(0.6, 10);
  });
  it('eficiencia = gastos 4.300 / margen financiero 200; cargo / resultado pre previsiones: 20 / (200 − 4.300 + 20) → no positivo', () => {
    expect(f.valores.eficiencia.actual).toBeCloseTo(4300 / 200, 10);
    expect(f.valores.cargo_sobre_resultado.actual).toBeNull();
    expect(f.valores.cargo_sobre_resultado.motivo).toMatch(/no positivo/);
  });
  it('top 10 / cartera = 170 / 850; brecha de crecimiento cartera − PN', () => {
    expect(f.valores.top10_sobre_cartera.actual).toBeCloseTo(0.2, 10);
    // Cartera +6,25% (850 vs 800); PN: 250 vs 2.500 del comparativo del fixture = −90%.
    expect(f.valores.brecha_crecimiento_cartera_pn.actual).toBeCloseTo(0.0625 - (-0.9), 10);
  });
});

describe('sugerencia y portón', () => {
  it('"servicios financieros y otorgamiento de préstamos" → financiera (gana sobre servicios)', () => {
    expect(sugerirRubro({ company_profile: { name: '', cuit: '', activity: 'Servicios financieros y otorgamiento de préstamos', anio_actual: '', anio_anterior: '' } }).rubro).toBe('financiera');
  });

  it('no confunde "crédito fiscal" con una financiera', () => {
    expect(sugerirRubro({ company_profile: { name: '', cuit: '', activity: 'Venta mayorista; recupero de crédito fiscal', anio_actual: '', anio_anterior: '' } }).rubro).toBe('comercio');
  });

  it('sin sub-segmento no se puede confirmar Financiera', () => {
    const s = sectorInicial(financiera(34, 37.4));
    expect(validarConfirmacion(s, 'financiera', '', null)).toMatch(/sub-segmento/);
    expect(() => confirmarRubro(s, 'financiera', '', '', null)).toThrow(/sub-segmento/);
    expect(confirmarRubro(s, 'financiera', '', '', null, new Date(), 'leasing').subsegmento).toBe('leasing');
  });

  it('cambiar el sub-segmento o un documento deja la opinión desactualizada', () => {
    const s = confirmarRubro(sectorInicial(financiera(34, 37.4)), 'financiera', '', '', null, new Date(), 'consumo');
    const opinion = { perfil: perfilEfectivo('financiera', 'consumo'), politicaVersion: '2.1.0', documentosFirma: '' };
    expect(estadoPorton(s, opinion, []).opinion).toBe('vigente');
    expect(estadoPorton({ ...s, subsegmento: 'factoring' }, opinion, []).opinion).toBe('desactualizada');
    const doc = reporte([['al_dia', 850]], 10);
    expect(estadoPorton(s, opinion, [doc]).opinion).toBe('desactualizada');
    expect(estadoPorton(s, { ...opinion, documentosFirma: firmaDocumentos([doc]) }, [doc]).opinion).toBe('vigente');
  });
});

describe('pisos: un documento declarado no los baja', () => {
  it('reporte de mora sano no baja el piso de situación BCRA 3', () => {
    const e = financiera(102, 51, x => { x.extraccion_nosis!.situacion_bcra_peor_estado = 3; });
    const sano = reporte([['al_dia', 980], ['91-180', 20]], 40);
    const piso = (docs: DocumentoSectorial[]) => Math.max(...evaluar(e, 'prendario_empresas', docs).senales.map(s => s.piso ?? 0));
    expect(piso([])).toBe(75);
    expect(piso([sano])).toBe(75);
  });

  it('si el balance da PN ajustado ≤ 0, un reporte más favorable no levanta el piso 85', () => {
    const e = financiera(400, 100);
    const sano = reporte([['al_dia', 980], ['91-180', 20]], 40);
    const s = evaluar(e, 'prendario_empresas', [sano]).senales.find(x => x.id === 'pn_ajustado_negativo');
    expect(s?.piso).toBe(85);
  });
});

describe('opinión de una financiera', () => {
  const e = financiera(34, 37.4);
  const sector = confirmarRubro(sectorInicial(e), 'financiera', '', '', 'ana@bibank.com', new Date(), 'prendario_empresas');
  const perfil = perfilEfectivo('financiera', 'prendario_empresas');
  const docs = [reporte([['al_dia', 800], ['91-180', 40]], 45)];
  const ratios = computeRatios(e, perfil, docs);
  const ctx = armarContextoOpinion({
    extraction: e, ratios, inconsistencias: [], crossCheck: null, verification: null, marketAnalysis: null,
    companyHistory: null, pce: null, perfil, sector, documentos: docs,
    senales: detectSignals({ extraction: e, ratios, inconsistencias: [], crossCheck: null, perfil, documentos: docs }),
  });

  it('incluye sub-segmento, KPIs prioritarios en orden, preguntas y dimensiones del perfil', () => {
    expect(ctx.perfil_de_evaluacion.subsegmento).toBe('Prendario / empresas');
    expect(ctx.perfil_de_evaluacion.kpis_prioritarios.map(k => k.indicador).slice(0, 3)).toEqual(['Mora', 'Cobertura de la mora', 'PN ajustado']);
    expect(ctx.perfil_de_evaluacion.preguntas_clave).toContain('¿La mora está bien previsionada?');
    const dims = ctx.perfil_de_evaluacion.dimensiones.map(d => d.dimension);
    expect(dims).toContain('calidad_cartera');
    expect(dims).not.toContain('ventas_post_balance');
    expect(ctx.perfil_de_evaluacion.dimensiones.find(d => d.dimension === 'endeudamiento')?.nombre).toBe('Capital y apalancamiento');
  });

  it('fuente y fecha de corte de la mora, y el documento marcado como declarado', () => {
    expect(ctx.indicadores_financieros?.fuente_de_la_mora).toMatch(/Reporte de mora/);
    expect(ctx.indicadores_financieros?.fecha_de_corte_de_la_mora).toBe('2026-03-31');
    expect(ctx.documentacion_sectorial[0].naturaleza).toMatch(/no auditada/);
  });

  it('sin reporte de mora, figura como documentación recomendada faltante', () => {
    const sinDoc = armarContextoOpinion({ ...{ extraction: e, ratios, inconsistencias: [], crossCheck: null, verification: null, marketAnalysis: null, companyHistory: null, pce: null, perfil, sector, senales: [] }, documentos: [] });
    expect(sinDoc.documentacion_sectorial_recomendada_faltante).toEqual(['Reporte de mora']);
  });

  it('el prompt pide seguir las instrucciones del perfil y tratar los documentos como declarados', () => {
    expect(RISK_OPINION_PROMPT).toContain('instrucciones_del_perfil');
    expect(RISK_OPINION_PROMPT).toContain('DECLARADA por el cliente');
    expect(perfil.instruccionesOpinion.join(' ')).toMatch(/calidad de cartera → capital → fondeo y liquidez → rentabilidad → concentración/);
  });
});

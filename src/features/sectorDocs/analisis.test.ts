import { describe, expect, it } from 'vitest';
import { analizarDocumento, senalesDeDocumentos } from './analisis';
import { DocumentoSectorial, ExtraccionDocumento, firmaDocumentos, TipoDocumentoSectorial } from './tipos';
import { perfilEfectivo, RubroDisponible, SubSegmento } from '../risk/policy';
import { detectSignals } from '../risk/signals';
import { estadoPorton, confirmarRubro, sectorInicial } from '../risk/porton';
import { armarContextoOpinion } from '../risk/contextoOpinion';
import { armarPrechequeo } from '../risk/prechequeo';
import { computeRatios } from '../ratios/calculations';
import { runSanityChecks } from '../ratios/sanityChecks';
import { extractionWith } from '../ratios/__fixtures__/extraction';
import { RawExtraction } from '../extraction/schemas';

const doc = (tipo: TipoDocumentoSectorial, extraccion: ExtraccionDocumento, fecha = '2026-03-31', id = 'd1'): DocumentoSectorial => ({
  id, tipo, nombreArchivo: `${tipo}.pdf`, fechaDocumento: fecha, cargadoPor: 'ana@bibank.com', cargadoEn: '2026-04-05T00:00:00Z',
  actualizadoEn: '2026-04-05T00:00:00Z', extraccion, estado: 'ok', editado: false,
});
const analizar = (d: DocumentoSectorial, e: RawExtraction, rubro: RubroDisponible, sub: SubSegmento | null = null) =>
  analizarDocumento(d, { extraction: e, perfil: perfilEfectivo(rubro, sub) })!;
const k = (a: ReturnType<typeof analizar>, key: string) => a.kpis.find(x => x.key === key)!;

// ---------- construcción ----------
const obra = (comitente: string, tipo: 'publico' | 'privado', estado: 'en_ejecucion' | 'adjudicada' | 'presentada', saldo: number | null, monto = 0, avance: number | null = null) =>
  ({ obra: `Obra ${comitente}`, comitente, tipo_comitente: tipo, monto_contrato: monto, porcentaje_avance: avance, saldo_a_ejecutar: saldo, estado, plazo_fin: null });
const ventas2000 = extractionWith(x => { x.ejercicio_actual.estado_resultados.ventas_netas = 2000; });

describe('construcción — listado de obras', () => {
  const listado = doc('listado_obras', { fecha_documento: '2026-03-31', obras: [
    obra('Municipio A', 'publico', 'en_ejecucion', 1000),
    obra('Privado B', 'privado', 'en_ejecucion', 800),
    obra('Provincia C', 'publico', 'adjudicada', 600),
    obra('Nación D', 'publico', 'presentada', null, 900),
  ] });
  const a = analizar(listado, ventas2000, 'construccion');

  it('obra pendiente 2.400 (ejecución 1.800 + adjudicadas 600; la presentada no suma) → 1,2 años, sano', () => {
    expect(k(a, 'obra_pendiente').valor).toBe(2400);
    expect(k(a, 'obra_pendiente_sobre_ventas').valor).toBeCloseTo(1.2, 10);
    expect(k(a, 'obra_pendiente_sobre_ventas').status).toBe('healthy');
    expect(k(a, 'licitaciones_presentadas')).toMatchObject({ valor: 900, informativo: true, status: null });
  });

  it('1.700 de un mismo comitente público (70,8%) → concentración crítica y señal alta', () => {
    const conc = doc('listado_obras', { fecha_documento: null, obras: [
      obra('Vialidad Provincial', 'publico', 'en_ejecucion', 1100),
      obra('Vialidad Provincial', 'publico', 'adjudicada', 600),
      obra('Privado B', 'privado', 'en_ejecucion', 700),
    ] });
    const b = analizar(conc, ventas2000, 'construccion');
    expect(k(b, 'concentracion_comitente').valor).toBeCloseTo(1700 / 2400, 10);
    expect(k(b, 'concentracion_comitente').status).toBe('critical');
    const s = senalesDeDocumentos([conc], { extraction: ventas2000, perfil: perfilEfectivo('construccion') });
    expect(s).toMatchObject([{ id: 'obras_comitente_publico_concentrado', severidad: 'alta', dimension: 'negocio_mercado' }]);
  });

  it('sin saldo: monto × (1 − avance), con aviso', () => {
    const b = analizar(doc('listado_obras', { fecha_documento: null, obras: [obra('X', 'privado', 'en_ejecucion', null, 1000, 40)] }), ventas2000, 'construccion');
    expect(k(b, 'obra_pendiente').valor).toBe(600);
    expect(b.cruces.some(c => c.nivel === 'aviso')).toBe(true);
  });

  it('cruces: obra pendiente > 5 años de ventas; anticipos sin obras en ejecución', () => {
    const grande = analizar(doc('listado_obras', { fecha_documento: null, obras: [obra('X', 'privado', 'adjudicada', 12000)] }), ventas2000, 'construccion');
    expect(grande.cruces.some(c => /desproporcionada/.test(c.mensaje))).toBe(true);
    const conAnticipos = extractionWith(x => { x.ejercicio_actual.estado_situacion_patrimonial.pasivo_corriente.detalles.push({ rubro: 'Anticipos de clientes', monto: 300 }); });
    const sinEjecucion = analizar(doc('listado_obras', { fecha_documento: null, obras: [obra('X', 'privado', 'adjudicada', 500)] }), conAnticipos, 'construccion');
    expect(sinEjecucion.cruces.some(c => /anticipos de clientes/.test(c.mensaje))).toBe(true);
  });
});

// ---------- agro ----------
const lote = (cultivo: string, hectareas: number, tenencia: 'propia' | 'arrendada') => ({ cultivo, hectareas, tenencia, zona: null, rinde_esperado: null });
// 1.000 ha: 850 de soja y 150 de maíz; las arrendadas se toman primero de la soja.
const plan = (arrendadas: number) => {
  const sojaArr = Math.min(arrendadas, 850);
  const maizArr = arrendadas - sojaArr;
  return doc('plan_siembra', {
    fecha_documento: null, campania: '2025/26', costo_arrendamiento: null,
    lotes: [
      lote('Soja', sojaArr, 'arrendada'), lote('Soja', 850 - sojaArr, 'propia'),
      lote('Maíz', maizArr, 'arrendada'), lote('Maíz', 150 - maizArr, 'propia'),
    ],
  });
};

describe('agro — plan de siembra', () => {
  const conCampo = extractionWith(x => { x.anexo_bienes_de_uso = [{ rubro: 'Inmuebles rurales', valor_residual: 2000 }]; });

  it('1.000 ha, 700 arrendadas, 850 de soja → 70% arrendado (alerta), concentración 85% (crítica), sin señal combinada', () => {
    const a = analizar(plan(700), conCampo, 'agro');
    expect(k(a, 'hectareas_totales').valor).toBe(1000);
    expect(k(a, 'pct_arrendado').valor).toBeCloseTo(0.7, 10);
    expect(k(a, 'pct_arrendado').status).toBe('alert');
    expect(k(a, 'concentracion_cultivo').valor).toBeCloseTo(0.85, 10);
    expect(k(a, 'concentracion_cultivo').status).toBe('critical');
    expect(senalesDeDocumentos([plan(700)], { extraction: conCampo, perfil: perfilEfectivo('agro') })).toEqual([]);
  });

  it('con 900 arrendadas → dispara la señal combinada (alta, negocio y mercado)', () => {
    expect(senalesDeDocumentos([plan(900)], { extraction: conCampo, perfil: perfilEfectivo('agro') }))
      .toMatchObject([{ id: 'agro_arrendado_concentrado', severidad: 'alta', dimension: 'negocio_mercado' }]);
  });

  it('deuda bancaria por ha es informativa (sin semáforo): 2.100 / 1.000', () => {
    const d = k(analizar(plan(700), conCampo, 'agro'), 'deuda_bancaria_por_ha');
    expect(d).toMatchObject({ valor: 2.1, status: null, informativo: true });
  });

  it('cruce: ha propias declaradas sin inmuebles rurales en el anexo → alerta; con campo en el anexo, no', () => {
    const sinCampo = extractionWith(x => { x.anexo_bienes_de_uso = [{ rubro: 'Rodados', valor_residual: 100 }]; });
    expect(analizar(plan(700), sinCampo, 'agro').cruces.map(c => c.mensaje).join()).toMatch(/Campo propio declarado no visible en el balance/);
    expect(analizar(plan(700), conCampo, 'agro').cruces).toEqual([]);
  });

  it('sin anexo extraído (caso viejo): mira el detalle del balance y sugiere re-analizar', () => {
    const viejo = extractionWith(x => { delete (x as { anexo_bienes_de_uso?: unknown }).anexo_bienes_de_uso; });
    expect(analizar(plan(700), viejo, 'agro').cruces[0].mensaje).toMatch(/volvé a analizar el balance/);
  });
});

// ---------- documento adicional ----------
describe('principales clientes', () => {
  const clientes = (pcts: number[]) => doc('principales_clientes', { fecha_documento: null, clientes: pcts.map((p, i) => ({ cliente: `C${i}`, porcentaje_ventas: p, monto: null })) });

  it('top1 30%, top3 65% → alerta / alerta', () => {
    const a = analizar(clientes([30, 20, 15, 10]), extractionWith(() => {}), 'servicios');
    expect(k(a, 'top1_clientes')).toMatchObject({ valor: 0.3, status: 'alert' });
    expect(k(a, 'top3_clientes').valor).toBeCloseTo(0.65, 10);
    expect(k(a, 'top3_clientes').status).toBe('alert');
  });

  it('suma de % > 100 → error de datos; Σ montos > ventas → alerta', () => {
    expect(analizar(clientes([60, 50]), extractionWith(() => {}), 'comercio').cruces[0]).toMatchObject({ nivel: 'error' });
    const montos = doc('principales_clientes', { fecha_documento: null, clientes: [{ cliente: 'A', porcentaje_ventas: null, monto: 20000 }] });
    expect(analizar(montos, extractionWith(() => {}), 'comercio').cruces[0]).toMatchObject({ nivel: 'alerta' });
  });

  it('sin porcentaje: se usa monto / ventas anuales', () => {
    const montos = doc('principales_clientes', { fecha_documento: null, clientes: [{ cliente: 'A', porcentaje_ventas: null, monto: 3650 }] });
    expect(k(analizar(montos, extractionWith(() => {}), 'comercio'), 'top1_clientes').valor).toBeCloseTo(3650 / 14600, 10);
  });
});

describe('financiera + "Principales deudores"', () => {
  const fin = extractionWith(x => {
    x.extraccion_financiera = {
      fecha_cierre: '2025-12-31', cartera_total: 850, cartera_total_anterior: null, cartera_vencida_por_tramo: [], previsiones_incobrabilidad: null,
      cargo_incobrabilidad: null, ingresos_financieros: null, egresos_financieros: null, creditos_a_vencer_90_dias: null, pasivos_a_vencer_90_dias: null,
      inversiones_corrientes: null, fondeo: [],
    };
  });
  const deudores = doc('principales_clientes', { fecha_documento: null, clientes: Array.from({ length: 12 }, (_, i) => ({ cliente: `D${i}`, porcentaje_ventas: null, monto: 30 - i })) });

  it('se rotula "Principales deudores" y completa top 10 / cartera, con semáforo', () => {
    const perfil = perfilEfectivo('financiera', 'consumo');
    expect(analizar(deudores, fin, 'financiera', 'consumo').titulo).toBe('Principales deudores');
    const sin = computeRatios(fin, perfil, []);
    expect(sin.top10_sobre_cartera.actual).toBeNull();
    const con = computeRatios(fin, perfil, [deudores]);
    // 10 mayores: 30 + 29 + … + 21 = 255 → 255 / 850 = 30% → alerta (≤ 35%)
    expect(con.top10_sobre_cartera.actual).toBeCloseTo(255 / 850, 10);
    expect(con.top10_sobre_cartera.status).toBe('alert');
  });

  it('la carga manual manda sobre el documento', () => {
    const manual = extractionWith(x => { x.extraccion_financiera = { ...fin.extraccion_financiera!, top10_deudores_monto: 85 }; });
    expect(computeRatios(manual, perfilEfectivo('financiera', 'consumo'), [deudores]).top10_sobre_cartera.actual).toBeCloseTo(0.1, 10);
  });
});

describe('"Otro": solo los hechos marcados llegan a la opinión', () => {
  const otro = doc('otro', { fecha_documento: null, descripcion_documento: 'Nota del cliente', hechos: [
    { categoria: 'contratos', descripcion: 'Contrato con Toyota por 24 meses', monto: 900, fecha: null, cita_textual: '…contrato de provisión por 24 meses…', pagina: 2, incluir: true },
    { categoria: 'deuda', descripcion: 'Refinanció deuda con Banco X', monto: 300, fecha: null, cita_textual: '…refinanciamos…', pagina: 3, incluir: false },
  ] });

  it('el prompt recibe solo el hecho marcado, con su cita', () => {
    const e = extractionWith(() => {});
    const perfil = perfilEfectivo('comercio');
    const sector = confirmarRubro(sectorInicial(e), 'comercio', '', '', null);
    const ratios = computeRatios(e, perfil, [otro]);
    const ctx = armarContextoOpinion({ extraction: e, ratios, inconsistencias: [], crossCheck: null, verification: null, marketAnalysis: null, companyHistory: null, pce: null, perfil, sector, senales: [], documentos: [otro] });
    const json = JSON.stringify(ctx);
    expect(json).toContain('Contrato con Toyota por 24 meses');
    expect(json).toContain('contrato de provisión por 24 meses');
    expect(json).not.toContain('Refinanció deuda con Banco X');
    expect(json).not.toContain('refinanciamos');
  });
});

describe('pisos, opinión desactualizada y vigencia', () => {
  it('un documento no baja un piso existente (situación BCRA 3)', () => {
    const e = extractionWith(x => { x.extraccion_nosis!.situacion_bcra_peor_estado = 3; x.ejercicio_actual.estado_resultados.ventas_netas = 2000; });
    const perfil = perfilEfectivo('construccion');
    const piso = (docs: DocumentoSectorial[]) => Math.max(...detectSignals({ extraction: e, ratios: computeRatios(e, perfil, docs), inconsistencias: runSanityChecks(e), crossCheck: null, perfil, documentos: docs }).map(s => s.piso ?? 0));
    const buenisimo = doc('listado_obras', { fecha_documento: null, obras: [obra('A', 'privado', 'en_ejecucion', 5000)] });
    expect(piso([])).toBe(75);
    expect(piso([buenisimo])).toBe(75);
  });

  it('cargar o editar un documento después de la opinión la deja desactualizada', () => {
    const e = extractionWith(() => {});
    const s = confirmarRubro(sectorInicial(e), 'comercio', '', '', null);
    const d = doc('principales_clientes', { fecha_documento: null, clientes: [] });
    const opinion = { perfil: perfilEfectivo('comercio'), politicaVersion: '2.2.0', documentosFirma: firmaDocumentos([d]) };
    expect(estadoPorton(s, opinion, [d]).opinion).toBe('vigente');
    expect(estadoPorton(s, opinion, [{ ...d, actualizadoEn: '2026-05-01T00:00:00Z', editado: true }]).opinion).toBe('desactualizada');
    expect(estadoPorton(s, opinion, [d, doc('otro', { fecha_documento: null, descripcion_documento: null, hechos: [] }, '2026-03-31', 'd2')]).opinion).toBe('desactualizada');
  });

  it('documento con más de 6 meses → aviso en el pre-chequeo', () => {
    const e = extractionWith(() => {});
    const viejo = doc('plan_siembra', { fecha_documento: '2025-05-01', campania: null, lotes: [], costo_arrendamiento: null }, '2025-05-01');
    const p = armarPrechequeo({ extraction: e, ratios: null, crossCheck: null, inconsistencias: [], documentos: [viejo], fechaCaso: '2026-04-01', perfil: perfilEfectivo('agro') });
    expect(p.alertas.some(a => /desactualizado/.test(a))).toBe(true);
  });
});

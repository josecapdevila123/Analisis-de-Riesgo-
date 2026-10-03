import { describe, expect, it } from 'vitest';
import { armarPrechequeo, faltantesBase } from './prechequeo';
import { perfilEfectivo } from './policy';
import { computeRatios } from '../ratios/calculations';
import { buildExtraction, extractionWith } from '../ratios/__fixtures__/extraction';
import { DocumentoSectorial } from '../sectorDocs/tipos';

const doc = (fecha: string): DocumentoSectorial => ({
  id: 'd', tipo: 'reporte_mora', nombreArchivo: 'mora.pdf', fechaDocumento: fecha, cargadoPor: null, cargadoEn: fecha,
  actualizadoEn: fecha, estado: 'ok', editado: false, extraccion: { fecha_corte: fecha, tramos: [{ tramo: 'al_dia', monto: 100 }], previsiones: 1, por_producto: null },
});

describe('pre-chequeo', () => {
  it('documentación base: marca lo que falta', () => {
    const e = extractionWith(x => { x.extraccion_nosis = null; });
    expect(faltantesBase(e)).toEqual(['Informe Nosis', 'Ventas post balance', 'Deudas post balance', 'Accionistas y directorio']);
  });

  it('comercio: ningún documento recomendado, solo el documento adicional opcional; sin bloque financiero', () => {
    const e = buildExtraction();
    const p = armarPrechequeo({ extraction: e, ratios: computeRatios(e), crossCheck: null, inconsistencias: [], documentos: [], fechaCaso: '2026-04-01', perfil: perfilEfectivo('comercio') });
    expect(p.documentosRubro.map(d => [d.tipo, d.recomendado])).toEqual([['principales_clientes', false], ['cartera_contratos', false], ['otro', false]]);
    expect(p.bloqueFinanciero.requerido).toBe(false);
    expect(p.kpis[0].label).toBe('Días de stock');
  });

  it('financiera: reporte de mora recomendado, bloque financiero requerido, documento de más de 6 meses → alerta', () => {
    const e = buildExtraction();
    const perfil = perfilEfectivo('financiera', 'consumo');
    const sin = armarPrechequeo({ extraction: e, ratios: computeRatios(e, perfil), crossCheck: null, inconsistencias: [], documentos: [], fechaCaso: '2026-04-01', perfil });
    expect(sin.documentosRubro[0]).toMatchObject({ tipo: 'reporte_mora', recomendado: true, cargados: [] });
    expect(sin.bloqueFinanciero).toEqual({ requerido: true, cargado: false });
    const viejo = armarPrechequeo({ extraction: e, ratios: null, crossCheck: null, inconsistencias: [], documentos: [doc('2025-06-30')], fechaCaso: '2026-04-01', perfil });
    expect(viejo.alertas.some(a => a.includes('desactualizado'))).toBe(true);
    const nuevo = armarPrechequeo({ extraction: e, ratios: null, crossCheck: null, inconsistencias: [], documentos: [doc('2026-02-28')], fechaCaso: '2026-04-01', perfil });
    expect(nuevo.alertas.some(a => a.includes('desactualizado'))).toBe(false);
  });
});

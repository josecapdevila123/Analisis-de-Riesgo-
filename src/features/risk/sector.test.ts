import { describe, expect, it } from 'vitest';
import { sugerirRubro } from './sector';

const con = (activity: string) => sugerirRubro({ company_profile: { name: '', cuit: '', activity, anio_actual: '', anio_anterior: '' } });

describe('sugerirRubro', () => {
  it.each([
    ['Venta al por mayor de artículos de iluminación', 'comercio'],
    ['Producción agrícola y ganadera', 'agro'],
    ['Acopio de cereales y oleaginosas', 'agro'],
    ['Fabricación de envases plásticos', 'industria'],
    ['Construcción de edificios y obras viales', 'construccion'],
    ['Distribuidora mayorista de alimentos', 'comercio'],
    ['Servicios de limpieza', 'servicios'],
    // Corregidas (no estaban en la lista original):
    ['Ventas de artículos congelados y alimentos en general', 'comercio'],
    ['Comercio de repuestos', 'comercio'],
  ])('"%s" → %s', (actividad, esperado) => {
    expect(con(actividad).rubro).toBe(esperado);
  });

  it('prioridad: construcción > agro > industria > comercio > servicios', () => {
    expect(con('Construcción y comercialización de viviendas').rubro).toBe('construccion');
    expect(con('Elaboración y distribución de semillas').rubro).toBe('agro');
    expect(con('Fabricación y venta al por mayor de muebles').rubro).toBe('industria');
  });

  it('"servicio" y "venta" solo cuentan si no hay una palabra fuerte', () => {
    expect(con('Servicios de transporte y venta de combustibles').rubro).toBe('comercio');
    expect(con('Fabricación y servicio técnico de bombas').rubro).toBe('industria');
  });

  it('no confunde: obra social, mano de obra y distribución de energía', () => {
    expect(con('Obra social de empleados de comercio').rubro).toBe('comercio');
    expect(con('Provisión de mano de obra temporaria').rubro).toBeNull();
    expect(con('Distribución de energía eléctrica').rubro).toBeNull();
    expect(con('Transporte provincial de pasajeros').rubro).toBeNull();
  });

  it('sin coincidencias → null, con la lista vacía', () => {
    expect(con('Holding de inversiones')).toEqual({ rubro: null, coincidencias: [] });
    expect(sugerirRubro(null).rubro).toBeNull();
  });

  it('devuelve el porqué (palabras que coincidieron)', () => {
    const s = con('Fabricación y venta al por mayor de muebles');
    expect(s.coincidencias.map(c => `${c.rubro}:${c.palabra}`)).toEqual(['industria:fabricacion', 'comercio:por mayor', 'comercio:venta']);
  });
});

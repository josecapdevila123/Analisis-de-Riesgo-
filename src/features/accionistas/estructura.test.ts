import { describe, expect, it } from 'vitest';
import { armarArbol, esAccionista, finalesDeCadena, nombresDeAccionistas, sumaCierra, sumaParticipaciones } from './estructura';

// Holding con 60% (sus dueños: Pérez 70%, Gómez 30%), Pérez directo 30%, Ruiz 10%.
const accionistas = [
  {
    nombre: 'Holding S.A.', dni_cuit: '30-11111111-1', participacion: 60,
    subAccionistas: [
      { nombre: 'Pérez, Juan', dni_cuit: '20-22222222-2', participacion: 70 },
      { nombre: 'Gómez, Ana', dni_cuit: '27-33333333-3', participacion: 30 },
    ],
  },
  { nombre: 'Pérez, Juan', dni_cuit: '20-22222222-2', participacion: 30 },
  { nombre: 'Ruiz, Carlos', dni_cuit: '20.444.444', participacion: 10 },
];

describe('armarArbol', () => {
  const arbol = armarArbol(accionistas);

  it('participación indirecta = producto de la cadena: 60% × 70% = 42%', () => {
    expect(arbol[0].indirecta).toBe(60);
    expect(arbol[0].hijos[0].indirecta).toBeCloseTo(42, 10);
    expect(arbol[0].hijos[1].indirecta).toBeCloseTo(18, 10);
  });

  it('nivel, índices para editar y suma de los hijos', () => {
    expect(arbol[0].hijos[1].nivel).toBe(2);
    expect(arbol[0].hijos[1].indices).toEqual([0, 1]);
    expect(arbol[0].sumaHijos).toBe(100);
    expect(arbol[1].sumaHijos).toBeNull();
  });

  it('sin % en un eslabón → indirecta null para abajo', () => {
    const a = armarArbol([{ nombre: 'X', dni_cuit: '', participacion: null as unknown as number, subAccionistas: [{ nombre: 'Y', dni_cuit: '', participacion: 50 }] }]);
    expect(a[0].indirecta).toBeNull();
    expect(a[0].hijos[0].indirecta).toBeNull();
  });

  it('"N/A" se muestra vacío', () => {
    expect(armarArbol([{ nombre: 'N/A', dni_cuit: 'N/A', participacion: 100 }])[0]).toMatchObject({ nombre: '', dni_cuit: '' });
  });
});

describe('sumas', () => {
  it('primer nivel suma 100 y cierra; 97 no cierra', () => {
    expect(sumaParticipaciones(accionistas)).toBe(100);
    expect(sumaCierra(100)).toBe(true);
    expect(sumaCierra(99.99)).toBe(true);
    expect(sumaCierra(97)).toBe(false);
  });
});

describe('finalesDeCadena', () => {
  it('suma las cadenas de la misma persona: Pérez 42% indirecto + 30% directo = 72%', () => {
    const finales = finalesDeCadena(armarArbol(accionistas));
    expect(finales[0]).toMatchObject({ nombre: 'Pérez, Juan', cadenas: 2 });
    expect(finales[0].indirecta).toBeCloseTo(72, 10);
    expect(finales.map(f => f.nombre)).toEqual(['Pérez, Juan', 'Gómez, Ana', 'Ruiz, Carlos']);
  });
});

describe('esAccionista', () => {
  const nombres = nombresDeAccionistas(armarArbol(accionistas));

  it('reconoce el nombre sin importar orden, acentos ni comas', () => {
    expect(esAccionista('Juan Perez', nombres)).toBe(true);
    expect(esAccionista('ANA GÓMEZ', nombres)).toBe(true);
  });

  it('tolera un segundo nombre de más: "Juan Carlos Pérez" = "Pérez, Juan"', () => {
    expect(esAccionista('Juan Carlos Pérez', nombres)).toBe(true);
  });

  it('no confunde con otro nombre, con un solo apellido ni con vacío', () => {
    expect(esAccionista('Carlos Gómez', nombres)).toBe(false);
    expect(esAccionista('Pérez', nombres)).toBe(false);
    expect(esAccionista('', nombres)).toBe(false);
  });
});

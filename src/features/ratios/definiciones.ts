import type { RawExtraction } from '../extraction/schemas';

// DEFINICIÓN ÚNICA DE CADA RATIO ANUAL.
// Cada definición devuelve el valor Y la cuenta que lo produjo (términos con su
// origen y los renglones del balance que se sumaron o excluyeron). calculations.ts
// toma el valor de acá y la pestaña de cálculos muestra la cuenta: es el mismo
// código, no puede haber dos versiones de una fórmula.

type Year = RawExtraction['ejercicio_actual'];
type Detalle = { rubro: string; monto: number };

export type Renglones = { incluidos: Detalle[]; excluidos: Detalle[] };

// Un número que entra en una cuenta, con de dónde sale.
export type Termino = {
  label: string;
  valor: number | null;
  origen: string;              // "Balance: activo corriente (total)"
  renglones?: Renglones;       // si es una suma de renglones por palabras clave
  componentes?: Termino[];     // si es un valor calculado (EBITDA, deuda neta…)
  signo?: '+' | '−';           // dentro de componentes
  nota?: string;               // supuesto o tratamiento ("en valor absoluto")
};

export type Calculo = {
  valor: number | null;
  formula: string;             // "Activo corriente / pasivo corriente"
  cuenta: string;              // "5.000 / 2.500"
  terminos: Termino[];
  nota?: string;               // por qué no se pudo calcular, o un supuesto
};

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const safeDivide = (n: number | null, d: number | null): number | null => (!fin(n) || !fin(d) || d === 0 ? null : n / d);
const por365 = (v: number | null) => (v === null ? null : v * 365);

export const fmtNumero = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? 's/d' : v.toLocaleString('es-AR', { maximumFractionDigits: 2 });

// ---------- renglones por palabras clave ----------

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const KW_DISPONIBILIDADES = ['caja', 'banco', 'efectivo', 'disponibilidad'];
export const KW_CREDITOS = ['credito', 'cobrar', 'deudores por venta', 'cliente'];
// "Otros créditos" y "Créditos fiscales" no son créditos por ventas.
export const EXCL_CREDITOS = ['otro', 'otra', 'fiscal', 'impositiv'];
export const KW_DEUDAS_COMERCIALES = ['comercial', 'pagar', 'proveedor', 'acreedor'];
// "a pagar" también aparece en deudas fiscales, laborales y financieras.
export const EXCL_DEUDAS_COMERCIALES = ['fiscal', 'impositiv', 'remuneracion', 'social', 'dividendo', 'prestamo', 'bancari', 'financier', 'otro', 'otra'];
// Anticipos de clientes en el pasivo (construcción se financia con ellos).
export const KW_ANTICIPOS_CLIENTES = ['anticipo', 'adelanto'];
export const EXCL_ANTICIPOS_CLIENTES = ['proveedor', 'impuest', 'fiscal', 'ganancia', 'remuneraci', 'sueldo', 'personal', 'honorario'];

// Suma los renglones que tienen alguna palabra clave y ninguna excluida.
// Devuelve null si no hubo ninguno (no se informa lo que no está).
export function sumarRenglones(detalles: Detalle[], keywords: string[], exclude: string[] = []): { total: number | null; renglones: Renglones } {
  const incluidos: Detalle[] = [];
  const excluidos: Detalle[] = [];
  for (const item of detalles) {
    const rubro = normalize(item.rubro);
    if (!keywords.some(kw => rubro.includes(kw))) continue;
    if (exclude.some(ex => rubro.includes(ex))) excluidos.push(item);
    else incluidos.push(item);
  }
  return { total: incluidos.length ? incluidos.reduce((a, d) => a + d.monto, 0) : null, renglones: { incluidos, excluidos } };
}

// ---------- insumos de un ejercicio ----------

export type Insumos = ReturnType<typeof insumosDelEjercicio>;

export function insumosDelEjercicio(year: Year, deudaCorriente: number, deudaNoCorriente: number) {
  const esp = year.estado_situacion_patrimonial;
  const er = year.estado_resultados;
  const ef = year.flujo_efectivo;
  const t = (label: string, valor: number | null, origen: string, extra: Partial<Termino> = {}): Termino => ({ label, valor, origen, ...extra });
  const abs = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.abs(v));

  const disp = sumarRenglones(esp.activo_corriente.detalles, KW_DISPONIBILIDADES);
  const cred = sumarRenglones(esp.activo_corriente.detalles, KW_CREDITOS, EXCL_CREDITOS);
  const comerc = sumarRenglones(esp.pasivo_corriente.detalles, KW_DEUDAS_COMERCIALES, EXCL_DEUDAS_COMERCIALES);
  const antC = sumarRenglones(esp.pasivo_corriente.detalles, KW_ANTICIPOS_CLIENTES, EXCL_ANTICIPOS_CLIENTES);
  const antNC = sumarRenglones(esp.pasivo_no_corriente.detalles, KW_ANTICIPOS_CLIENTES, EXCL_ANTICIPOS_CLIENTES);

  // EBITDA. Costos y gastos en valor absoluto (Gemini puede traerlos con o sin
  // signo); valuación de BdC e inversiones permanentes conservan su signo.
  const ebitdaComp: Termino[] = [
    t('Resultado bruto', er.resultado_bruto, 'Estado de resultados', { signo: '+' }),
    t('Resultado por valuación de bienes de cambio', er.resultado_valuacion_bienes_de_cambio ?? 0, 'Estado de resultados', { signo: '+', nota: er.resultado_valuacion_bienes_de_cambio === null ? 'No informado: se toma 0' : undefined }),
    t('Depreciación de bienes de uso', Math.abs(ef.depreciacion_bienes_de_uso ?? 0), 'Flujo de efectivo', { signo: '+', nota: 'En valor absoluto' }),
    t('Resultado de inversiones permanentes', er.resultado_inversiones_permanentes ?? 0, 'Estado de resultados', { signo: '+', nota: er.resultado_inversiones_permanentes === null ? 'No informado: se toma 0' : undefined }),
    t('Gastos de comercialización', Math.abs(er.gastos_comercializacion), 'Estado de resultados', { signo: '−', nota: 'En valor absoluto' }),
    t('Gastos de administración', Math.abs(er.gastos_administracion), 'Estado de resultados', { signo: '−', nota: 'En valor absoluto' }),
  ];
  const ebitdaValor = ebitdaComp.reduce((a, c) => a + (c.signo === '−' ? -1 : 1) * (c.valor as number), 0);

  const deudaTotal = deudaCorriente + deudaNoCorriente;
  const anticiposCorriente = antC.total ?? 0;
  const anticiposTotal = (antC.total ?? 0) + (antNC.total ?? 0);

  return {
    ac: t('Activo corriente', esp.activo_corriente.total, 'Balance: activo corriente (total)'),
    anc: t('Activo no corriente', esp.activo_no_corriente.total, 'Balance: activo no corriente (total)'),
    activo: t('Activo total', esp.total_activo, 'Balance: total del activo'),
    pc: t('Pasivo corriente', esp.pasivo_corriente.total, 'Balance: pasivo corriente (total)'),
    pasivo: t('Pasivo total', esp.total_pasivo, 'Balance: total del pasivo'),
    pn: t('Patrimonio neto', esp.patrimonio_neto, 'Balance: patrimonio neto'),
    // Con PN ≤ 0 (quiebra técnica) endeudamiento y ROE no tienen sentido.
    pnPositivo: t('Patrimonio neto', esp.patrimonio_neto > 0 ? esp.patrimonio_neto : null, 'Balance: patrimonio neto', esp.patrimonio_neto > 0 ? {} : { nota: 'PN no positivo: el ratio no se calcula' }),
    bc: t('Bienes de cambio', esp.bienes_de_cambio, 'Balance: bienes de cambio'),
    disponibilidades: t('Caja y bancos', disp.total, 'Balance: renglones del activo corriente con caja, banco, efectivo o disponibilidades', { renglones: disp.renglones }),
    creditos: t('Créditos por ventas', cred.total, 'Balance: renglones del activo corriente con créditos o clientes (sin "otros" ni fiscales)', { renglones: cred.renglones }),
    deudasComerciales: t('Deudas comerciales', comerc.total, 'Balance: renglones del pasivo corriente con comerciales, proveedores o a pagar (sin fiscales, laborales ni financieras)', { renglones: comerc.renglones }),
    ventas: t('Ventas netas', er.ventas_netas, 'Estado de resultados'),
    costo: t('Costo de ventas', Math.abs(er.costo_ventas), 'Estado de resultados', { nota: 'En valor absoluto' }),
    rb: t('Resultado bruto', er.resultado_bruto, 'Estado de resultados'),
    rn: t('Resultado neto', er.resultado_neto, 'Estado de resultados'),
    gfin: t('Gastos financieros', abs(er.gastos_financieros), 'Estado de resultados', { nota: 'En valor absoluto' }),
    impuestos: t('Impuesto a las ganancias', Math.abs(er.impuesto_ganancias ?? 0), 'Estado de resultados', { nota: er.impuesto_ganancias == null ? 'No informado: se toma 0' : 'En valor absoluto' }),
    depreciacion: t('Depreciación de bienes de uso', abs(ef.depreciacion_bienes_de_uso), 'Flujo de efectivo', { nota: 'En valor absoluto' }),
    capexMantenimiento: t('Capex de mantenimiento', Math.abs(ef.depreciacion_bienes_de_uso ?? 0), 'Flujo de efectivo', { nota: 'Aproximado por la depreciación de bienes de uso' }),
    pagosBdU: t('Pagos por bienes de uso (capex)', abs(ef.pagos_bienes_de_uso ?? null), 'Flujo de efectivo', { nota: 'En valor absoluto' }),
    flujoOperativo: t('Flujo operativo', ef.flujo_neto_operativo, 'Flujo de efectivo'),
    ebitda: t('EBITDA', ebitdaValor, 'Calculado', { componentes: ebitdaComp }),
    deudaCorriente: t('Deuda bancaria corriente', deudaCorriente, 'Balance: deuda bancaria y financiera corriente'),
    deudaNoCorriente: t('Deuda bancaria no corriente', deudaNoCorriente, 'Balance: deuda bancaria y financiera no corriente'),
    deudaTotal: t('Deuda bancaria total', deudaTotal, 'Calculado', {
      componentes: [
        t('Deuda bancaria corriente', deudaCorriente, 'Balance', { signo: '+' }),
        t('Deuda bancaria no corriente', deudaNoCorriente, 'Balance', { signo: '+' }),
      ],
    }),
    anticiposCorriente: t('Anticipos de clientes (corrientes)', antC.total, 'Balance: renglones del pasivo corriente con anticipos o adelantos (sin proveedores ni impuestos)', { renglones: antC.renglones }),
    anticiposTotal: t('Anticipos de clientes', antC.total === null && antNC.total === null ? null : anticiposTotal, 'Balance: renglones del pasivo con anticipos o adelantos (sin proveedores ni impuestos)', {
      renglones: { incluidos: [...antC.renglones.incluidos, ...antNC.renglones.incluidos], excluidos: [...antC.renglones.excluidos, ...antNC.renglones.excluidos] },
    }),
    _anticiposCorrienteValor: anticiposCorriente,
    _anticiposTotalValor: anticiposTotal,
  };
}

// ---------- constructores de cuentas ----------

const v = (x: Termino) => fmtNumero(x.valor);

const cociente = (formula: string, num: Termino, den: Termino, nota?: string): Calculo => {
  const valor = safeDivide(num.valor, den.valor);
  return { valor, formula, cuenta: `${v(num)} / ${v(den)}`, terminos: [num, den], nota: valor === null ? (nota ?? notaNulo(num, den)) : nota };
};
const dias = (formula: string, num: Termino, den: Termino): Calculo => {
  const valor = por365(safeDivide(num.valor, den.valor));
  return { valor, formula, cuenta: `${v(num)} / ${v(den)} × 365`, terminos: [num, den], nota: valor === null ? notaNulo(num, den) : undefined };
};
const directo = (formula: string, x: Termino): Calculo => ({ valor: x.valor, formula, cuenta: v(x), terminos: [x] });
const derivado = (label: string, valor: number | null, componentes: Termino[], origen = 'Calculado'): Termino => ({ label, valor, origen, componentes });
const notaNulo = (num: Termino, den: Termino) =>
  num.valor === null ? `Falta ${num.label.toLowerCase()}${num.nota ? ` (${num.nota})` : ''}.`
    : den.valor === null ? `Falta ${den.label.toLowerCase()}${den.nota ? ` (${den.nota})` : ''}.`
    : den.valor === 0 ? `${den.label} es 0: no se puede dividir.` : undefined;

// ---------- definiciones ----------

export type ClaveAnual =
  | 'ebitda' | 'liquidez_corriente' | 'liquidez_acida' | 'liquidez_inmediata' | 'solvencia' | 'endeudamiento'
  | 'capital_de_trabajo' | 'ktno' | 'margen_bruto' | 'margen_ebitda' | 'margen_neto' | 'cobertura_intereses'
  | 'deuda_bancaria_total' | 'deuda_ebitda' | 'deuda_dias_ventas' | 'dias_de_cobro' | 'dias_de_pago' | 'dias_de_stock'
  | 'ciclo_conversion_caja' | 'indice_inmovilizacion' | 'autofinanciamiento' | 'roe' | 'roa' | 'deuda_neta_ebitda'
  | 'dscr' | 'calidad_ganancia' | 'deuda_financiera_pn'
  | 'bienes_cambio_deuda_cp' | 'deuda_bancaria_ventas' | 'deuda_cp_share' | 'deuda_comercial_bancaria' | 'capex_depreciacion'
  | 'anticipos_clientes' | 'anticipos_ventas' | 'liquidez_corriente_sin_anticipos' | 'endeudamiento_sin_anticipos' | 'pn_activo';

export const DEFINICIONES: Record<ClaveAnual, (i: Insumos) => Calculo> = {
  ebitda: i => ({ ...directo('Resultado bruto + valuación BdC + depreciación + inversiones permanentes − gastos de comercialización − gastos de administración', i.ebitda), cuenta: i.ebitda.componentes!.map((c, k) => `${k === 0 ? '' : `${c.signo} `}${v(c)}`).join(' ') }),
  liquidez_corriente: i => cociente('Activo corriente / pasivo corriente', i.ac, i.pc),
  liquidez_acida: i => {
    if (i.bc.valor === null) return { valor: null, formula: '(Activo corriente − bienes de cambio) / pasivo corriente', cuenta: 's/d', terminos: [i.ac, i.bc, i.pc], nota: 'Falta bienes de cambio.' };
    const num = derivado('Activo corriente − bienes de cambio', (i.ac.valor as number) - i.bc.valor, [{ ...i.ac, signo: '+' }, { ...i.bc, signo: '−' }]);
    return cociente('(Activo corriente − bienes de cambio) / pasivo corriente', num, i.pc);
  },
  liquidez_inmediata: i => cociente('Caja y bancos / pasivo corriente', i.disponibilidades, i.pc),
  solvencia: i => cociente('Patrimonio neto / pasivo total', i.pn, i.pasivo),
  endeudamiento: i => cociente('Pasivo total / patrimonio neto', i.pasivo, i.pnPositivo),
  capital_de_trabajo: i => ({ valor: (i.ac.valor as number) - (i.pc.valor as number), formula: 'Activo corriente − pasivo corriente', cuenta: `${v(i.ac)} − ${v(i.pc)}`, terminos: [i.ac, i.pc] }),
  ktno: i => {
    const ok = i.creditos.valor !== null && i.bc.valor !== null && i.deudasComerciales.valor !== null;
    return {
      valor: ok ? (i.creditos.valor as number) + (i.bc.valor as number) - (i.deudasComerciales.valor as number) : null,
      formula: 'Créditos por ventas + bienes de cambio − deudas comerciales',
      cuenta: `${v(i.creditos)} + ${v(i.bc)} − ${v(i.deudasComerciales)}`,
      terminos: [i.creditos, i.bc, i.deudasComerciales],
      nota: ok ? undefined : 'Falta algún componente (créditos por ventas, bienes de cambio o deudas comerciales).',
    };
  },
  margen_bruto: i => cociente('Resultado bruto / ventas', i.rb, i.ventas),
  margen_ebitda: i => cociente('EBITDA / ventas', i.ebitda, i.ventas),
  margen_neto: i => cociente('Resultado neto / ventas', i.rn, i.ventas),
  cobertura_intereses: i => cociente('EBITDA / gastos financieros', i.ebitda, i.gfin),
  deuda_bancaria_total: i => ({ ...directo('Deuda bancaria corriente + no corriente', i.deudaTotal), cuenta: `${v(i.deudaCorriente)} + ${v(i.deudaNoCorriente)}`, terminos: [i.deudaCorriente, i.deudaNoCorriente] }),
  deuda_ebitda: i => cociente('Deuda bancaria / EBITDA', i.deudaTotal, i.ebitda),
  deuda_dias_ventas: i => dias('Deuda bancaria / ventas × 365', i.deudaTotal, i.ventas),
  dias_de_cobro: i => dias('Créditos por ventas / ventas × 365', i.creditos, i.ventas),
  dias_de_pago: i => dias('Deudas comerciales / costo de ventas × 365', i.deudasComerciales, i.costo),
  dias_de_stock: i => dias('Bienes de cambio / costo de ventas × 365', i.bc, i.costo),
  ciclo_conversion_caja: i => {
    const c = DEFINICIONES.dias_de_cobro(i).valor, s = DEFINICIONES.dias_de_stock(i).valor, p = DEFINICIONES.dias_de_pago(i).valor;
    const ok = c !== null && s !== null && p !== null;
    return {
      valor: ok ? c + s - p : null,
      formula: 'Días de cobro + días de stock − días de pago',
      cuenta: `${fmtNumero(c)} + ${fmtNumero(s)} − ${fmtNumero(p)}`,
      terminos: [
        derivado('Días de cobro', c, [i.creditos, i.ventas]),
        derivado('Días de stock', s, [i.bc, i.costo]),
        derivado('Días de pago', p, [i.deudasComerciales, i.costo]),
      ],
      nota: ok ? undefined : 'Falta alguno de los días (cobro, stock o pago).',
    };
  },
  indice_inmovilizacion: i => cociente('Activo no corriente / activo total', i.anc, i.activo),
  autofinanciamiento: i => cociente('Flujo operativo / deuda bancaria', i.flujoOperativo, i.deudaTotal),
  roe: i => cociente('Resultado neto / patrimonio neto', i.rn, i.pnPositivo),
  roa: i => cociente('Resultado neto / activo total', i.rn, i.activo),
  deuda_neta_ebitda: i => {
    // Deuda neta = deuda − caja (sin renglones de caja, se usa la deuda total).
    const deudaNeta = derivado('Deuda neta', (i.deudaTotal.valor as number) - (i.disponibilidades.valor ?? 0), [
      { ...i.deudaTotal, signo: '+' },
      { ...i.disponibilidades, valor: i.disponibilidades.valor ?? 0, signo: '−', nota: i.disponibilidades.valor === null ? 'Sin renglones de caja: se toma 0' : undefined },
    ]);
    const ebitdaPos: Termino = { ...i.ebitda, valor: (i.ebitda.valor as number) > 0 ? i.ebitda.valor : null, nota: (i.ebitda.valor as number) > 0 ? undefined : 'EBITDA no positivo: el ratio no se calcula' };
    return cociente('(Deuda bancaria − caja y bancos) / EBITDA', deudaNeta, ebitdaPos);
  },
  dscr: i => {
    // DSCR = (EBITDA − capex de mantenimiento − impuestos) / (intereses + deuda corriente)
    const flujo = derivado('EBITDA − capex de mantenimiento − impuestos', (i.ebitda.valor as number) - (i.capexMantenimiento.valor as number) - (i.impuestos.valor as number), [
      { ...i.ebitda, signo: '+' }, { ...i.capexMantenimiento, signo: '−' }, { ...i.impuestos, signo: '−' },
    ]);
    const servicio = derivado('Intereses + deuda bancaria corriente', (i.gfin.valor ?? 0) + (i.deudaCorriente.valor as number), [
      { ...i.gfin, valor: i.gfin.valor ?? 0, signo: '+', nota: i.gfin.valor === null ? 'No informado: se toma 0' : i.gfin.nota },
      { ...i.deudaCorriente, signo: '+', nota: 'Aproxima la amortización de capital del año' },
    ]);
    return cociente('(EBITDA − capex de mantenimiento − impuestos) / (intereses + deuda bancaria corriente)', flujo, servicio);
  },
  calidad_ganancia: i => cociente('Flujo operativo / EBITDA', i.flujoOperativo, { ...i.ebitda, valor: (i.ebitda.valor as number) > 0 ? i.ebitda.valor : null, nota: (i.ebitda.valor as number) > 0 ? undefined : 'EBITDA no positivo: el ratio no se calcula' }),
  deuda_financiera_pn: i => cociente('Deuda bancaria / patrimonio neto', i.deudaTotal, i.pnPositivo),
  bienes_cambio_deuda_cp: i => cociente('Bienes de cambio / deuda bancaria corriente', i.bc, i.deudaCorriente),
  deuda_bancaria_ventas: i => cociente('Deuda bancaria / ventas', i.deudaTotal, i.ventas),
  deuda_cp_share: i => cociente('Deuda bancaria corriente / deuda bancaria total', i.deudaCorriente, i.deudaTotal),
  deuda_comercial_bancaria: i => cociente('Deudas comerciales / deuda bancaria', i.deudasComerciales, i.deudaTotal),
  capex_depreciacion: i => cociente('Pagos por bienes de uso / depreciación', i.pagosBdU, i.depreciacion),
  anticipos_clientes: i => directo('Anticipos de clientes del pasivo (corriente + no corriente)', i.anticiposTotal),
  anticipos_ventas: i => cociente('Anticipos de clientes / ventas', i.anticiposTotal, i.ventas),
  liquidez_corriente_sin_anticipos: i => {
    const den = derivado('Pasivo corriente − anticipos de clientes', (i.pc.valor as number) - i._anticiposCorrienteValor, [
      { ...i.pc, signo: '+' }, { ...i.anticiposCorriente, valor: i._anticiposCorrienteValor, signo: '−' },
    ]);
    return cociente('Activo corriente / (pasivo corriente − anticipos de clientes)', i.ac, den);
  },
  endeudamiento_sin_anticipos: i => {
    const num = derivado('Pasivo total − anticipos de clientes', (i.pasivo.valor as number) - i._anticiposTotalValor, [
      { ...i.pasivo, signo: '+' }, { ...i.anticiposTotal, valor: i._anticiposTotalValor, signo: '−' },
    ]);
    return cociente('(Pasivo total − anticipos de clientes) / patrimonio neto', num, i.pnPositivo);
  },
  pn_activo: i => cociente('Patrimonio neto / activo total', i.pn, i.activo),
};

export const CLAVES_ANUALES = Object.keys(DEFINICIONES) as ClaveAnual[];

// Caja y bancos de un ejercicio (la usan las señales de financieras).
export const disponibilidadesDe = (year: Year) => sumarRenglones(year.estado_situacion_patrimonial.activo_corriente.detalles, KW_DISPONIBILIDADES).total;

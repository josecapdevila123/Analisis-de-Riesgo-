import { RawExtraction } from '../extraction/schemas';
import { evaluarConUmbral, RatioStatus } from '../ratios/calculations';
import { DOCUMENTOS_SECTORIALES, KpiDocumento, KW_CAMPO_PROPIO, PerfilEfectivo } from '../risk/policy';
import type { RiskSignal } from '../risk/signals';
import {
  sumaTop10,
  CarteraContratos, DocumentoSectorial, ListadoObras, OtroDocumento, PlanSiembra, PrincipalesClientes,
} from './tipos';

// KPIs, cruces y señales de los documentos sectoriales. Todo por código: Gemini
// solo extrajo. Los documentos son declarados por el cliente (no auditados):
// sus señales se SUMAN a las automáticas y nunca levantan un piso.

export type KpiDoc = {
  key: string;
  label: string;
  valor: number | null;
  unidad: 'pct' | 'x' | 'monto' | 'ha' | 'anios';
  status: RatioStatus | null;
  informativo: boolean;
  motivo?: string;
};
export type CruceDoc = { nivel: 'error' | 'alerta' | 'aviso'; mensaje: string };
export type HechoIncluido = { categoria: string; descripcion: string; monto: number | null; fecha: string | null; cita_textual: string; pagina: number | null };

export type AnalisisDocumento = {
  doc: DocumentoSectorial;
  titulo: string;
  kpis: KpiDoc[];
  cruces: CruceDoc[];
  hechosIncluidos: HechoIncluido[];
};

type Ctx = { extraction: RawExtraction; perfil: PerfilEfectivo };

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const div = (n: number | null, d: number | null) => (fin(n) && fin(d) && d !== 0 ? n / d : null);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const miles = (v: number) => `$ ${Math.round(v).toLocaleString('es-AR')} miles`;
const pct = (v: number) => `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;

const kpi = (ctx: Ctx, key: KpiDocumento, valor: number | null, unidad: KpiDoc['unidad'], motivo?: string): KpiDoc => {
  const t = ctx.perfil.umbralesDocumentos[key];
  return { key, label: t.label, valor, unidad, status: evaluarConUmbral(valor, t), informativo: false, ...(valor === null && motivo ? { motivo } : {}) };
};
const info = (key: string, label: string, valor: number | null, unidad: KpiDoc['unidad'], motivo?: string): KpiDoc =>
  ({ key, label, valor, unidad, status: null, informativo: true, ...(valor === null && motivo ? { motivo } : {}) });

const ventasAnuales = (e: RawExtraction) => e.ejercicio_actual.estado_resultados.ventas_netas;
const deudaBancaria = (e: RawExtraction) => e.deuda_bancaria_actual.corriente.total + e.deuda_bancaria_actual.no_corriente.total;

// Mayor grupo (por nombre normalizado) y su monto.
const mayorGrupo = <T>(items: T[], clave: (x: T) => string, monto: (x: T) => number) => {
  const m = new Map<string, { nombre: string; total: number; items: T[] }>();
  for (const it of items) {
    const k = norm(clave(it));
    const g = m.get(k) ?? { nombre: clave(it), total: 0, items: [] };
    g.total += monto(it);
    g.items.push(it);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total)[0] ?? null;
};

// ---------- plan de siembra ----------
function analizarPlan(p: PlanSiembra, ctx: Ctx): Omit<AnalisisDocumento, 'doc' | 'titulo'> {
  const lotes = p.lotes.filter(l => fin(l.hectareas) && (l.hectareas as number) > 0);
  const total = lotes.reduce((a, l) => a + (l.hectareas as number), 0);
  const propias = lotes.filter(l => l.tenencia === 'propia').reduce((a, l) => a + (l.hectareas as number), 0);
  const cultivo = mayorGrupo(lotes, l => l.cultivo, l => l.hectareas as number);
  const sinHa = 'El plan no informa hectáreas.';
  const kpis = [
    info('hectareas_totales', 'Hectáreas totales', total || null, 'ha', sinHa),
    kpi(ctx, 'pct_arrendado', total ? (total - propias) / total : null, 'pct', sinHa),
    kpi(ctx, 'concentracion_cultivo', total && cultivo ? cultivo.total / total : null, 'pct', sinHa),
    info('deuda_bancaria_por_ha', 'Deuda bancaria por hectárea (miles $ / ha)', total ? deudaBancaria(ctx.extraction) / total : null, 'monto', sinHa),
  ];
  const cruces: CruceDoc[] = [];
  if (propias > 0) {
    const anexo = ctx.extraction.anexo_bienes_de_uso ?? null;
    const rubros = anexo ? anexo.map(a => a.rubro) : ctx.extraction.ejercicio_actual.estado_situacion_patrimonial.activo_no_corriente.detalles.map(d => d.rubro);
    const visible = rubros.some(r => KW_CAMPO_PROPIO.some(k => norm(r).includes(k)));
    if (!visible) {
      cruces.push({
        nivel: 'alerta',
        mensaje: `Campo propio declarado no visible en el balance: el plan declara ${propias.toLocaleString('es-AR')} ha propias y ${anexo ? 'el anexo de bienes de uso no muestra inmuebles rurales, campos ni tierras' : 'el detalle de bienes de uso no muestra inmuebles rurales, campos ni tierras (el caso no tiene el anexo de bienes de uso extraído: volvé a analizar el balance para verificarlo)'}.`,
      });
    }
  }
  return { kpis, cruces, hechosIncluidos: [] };
}

// ---------- listado de obras ----------
const pendienteDeObra = (o: ListadoObras['obras'][number]) => {
  if (fin(o.saldo_a_ejecutar)) return { monto: o.saldo_a_ejecutar as number, estimado: false };
  if (!fin(o.monto_contrato)) return null;
  return { monto: (o.monto_contrato as number) * (1 - (fin(o.porcentaje_avance) ? (o.porcentaje_avance as number) : 0) / 100), estimado: true };
};

function analizarObras(l: ListadoObras, ctx: Ctx): Omit<AnalisisDocumento, 'doc' | 'titulo'> {
  // Obra pendiente: en ejecución + adjudicadas. Las presentadas no suman.
  const vigentes = l.obras.filter(o => o.estado === 'en_ejecucion' || o.estado === 'adjudicada')
    .map(o => ({ o, p: pendienteDeObra(o) }))
    .filter((x): x is { o: ListadoObras['obras'][number]; p: { monto: number; estimado: boolean } } => x.p !== null);
  const pendiente = vigentes.reduce((a, x) => a + x.p.monto, 0);
  const publica = vigentes.filter(x => x.o.tipo_comitente === 'publico').reduce((a, x) => a + x.p.monto, 0);
  const mayor = mayorGrupo(vigentes, x => x.o.comitente, x => x.p.monto);
  const presentadas = l.obras.filter(o => o.estado === 'presentada').reduce((a, o) => a + (fin(o.monto_contrato) ? (o.monto_contrato as number) : 0), 0);
  const ventas = ventasAnuales(ctx.extraction);
  const sobreVentas = div(pendiente, ventas);
  const sinObras = 'No hay obras en ejecución ni adjudicadas con monto.';
  const kpis = [
    info('obra_pendiente', 'Obra pendiente (en ejecución + adjudicadas)', vigentes.length ? pendiente : null, 'monto', sinObras),
    kpi(ctx, 'obra_pendiente_sobre_ventas', vigentes.length ? sobreVentas : null, 'anios', sinObras),
    kpi(ctx, 'pct_obra_publica', pendiente ? publica / pendiente : null, 'pct', sinObras),
    kpi(ctx, 'concentracion_comitente', pendiente && mayor ? mayor.total / pendiente : null, 'pct', sinObras),
    info('licitaciones_presentadas', 'Licitaciones presentadas (no suman)', presentadas || null, 'monto', 'Sin licitaciones presentadas.'),
  ];
  const cruces: CruceDoc[] = [];
  if (vigentes.some(x => x.p.estimado)) cruces.push({ nivel: 'aviso', mensaje: 'Algunas obras no informan el saldo a ejecutar: se estimó como monto × (1 − avance).' });
  if (sobreVentas !== null && sobreVentas > ctx.perfil.senalesDocumentos.cruces.obraPendienteSobreVentasMaxima) {
    cruces.push({ nivel: 'alerta', mensaje: `Cartera declarada desproporcionada frente a la facturación histórica: la obra pendiente equivale a ${sobreVentas.toFixed(1).replace('.', ',')} años de ventas.` });
  }
  const anticipos = anticiposDeClientes(ctx.extraction);
  if (anticipos > 0 && !l.obras.some(o => o.estado === 'en_ejecucion')) {
    cruces.push({ nivel: 'alerta', mensaje: `El balance tiene anticipos de clientes por ${miles(anticipos)} pero el listado no declara obras en ejecución.` });
  }
  return { kpis, cruces, hechosIncluidos: [] };
}

const anticiposDeClientes = (e: RawExtraction) => {
  const esp = e.ejercicio_actual.estado_situacion_patrimonial;
  return [...esp.pasivo_corriente.detalles, ...esp.pasivo_no_corriente.detalles]
    .filter(d => /anticipo|adelanto/.test(norm(d.rubro)) && !/proveedor|impuest|fiscal|ganancia|remuneraci|sueldo|personal|honorario/.test(norm(d.rubro)))
    .reduce((a, d) => a + d.monto, 0);
};

// ---------- principales clientes / deudores ----------
function analizarClientes(c: PrincipalesClientes, ctx: Ctx): Omit<AnalisisDocumento, 'doc' | 'titulo'> {
  const ventas = ventasAnuales(ctx.extraction);
  // Participación: la declarada; si no está, monto / ventas anuales.
  const parts = c.clientes
    .map(x => (fin(x.porcentaje_ventas) ? (x.porcentaje_ventas as number) / 100 : fin(x.monto) ? div(x.monto as number, ventas) : null))
    .filter((v): v is number => v !== null)
    .sort((a, b) => b - a);
  const sinDatos = 'El documento no informa participación ni montos.';
  const esFinanciera = ctx.perfil.modelo === 'financiera';
  const kpis = esFinanciera
    ? [info('top10_deudores', 'Monto de los 10 principales deudores', sumaTop10(c), 'monto', 'El documento no informa montos.')]
    : [
        kpi(ctx, 'top1_clientes', parts.length ? parts[0] : null, 'pct', sinDatos),
        kpi(ctx, 'top3_clientes', parts.length ? parts.slice(0, 3).reduce((a, b) => a + b, 0) : null, 'pct', sinDatos),
      ];
  const cruces: CruceDoc[] = [];
  const sumaPct = c.clientes.reduce((a, x) => a + (fin(x.porcentaje_ventas) ? (x.porcentaje_ventas as number) : 0), 0);
  if (sumaPct > 100) cruces.push({ nivel: 'error', mensaje: `Error de datos: los porcentajes de los clientes suman ${sumaPct.toLocaleString('es-AR')}% (más de 100%).` });
  const sumaMontos = c.clientes.reduce((a, x) => a + (fin(x.monto) ? (x.monto as number) : 0), 0);
  if (!esFinanciera && sumaMontos > ventas && ventas > 0) {
    cruces.push({ nivel: 'alerta', mensaje: `Los montos de los clientes suman ${miles(sumaMontos)}, más que las ventas anuales del balance (${miles(ventas)}).` });
  }
  return { kpis, cruces, hechosIncluidos: [] };
}

export { sumaTop10 } from './tipos';

// ---------- cartera de contratos ----------
function analizarContratos(c: CarteraContratos, ctx: Ctx): Omit<AnalisisDocumento, 'doc' | 'titulo'> {
  const con = c.contratos.filter(x => fin(x.monto));
  const total = con.reduce((a, x) => a + (x.monto as number), 0);
  const conDato = con.filter(x => x.recurrente !== null);
  const recurrente = conDato.filter(x => x.recurrente).reduce((a, x) => a + (x.monto as number), 0);
  const totalConDato = conDato.reduce((a, x) => a + (x.monto as number), 0);
  return {
    kpis: [
      info('contratos_total', 'Monto total de contratos', total || null, 'monto', 'Los contratos no informan montos.'),
      info('contratos_sobre_ventas', 'Contratos / ventas anuales', total ? div(total, ventasAnuales(ctx.extraction)) : null, 'x', 'Los contratos no informan montos.'),
      info('pct_recurrente', 'Contratos recurrentes / total', totalConDato ? recurrente / totalConDato : null, 'pct', 'El documento no dice qué contratos son recurrentes.'),
    ],
    cruces: [],
    hechosIncluidos: [],
  };
}

// ---------- otro ----------
function analizarOtro(o: OtroDocumento): Omit<AnalisisDocumento, 'doc' | 'titulo'> {
  // Solo los hechos que el analista marcó llegan a la opinión.
  const incluidos: HechoIncluido[] = o.hechos.filter(h => h.incluir).map(h => ({
    categoria: h.categoria ?? 'otro',
    descripcion: h.descripcion ?? '',
    monto: h.monto ?? null,
    fecha: h.fecha ?? null,
    cita_textual: h.cita_textual ?? '',
    pagina: h.pagina ?? null,
  }));
  return {
    kpis: [info('hechos', `Hechos extraídos (${incluidos.length} marcados para la opinión)`, o.hechos.length, 'x')],
    cruces: [],
    hechosIncluidos: incluidos,
  };
}

export const tituloDocumento = (doc: Pick<DocumentoSectorial, 'tipo'>, perfil: PerfilEfectivo) => {
  const d = DOCUMENTOS_SECTORIALES[doc.tipo];
  return perfil.modelo === 'financiera' && d.labelFinanciera ? d.labelFinanciera : d.label;
};

export function analizarDocumento(doc: DocumentoSectorial, ctx: Ctx): AnalisisDocumento | null {
  if (doc.estado !== 'ok' || !doc.extraccion) return null;
  const base = { doc, titulo: tituloDocumento(doc, ctx.perfil) };
  switch (doc.tipo) {
    case 'plan_siembra': return { ...base, ...analizarPlan(doc.extraccion as PlanSiembra, ctx) };
    case 'listado_obras': return { ...base, ...analizarObras(doc.extraccion as ListadoObras, ctx) };
    case 'principales_clientes': return { ...base, ...analizarClientes(doc.extraccion as PrincipalesClientes, ctx) };
    case 'cartera_contratos': return { ...base, ...analizarContratos(doc.extraccion as CarteraContratos, ctx) };
    case 'otro': return { ...base, ...analizarOtro(doc.extraccion as OtroDocumento) };
    case 'reporte_mora': return { ...base, kpis: [], cruces: [], hechosIncluidos: [] }; // sus indicadores están en financieras.ts
  }
}

export const analizarDocumentos = (docs: DocumentoSectorial[] | null | undefined, ctx: Ctx) =>
  (docs ?? []).map(d => analizarDocumento(d, ctx)).filter((a): a is AnalisisDocumento => a !== null);

// ---------- señales de documentos ----------
export function senalesDeDocumentos(docs: DocumentoSectorial[] | null | undefined, ctx: Ctx): RiskSignal[] {
  const out: RiskSignal[] = [];
  const S = ctx.perfil.senalesDocumentos;
  for (const a of analizarDocumentos(docs, ctx)) {
    const v = (k: string) => a.kpis.find(x => x.key === k)?.valor ?? null;
    if (a.doc.tipo === 'plan_siembra') {
      const arr = v('pct_arrendado');
      const conc = v('concentracion_cultivo');
      if (arr !== null && conc !== null && arr > S.agro.arrendadoMaximo && conc > S.agro.concentracionCultivoMaxima) {
        out.push({
          id: 'agro_arrendado_concentrado', dimension: 'negocio_mercado', severidad: 'alta', piso: null,
          titulo: 'Campo mayormente arrendado y un solo cultivo',
          detalle: `Plan de siembra (declarado): ${pct(arr)} de las hectáreas no son propias y el cultivo principal es el ${pct(conc)}.`,
        });
      }
    }
    if (a.doc.tipo === 'listado_obras') {
      const l = a.doc.extraccion as ListadoObras;
      const vigentes = l.obras.filter(o => o.estado === 'en_ejecucion' || o.estado === 'adjudicada').map(o => ({ o, p: pendienteDeObra(o) })).filter(x => x.p);
      const mayor = mayorGrupo(vigentes, x => x.o.comitente, x => x.p!.monto);
      const conc = v('concentracion_comitente');
      const esPublico = mayor?.items.some(x => x.o.tipo_comitente === 'publico') ?? false;
      if (conc !== null && conc > S.construccion.concentracionComitenteMaxima && esPublico) {
        out.push({
          id: 'obras_comitente_publico_concentrado', dimension: 'negocio_mercado', severidad: 'alta', piso: null,
          titulo: 'Obra pendiente concentrada en un comitente público',
          detalle: `Listado de obras (declarado): ${mayor!.nombre} concentra el ${pct(conc)} de la obra pendiente.`,
        });
      }
    }
  }
  return out;
}

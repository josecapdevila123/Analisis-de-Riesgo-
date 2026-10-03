import jsPDF from 'jspdf';
import autoTable, { UserOptions } from 'jspdf-autotable';
import { getComparativeTablesData, getVariationText } from '../../components/ComparativeView';
import { ExtractionResult, Shareholder } from '../../types';
import { formatCurrencyThousands } from '../../lib/utils';
import { RatioKey, RatioStatus } from '../ratios/calculations';
import { CATEGORY_LABEL, DIMENSIONS, RiskCategory, SEVERIDAD_LABEL, categoryOf } from '../risk/score';
import { RiskDimension, SeveridadRiesgo } from '../extraction/schemas';
import { stripRiskConclusion } from '../risk/summary';
import { RATIO_ASSUMPTIONS } from '../risk/policy';
import { RATIO_BLOCKS as SHARED_RATIO_BLOCKS, RatioKind as SharedRatioKind } from '../ratios/blocks';
import { RATIO_THRESHOLDS, PROJECTION_PARAMS } from '../risk/policy';
import { resolverProyeccion } from '../projections/defaults';
import { faltantes, margenDeudaNueva, proyectar, puntoDeQuiebre } from '../projections/model';
import { ESCENARIOS, ESCENARIO_LABEL, proyeccionesVacias } from '../projections/types';
import { etiquetaPeriodo, mesesDeSerie, serieTotal, seriePorEntidad, variacion, variacionTotalPeriodo } from '../nosis/evolucion';
import { armarArbol, NodoAccionista } from '../accionistas/estructura';
import { hayUnidades, serieUnidades, totalesUnidades } from '../postBalance/unidades';

// ============================================================================
// Informe de riesgo para comité (jsPDF). Orden: portada con el dictamen →
// opinión de riesgos → resumen ejecutivo → historia → estados y ratios →
// Nosis → post balance → accionistas → anexo de mercado.
// Mismo lenguaje visual que la app: paleta de estados siempre con etiqueta,
// tablas con cabecera oscura y secciones numeradas.
// ============================================================================

type RGB = [number, number, number];

// Manual de marca BiBank: negro y verde institucional; Inter para texto y
// Poppins para títulos (se incrustan al generar; si fallan, Helvetica).
const INK: RGB = [0, 0, 0];
const MUTED: RGB = [102, 102, 102];
const RULE: RGB = [224, 224, 224];
const SOFT: RGB = [244, 244, 244];
const ZEBRA: RGB = [250, 250, 250];
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [53, 238, 200]; // verde institucional #35EEC8 (identidad, no estado)

// Paleta de estados (igual que la app).
const STATUS_RGB = {
  good: [12, 163, 12] as RGB,
  warning: [250, 178, 25] as RGB,
  serious: [236, 131, 90] as RGB,
  critical: [208, 59, 59] as RGB,
};
const CATEGORY_RGB: Record<RiskCategory, RGB> = {
  bajo: STATUS_RGB.good, moderado: STATUS_RGB.warning, alto: STATUS_RGB.serious, critico: STATUS_RGB.critical,
};
const SEVERIDAD_RGB: Record<SeveridadRiesgo, RGB> = {
  baja: STATUS_RGB.good, media: STATUS_RGB.warning, alta: STATUS_RGB.serious, critica: STATUS_RGB.critical,
};
const RATIO_STATUS_RGB: Record<RatioStatus, RGB> = {
  healthy: STATUS_RGB.good, alert: STATUS_RGB.warning, critical: STATUS_RGB.critical,
};
const RATIO_STATUS_LABEL: Record<RatioStatus, string> = { healthy: 'Sano', alert: 'Alerta', critical: 'Crítico' };

// Tinte claro para fondos: el texto siempre queda en tinta.
const tint = ([r, g, b]: RGB, alpha = 0.3): RGB => [r, g, b].map(c => Math.round(255 - (255 - c) * alpha)) as RGB;

const situacionRGB = (s: number | null | undefined): RGB | null => {
  // La escala del BCRA va de 1 a 6; otro valor es un error de lectura: sin color.
  if (s === null || s === undefined || !Number.isInteger(s) || s < 1 || s > 6) return null;
  if (s <= 1) return STATUS_RGB.good;
  if (s === 2) return STATUS_RGB.warning;
  if (s === 3) return STATUS_RGB.serious;
  return STATUS_RGB.critical;
};

const POSTURA_LABEL = {
  favorable: 'Favorable',
  favorable_con_condiciones: 'Favorable con condiciones',
  desfavorable: 'Desfavorable',
} as const;
const POSTURA_RGB = {
  favorable: STATUS_RGB.good,
  favorable_con_condiciones: STATUS_RGB.warning,
  desfavorable: STATUS_RGB.critical,
} as const;

// Helvetica de jsPDF solo imprime Latin-1 / WinAnsi: se reemplazan los símbolos
// que el modelo suele usar y se descarta el resto (si no, salen en blanco).
const pdfSafe = (s: string | number | null | undefined): string =>
  String(s ?? '')
    .replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/[→⇒]/g, '->').replace(/[←]/g, '<-').replace(/↳/g, '')
    .replace(/≈/g, '~').replace(/[•●▪]/g, '-')
    .replace(/\u2212/g, '-').replace(/Δ\s?/g, 'Var. ')
    .replace(/[‐-‒]/g, '-')
    .replace(/[^\u0000-ÿ–—‘’“”…€]/g, '');

const stripMarkdown = (s: string) => s.replace(/\*\*|__/g, '').replace(/[*_`]/g, '').replace(/^#+\s*/gm, '');

// ---------- Formatos ----------

const fmtNum = (v: number, dec = 2) => v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const money = (v: number | null | undefined, currency = 'ARS') =>
  v === null || v === undefined ? '-' : formatCurrencyThousands(v, currency);

type RatioKind = SharedRatioKind;
const fmtRatio = (v: number | null | undefined, kind: RatioKind): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  if (kind === 'pct') return `${fmtNum(v * 100, 1)}%`;
  if (kind === 'x') return `${fmtNum(v, 2)}x`;
  if (kind === 'dias') return `${fmtNum(v, 0)} días`;
  return money(v);
};
// En ratios porcentuales la variación va en puntos porcentuales (no relativa).
const fmtRatioVariation = (actual: number | null, anterior: number | null, variacionPct: number | null, kind: RatioKind) => {
  if (kind === 'pct') {
    if (actual === null || anterior === null) return '-';
    const pp = (actual - anterior) * 100;
    return `${pp > 0 ? '+' : ''}${fmtNum(pp, 1)} p.p.`;
  }
  if (variacionPct === null) return '-';
  return `${variacionPct > 0 ? '+' : ''}${fmtNum(variacionPct, 1)}%`;
};

// Bloques compartidos con la app (src/features/ratios/blocks.ts).
const RATIO_BLOCKS = SHARED_RATIO_BLOCKS;

// ---------- Página ----------

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;            // margen lateral
const CW = PAGE_W - 2 * M; // ancho de contenido
const TOP = 24;          // primera línea útil (debajo del encabezado)
const BOTTOM = 280;      // última línea útil (arriba del pie)

export const generatePDF = async (activeResult: ExtractionResult | null | undefined) => {
  if (!activeResult || !activeResult.extraction || !activeResult.ratios) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Tipografías de marca (módulo dinámico: solo se descarga al generar el PDF).
  let BODY = 'helvetica';
  let DISPLAY = 'helvetica';
  try {
    const { registerBrandFonts } = await import('./pdfFonts');
    registerBrandFonts(doc);
    BODY = 'Inter';
    DISPLAY = 'Poppins';
  } catch (err) {
    console.warn('No se pudieron cargar las tipografías de marca; se usa Helvetica.', err);
  }
  const extraction = activeResult.extraction;
  const ratios = activeResult.ratios;
  const company = extraction.company_profile;
  const risk = activeResult.riskAssessment ?? null;
  const fechaGeneracion = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

  let y = TOP;
  const sections: Array<{ title: string; page: number }> = [];

  // ---------- Primitivas ----------

  type Weight = 'normal' | 'semibold' | 'bold' | 'italic';
  // Helvetica no tiene semibold: en el respaldo se usa bold.
  const fontStyle = (family: string, w: Weight) => (family === 'helvetica' && w === 'semibold' ? 'bold' : w);
  const setText = (size: number, style: Weight = 'normal', color: RGB = INK) => {
    doc.setFont(BODY, fontStyle(BODY, style));
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const setDisplay = (size: number, style: 'semibold' | 'bold' = 'bold', color: RGB = INK) => {
    doc.setFont(DISPLAY, fontStyle(DISPLAY, style));
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const PT_PER_MM = 1 / 0.3528;

  // Logo según el manual: anillo abierto con el punto verde en el corte, "Bi"
  // adentro y "Bank" al lado. bg = color de fondo (para abrir el anillo).
  const drawLogo = (x: number, yTop: number, h: number, color: RGB, bg: RGB, withWordmark = true) => {
    const r = h * 0.4;
    const cx = x + h / 2;
    const cy = yTop + h / 2;
    doc.setDrawColor(...color);
    doc.setLineWidth(h * 0.085);
    doc.circle(cx, cy, r, 'S');
    const a = (50 * Math.PI) / 180;
    const dx = cx + r * Math.cos(a);
    const dy = cy - r * Math.sin(a);
    doc.setFillColor(...bg);
    doc.circle(dx, dy, h * 0.135, 'F');
    doc.setFillColor(...GREEN);
    doc.circle(dx, dy, h * 0.075, 'F');
    setDisplay(h * 0.44 * PT_PER_MM, 'bold', color);
    doc.text('Bi', cx - h * 0.01, yTop + h * 0.65, { align: 'center' });
    if (withWordmark) {
      setDisplay(h * 0.56 * PT_PER_MM, 'semibold', color);
      doc.text('Bank', x + h * 1.04, yTop + h * 0.69);
    }
  };
  const text = (s: string | number, x: number, yy: number, opts?: Parameters<jsPDF['text']>[3]) =>
    doc.text(pdfSafe(s), x, yy, opts);
  const lastY = () => (doc as any).lastAutoTable.finalY as number;
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage(); };

  const baseTable: Partial<UserOptions> = {
    theme: 'plain',
    rowPageBreak: 'avoid',
    margin: { left: M, right: M, top: TOP, bottom: PAGE_H - BOTTOM },
    headStyles: { fillColor: INK, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
    styles: { font: BODY, fontSize: 8, textColor: INK, cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 }, lineColor: RULE, lineWidth: { bottom: 0.2 } },
    alternateRowStyles: { fillColor: ZEBRA },
  };
  const table = (opts: UserOptions) => {
    autoTable(doc, {
      ...baseTable,
      ...opts,
      head: opts.head?.map(r => (r as unknown[]).map(c => (typeof c === 'string' ? pdfSafe(c) : c))) as UserOptions['head'],
      body: opts.body?.map(r => (r as unknown[]).map(c => (typeof c === 'string' ? pdfSafe(c) : c))) as UserOptions['body'],
      styles: { ...baseTable.styles, ...opts.styles },
      headStyles: { ...baseTable.headStyles, ...opts.headStyles },
      // La cabecera toma la alineación de su columna (números a la derecha).
      didParseCell: data => {
        if (data.section === 'head' || data.section === 'foot') {
          const col = (opts.columnStyles as Record<number, { halign?: 'left' | 'center' | 'right' }> | undefined)?.[data.column.index];
          if (col?.halign) data.cell.styles.halign = col.halign;
        }
        opts.didParseCell?.(data);
      },
    });
    y = lastY() + 6;
  };

  const sectionTitle = (title: string) => {
    newPage();
    sections.push({ title, page: doc.getNumberOfPages() });
    const n = sections.length;
    doc.setFillColor(...INK);
    doc.rect(M, y - 5.5, 8, 8, 'F');
    setText(10, 'bold', WHITE);
    text(String(n), M + 4, y + 0.2, { align: 'center' });
    setDisplay(14, 'bold');
    text(title, M + 11.5, y + 0.8);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(M, y + 5, M + CW, y + 5);
    doc.setFillColor(...GREEN);
    doc.rect(M, y + 4.4, 28, 1.3, 'F');
    y += 13;
  };

  // Reserva lugar para el subtítulo + cabecera + al menos una fila, así no
  // quedan títulos o cabeceras de tabla huérfanos al pie de la página.
  const subheading = (title: string) => {
    if (y > TOP + 2) y += 2.5;
    ensure(28);
    setText(8.5, 'bold', MUTED);
    text(title.toUpperCase(), M, y);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.line(M, y + 1.8, M + CW, y + 1.8);
    y += 6;
  };

  const paragraph = (s: string, size = 9.5, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    const clean = pdfSafe(stripMarkdown(s)).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (!clean) return;
    autoTable(doc, {
      startY: y,
      body: [[clean]],
      theme: 'plain',
      margin: { left: M, right: M, top: TOP, bottom: PAGE_H - BOTTOM },
      // Alineado a la izquierda: con 'justify', autoTable y jsPDF miden distinto y a veces una palabra queda sola en un renglón.
      styles: { font: BODY, fontStyle: style, fontSize: size, textColor: INK, halign: 'left', cellPadding: 0, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: CW } },
    });
    y = lastY() + 4;
  };

  // Párrafos separados por línea en blanco; los saltos simples (\n o \r\n) se unen.
  const paragraphs = (s: string, size = 9.5) =>
    s.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ')).forEach(p => paragraph(p, size));

  // Viñetas con un cuadradito de color (ícono) + texto en tinta.
  const bullets = (items: string[], color: RGB = INK) => {
    if (items.length === 0) return;
    autoTable(doc, {
      startY: y,
      body: items.map(i => ['', pdfSafe(stripMarkdown(i))]),
      theme: 'plain',
      margin: { left: M, right: M, top: TOP, bottom: PAGE_H - BOTTOM },
      styles: { font: BODY, fontSize: 9, textColor: INK, cellPadding: { top: 1, bottom: 1, left: 0, right: 0 }, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 5 }, 1: { cellWidth: CW - 5, halign: 'left' } },
      didDrawCell: data => {
        if (data.section === 'body' && data.column.index === 0) {
          doc.setFillColor(...color);
          doc.rect(data.cell.x + 0.6, data.cell.y + 2.1, 1.8, 1.8, 'F');
        }
      },
    });
    y = lastY() + 4;
  };

  // Etiqueta de estado: fondo teñido + texto en tinta.
  const chip = (label: string, color: RGB, x: number, yy: number, size = 7.5) => {
    setText(size, 'bold');
    const w = doc.getTextWidth(pdfSafe(label)) + 6;
    doc.setFillColor(...tint(color, 0.28));
    doc.roundedRect(x, yy - 3.6, w, 5.2, 1, 1, 'F');
    doc.setFillColor(...color);
    doc.rect(x + 1.5, yy - 1.9, 1.6, 1.6, 'F');
    text(label, x + 4.2, yy);
    return w;
  };

  // Mosaico de cifras clave.
  type Tile = { label: string; value: string; sub?: string; subColor?: RGB; accent?: RGB };
  // compact: versión más baja para que el resumen ejecutivo entre en una carilla.
  const tiles = (items: Tile[], perRow = items.length, compact = false) => {
    const gap = 3;
    const w = (CW - gap * (perRow - 1)) / perRow;
    const h = compact ? 15.5 : 19;
    const off = compact ? { label: 4.3, value: 9.6, subBox: 11.6, sub: 13.2 } : { label: 5, value: 11.5, subBox: 14.3, sub: 15.9 };
    for (let i = 0; i < items.length; i += perRow) {
      ensure(h + 4);
      items.slice(i, i + perRow).forEach((t, j) => {
        const x = M + j * (w + gap);
        doc.setFillColor(...WHITE);
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.3);
        doc.rect(x, y, w, h, 'FD');
        if (t.accent) {
          doc.setFillColor(...t.accent);
          doc.rect(x, y, 1.4, h, 'F');
        }
        setText(6.5, 'bold', MUTED);
        text(t.label.toUpperCase(), x + 3.5, y + off.label);
        setText(compact ? 10.5 : 11.5, 'bold');
        const value = doc.splitTextToSize(pdfSafe(t.value), w - 6)[0];
        text(value, x + 3.5, y + off.value);
        if (t.sub) {
          if (t.subColor) {
            doc.setFillColor(...t.subColor);
            doc.rect(x + 3.5, y + off.subBox, 1.6, 1.6, 'F');
          }
          setText(7, 'normal', MUTED);
          text(t.sub, x + (t.subColor ? 6.2 : 3.5), y + off.sub);
        }
      });
      y += h + (compact ? 3 : 4);
    }
  };

  // Barra de escala 1–100 con las 4 bandas y marcador.
  const scaleBar = (score: number, x: number, yy: number, w: number) => {
    const h = 4.5;
    ([[0, 25, 'bajo'], [25, 50, 'moderado'], [50, 75, 'alto'], [75, 100, 'critico']] as Array<[number, number, RiskCategory]>)
      .forEach(([from, to, cat]) => {
        const active = categoryOf(score) === cat;
        doc.setFillColor(...(active ? CATEGORY_RGB[cat] : tint(CATEGORY_RGB[cat], 0.35)));
        doc.rect(x + (from / 100) * w + (from ? 0.4 : 0), yy, ((to - from) / 100) * w - (to < 100 ? 0.8 : 0.4), h, 'F');
      });
    const mx = x + (score / 100) * w;
    doc.setFillColor(...INK);
    doc.triangle(mx - 2, yy - 2.8, mx + 2, yy - 2.8, mx, yy + 0.2, 'F');
    setText(6.5, 'normal', MUTED);
    [0, 25, 50, 75, 100].forEach(v => text(String(v), x + (v / 100) * w, yy + h + 3.5, { align: 'center' }));
  };

  // ======================================================================
  // PORTADA
  // ======================================================================

  doc.setFillColor(...INK);
  doc.rect(0, 0, PAGE_W, 48, 'F');
  drawLogo(M, 9, 12, WHITE, INK);
  setText(7.5, 'semibold', [190, 190, 190]);
  text('BANCA EMPRESAS · ANÁLISIS DE RIESGO CREDITICIO', PAGE_W - M, 16.5, { align: 'right' });
  setDisplay(19, 'bold', WHITE);
  text('Informe para comité de crédito', M, 38);
  setText(8, 'normal', [190, 190, 190]);
  text(`Generado el ${fechaGeneracion}`, PAGE_W - M, 38, { align: 'right' });
  doc.setFillColor(...GREEN);
  doc.rect(0, 48, PAGE_W, 1.4, 'F');

  y = 62;
  setDisplay(17, 'semibold');
  doc.splitTextToSize(pdfSafe(company.name || 'Empresa no identificada'), CW).slice(0, 2).forEach((line: string) => {
    text(line, M, y);
    y += 7.5;
  });
  setText(9, 'normal', MUTED);
  text(`CUIT ${company.cuit || 'N/D'}  ·  Ejercicio ${company.anio_actual || 'N/D'}${company.anio_anterior ? ` (comparativo ${company.anio_anterior})` : ''}`, M, y);
  y += 5;
  doc.splitTextToSize(pdfSafe(company.activity || ''), CW).slice(0, 2).forEach((line: string) => {
    text(line, M, y);
    y += 4.5;
  });
  setText(7.5, 'italic', MUTED);
  text('Valores expresados en miles de pesos.', M, y + 1);
  y += 9;

  if (risk) {
    const { opinion, puntaje, pce_proxy } = risk;
    const color = CATEGORY_RGB[puntaje.categoria];
    const boxH = 58;
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.rect(M, y, CW, boxH, 'FD');
    doc.setFillColor(...color);
    doc.rect(M, y, 2.2, boxH, 'F');

    setText(7.5, 'bold', MUTED);
    text('OPINIÓN DE RIESGOS', M + 7, y + 8);
    setDisplay(40, 'bold');
    text(String(puntaje.final), M + 7, y + 25);
    const sw = doc.getTextWidth(String(puntaje.final));
    setText(10, 'normal', MUTED);
    text('/ 100', M + 9 + sw, y + 25);
    chip(CATEGORY_LABEL[puntaje.categoria], color, M + 7, y + 33, 8);
    scaleBar(puntaje.final, M + 7, y + 41, 62);

    // Columna derecha: postura, pérdida esperada y conteo de riesgos.
    const rx = M + 82;
    setText(7.5, 'bold', MUTED);
    text('POSTURA', rx, y + 8);
    if (opinion.postura) chip(POSTURA_LABEL[opinion.postura], POSTURA_RGB[opinion.postura], rx, y + 14, 8);
    else { setText(9, 'normal', MUTED); text('Sin postura', rx, y + 14); }
    setText(7.5, 'bold', MUTED);
    text('PÉRDIDA ESPERADA (PROXY SCORE NOSIS)', rx, y + 23);
    setText(11, 'bold');
    text(pce_proxy === null ? 'Sin score' : `${pce_proxy} / 100`, rx, y + 29);
    setText(7.5, 'bold', MUTED);
    text('RIESGOS DETECTADOS', rx, y + 38);
    let cx = rx;
    (['critica', 'alta', 'media', 'baja'] as SeveridadRiesgo[]).forEach(sev => {
      const n = opinion.riesgos.filter(r => r.severidad === sev).length;
      if (n > 0) cx += chip(`${n} ${SEVERIDAD_LABEL[sev]}${n > 1 ? 's' : ''}`, SEVERIDAD_RGB[sev], cx, y + 44) + 2;
    });
    if (puntaje.piso && puntaje.ponderado !== null && puntaje.piso.piso > puntaje.ponderado) {
      setText(6.8, 'italic', MUTED);
      doc.splitTextToSize(pdfSafe(`Promedio de dimensiones ${puntaje.ponderado}; elevado a ${puntaje.final} por regla: ${puntaje.piso.motivo}.`), CW - 82 - 6)
        .slice(0, 2).forEach((line: string, i: number) => text(line, rx, y + 51 + i * 3.3));
    }
    y += boxH + 8;

    setText(8.5, 'bold', MUTED);
    text('DICTAMEN', M, y);
    y += 4;
    paragraph(opinion.dictamen, 10.5, 'bold');
  } else {
    doc.setFillColor(...SOFT);
    doc.rect(M, y, CW, 16, 'F');
    setText(9.5, 'italic', MUTED);
    text('Este caso todavía no tiene opinión de riesgos: generala desde la pestaña Opinión de riesgos.', M + 5, y + 9.5);
    y += 24;
  }
  const tocY = Math.max(y + 6, 200);

  const esp = extraction.ejercicio_actual.estado_situacion_patrimonial;
  const er = extraction.ejercicio_actual.estado_resultados;
  const espAnt = extraction.ejercicio_anterior?.estado_situacion_patrimonial;
  const erAnt = extraction.ejercicio_anterior?.estado_resultados;
  const varSub = (actual: number | null | undefined, anterior: number | null | undefined): Pick<Tile, 'sub' | 'subColor'> => {
    const t = getVariationText(actual ?? null, anterior ?? null);
    if (t === '-') return {};
    return { sub: `${t} interanual`, subColor: t.startsWith('-') ? STATUS_RGB.critical : STATUS_RGB.good };
  };

  // ======================================================================
  // RESUMEN EJECUTIVO: una carilla con lo más importante del análisis
  // ======================================================================

  sectionTitle('Resumen ejecutivo');
  {
    const history = activeResult.companyHistory;
    subheading('Qué hace la empresa');
    const core = history?.core_business || company.activity || 'Sin descripción de la actividad.';
    setText(9);
    const coreLines = doc.splitTextToSize(pdfSafe(stripMarkdown(core)), CW) as string[];
    paragraph(coreLines.length > 4 ? `${coreLines.slice(0, 4).join(' ').replace(/\s+\S*$/, '')}…` : core, 9);

    subheading('Cifras clave (miles de $)');
    const meses = (extraction.analisis_post_cierre?.detalle_ventas_mensuales ?? []).filter(v => v.monto_anio_anterior);
    const postAct = meses.reduce((a, v) => a + v.monto, 0);
    const postAnt = meses.reduce((a, v) => a + (v.monto_anio_anterior ?? 0), 0);
    const ventasPost = extraction.analisis_post_cierre?.total_ventas_post_cierre ?? null;
    tiles([
      { label: 'Ventas netas', value: money(er.ventas_netas), ...varSub(er.ventas_netas, erAnt?.ventas_netas) },
      { label: 'EBITDA', value: money(ratios.ebitda.actual), sub: `Margen ${fmtRatio(ratios.margen_ebitda.actual, 'pct')}` },
      { label: 'Resultado neto', value: money(er.resultado_neto), sub: `Margen ${fmtRatio(ratios.margen_neto.actual, 'pct')}` },
    ], 3, true);
    const deudaVar = ratios.deuda_bancaria_total.variacion_pct;
    tiles([
      {
        label: 'Deuda bancaria', value: money(ratios.deuda_bancaria_total.actual),
        ...(deudaVar === null ? {} : { sub: `${deudaVar > 0 ? '+' : ''}${fmtNum(deudaVar, 1)}% interanual`, subColor: deudaVar > 0 ? STATUS_RGB.critical : STATUS_RGB.good }),
      },
      { label: 'Patrimonio neto', value: money(esp.patrimonio_neto), ...varSub(esp.patrimonio_neto, espAnt?.patrimonio_neto) },
      {
        label: 'Ventas post balance', value: ventasPost ? money(ventasPost) : '-',
        ...(postAnt > 0 ? varSub(postAct, postAnt) : { sub: ventasPost ? 'Sin comparativo' : 'Sin información' }),
      },
    ], 3, true);

    subheading('Indicadores clave');
    const claves: Array<{ key: RatioKey; label: string; kind: RatioKind }> = [
      { key: 'dscr', label: 'DSCR', kind: 'x' },
      { key: 'deuda_neta_ebitda', label: 'Deuda neta / EBITDA', kind: 'x' },
      { key: 'cobertura_intereses', label: 'Cobertura intereses', kind: 'x' },
      { key: 'calidad_ganancia', label: 'Calidad ganancia', kind: 'pct' },
      { key: 'liquidez_corriente', label: 'Liquidez corriente', kind: 'x' },
      { key: 'liquidez_acida', label: 'Prueba ácida', kind: 'x' },
      { key: 'solvencia', label: 'Solvencia', kind: 'x' },
      { key: 'roe', label: 'ROE', kind: 'pct' },
    ];
    tiles(claves.map(({ key, label, kind }) => {
      const r = ratios[key];
      const st = r?.status ?? null;
      return {
        label,
        value: fmtRatio(r?.actual ?? null, kind),
        sub: `Ant. ${fmtRatio(r?.anterior ?? null, kind)}${st ? ` · ${RATIO_STATUS_LABEL[st]}` : ''}`,
        accent: st ? RATIO_STATUS_RGB[st] : undefined,
      };
    }), 4, true);

    const nosisR = extraction.extraccion_nosis;
    if (nosisR) {
      subheading('Sistema financiero');
      const cc = activeResult.crossCheck;
      tiles([
        { label: 'Score Nosis', value: nosisR.score_crediticio === null ? '-' : String(nosisR.score_crediticio), sub: risk?.pce_proxy != null ? `Pérdida esperada ${risk.pce_proxy}/100` : undefined },
        {
          label: 'Situación BCRA', value: `Hoy ${nosisR.situacion_bcra_peor_estado ?? '-'}`,
          sub: nosisR.peor_situacion_24_meses != null ? `Peor en 24 meses: ${nosisR.peor_situacion_24_meses}` : undefined,
          accent: situacionRGB(Math.max(nosisR.situacion_bcra_peor_estado ?? 1, nosisR.peor_situacion_24_meses ?? 1)) ?? undefined,
        },
        { label: 'Cheques rechazados', value: String(nosisR.cheques_rechazados_cantidad ?? 0), accent: (nosisR.cheques_rechazados_cantidad ?? 0) > 0 ? STATUS_RGB.serious : undefined },
        {
          label: 'Deuda balance vs Nosis', value: cc?.nosis_debt != null ? (cc.match ? 'Consistente' : 'Discrepancia') : 'Sin dato',
          sub: cc?.nosis_debt != null ? `${money(cc.balance_debt)} vs ${money(cc.nosis_debt)}` : undefined,
          accent: cc?.nosis_debt != null ? (cc.match ? STATUS_RGB.good : STATUS_RGB.critical) : undefined,
        },
      ], 4, true);
    }

    if (risk) {
      const top = risk.opinion.riesgos.slice(0, 4);
      if (top.length > 0) {
        subheading('Principales riesgos');
        table({
          startY: y,
          body: top.map(r => [SEVERIDAD_LABEL[r.severidad], r.titulo]),
          columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold' }, 1: { cellWidth: CW - 20 } },
          didParseCell: data => {
            if (data.section === 'body' && data.column.index === 0) {
              const sev = top[data.row.index]?.severidad;
              if (sev) data.cell.styles.fillColor = tint(SEVERIDAD_RGB[sev], 0.35);
            }
          },
        });
      }
      if (risk.opinion.condiciones_sugeridas.length > 0) {
        subheading('Condiciones sugeridas');
        bullets(risk.opinion.condiciones_sugeridas.slice(0, 3));
      }
    }
  }

  // ======================================================================
  // 1. OPINIÓN DE RIESGOS
  // ======================================================================

  if (risk) {
    const { opinion, senales } = risk;
    sectionTitle('Opinión de riesgos');

    subheading('Riesgo por dimensión (1 = mínimo, 100 = máximo)');
    (Object.keys(DIMENSIONS) as RiskDimension[]).forEach(dim => {
      const d = opinion.dimensiones.find(x => x.dimension === dim);
      const p = d?.puntaje ?? null;
      setText(7.5); // el corte de líneas depende del tamaño de fuente activo
      const comment = d?.comentario ? doc.splitTextToSize(pdfSafe(d.comentario), CW - 4) as string[] : [];
      ensure(11 + comment.length * 3.6);
      setText(8.5, 'bold');
      text(DIMENSIONS[dim].label, M, y);
      setText(7, 'normal', MUTED);
      text(`peso ${DIMENSIONS[dim].weight}%`, M + 58, y);
      const bx = M + 76, bw = 90;
      doc.setFillColor(...SOFT);
      doc.rect(bx, y - 2.8, bw, 3.4, 'F');
      if (p !== null) {
        doc.setFillColor(...CATEGORY_RGB[categoryOf(p)]);
        doc.rect(bx, y - 2.8, (p / 100) * bw, 3.4, 'F');
      }
      [25, 50, 75].forEach(t => { doc.setFillColor(...WHITE); doc.rect(bx + (t / 100) * bw - 0.2, y - 2.8, 0.4, 3.4, 'F'); });
      setText(9, 'bold');
      text(p === null ? 'S/D' : String(p), M + CW, y, { align: 'right' });
      y += 4;
      setText(7.5, 'normal', MUTED);
      comment.forEach(line => { text(line, M, y); y += 3.6; });
      y += 2.5;
    });
    y += 2;

    if (opinion.riesgos.length > 0) {
      subheading('Riesgos detectados');
      table({
        startY: y,
        head: [['Severidad', 'Riesgo', 'Evidencia y mitigante']],
        body: opinion.riesgos.map(r => [
          SEVERIDAD_LABEL[r.severidad],
          r.titulo,
          r.mitigante ? `${r.evidencia}\nMitigante: ${r.mitigante}` : r.evidencia,
        ]),
        columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold' }, 1: { cellWidth: 48, fontStyle: 'bold' }, 2: { cellWidth: CW - 68 } },
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 0) {
            const sev = opinion.riesgos[data.row.index]?.severidad;
            if (sev) data.cell.styles.fillColor = tint(SEVERIDAD_RGB[sev], 0.35);
          }
        },
      });
    }

    subheading('Lectura integral');
    paragraphs(opinion.lectura_integral);

    if (opinion.condiciones_sugeridas.length > 0) {
      subheading('Condiciones sugeridas');
      bullets(opinion.condiciones_sugeridas, INK);
    }
    if (opinion.fortalezas.length > 0) {
      subheading('Fortalezas');
      bullets(opinion.fortalezas, STATUS_RGB.good);
    }
    if (opinion.informacion_faltante.length > 0) {
      subheading('Información faltante para decidir');
      bullets(opinion.informacion_faltante, MUTED);
    }
    if (senales.length > 0) {
      subheading('Señales automáticas (reglas fijas de la política de riesgos)');
      table({
        startY: y,
        head: [['Severidad', 'Señal', 'Piso']],
        body: senales.map(s => [SEVERIDAD_LABEL[s.severidad], `${s.titulo}: ${s.detalle}`, s.piso !== null ? String(s.piso) : '-']),
        columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold' }, 1: { cellWidth: CW - 34 }, 2: { cellWidth: 14, halign: 'center' } },
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 0) {
            const sev = senales[data.row.index]?.severidad;
            if (sev) data.cell.styles.fillColor = tint(SEVERIDAD_RGB[sev], 0.35);
          }
        },
      });
    }
  }

  // ======================================================================
  // 2. RESUMEN EJECUTIVO
  // ======================================================================

  const verification = activeResult.verification;
  sectionTitle('Síntesis del análisis');
  if (verification?.executive_summary) {
    paragraphs(stripRiskConclusion(verification.executive_summary));
    if (verification.alertas_coherencia.length > 0) {
      subheading('Alertas de coherencia');
      table({
        startY: y,
        head: [['Tipo', 'Campo', 'Observación']],
        body: verification.alertas_coherencia.map(a => [a.severidad === 'error' ? 'Error' : 'Advertencia', a.campo, a.mensaje]),
        columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' }, 1: { cellWidth: 40 }, 2: { cellWidth: CW - 62 } },
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 0) {
            const sev = verification.alertas_coherencia[data.row.index]?.severidad;
            data.cell.styles.fillColor = tint(sev === 'error' ? STATUS_RGB.critical : STATUS_RGB.warning, 0.35);
          }
        },
      });
    }
  } else {
    paragraph('El resumen ejecutivo no se pudo generar para este caso.', 9.5, 'italic');
  }

  // ======================================================================
  // 3. HISTORIA Y ACTIVIDAD
  // ======================================================================

  const history = activeResult.companyHistory;
  sectionTitle('Historia y actividad de la empresa');
  if (history) {
    if (!history.memoria_disponible) {
      paragraph('No se encontró la Memoria del Directorio: la descripción surge de las Notas a los estados contables.', 8.5, 'italic');
    }
    // Core business destacado: bloque oscuro como en la app.
    setText(9.5); // el corte de líneas depende del tamaño de fuente activo
    const coreLines = doc.splitTextToSize(pdfSafe(stripMarkdown(history.core_business || 'Sin información sobre la actividad.')), CW - 12) as string[];
    const coreH = 12 + coreLines.length * 4.6;
    ensure(coreH + 4);
    doc.setFillColor(...INK);
    doc.rect(M, y, CW, coreH, 'F');
    setText(7.5, 'bold', GREEN);
    text('CORE BUSINESS', M + 6, y + 7);
    setText(9.5, 'normal', WHITE);
    coreLines.forEach((line, i) => text(line, M + 6, y + 13 + i * 4.6));
    y += coreH + 7;

    if (history.historia) { subheading('Historia'); paragraphs(history.historia); }
    if (history.datos_relevantes.length > 0) { subheading('Datos relevantes'); bullets(history.datos_relevantes); }
    if (history.proyecciones.length > 0) { subheading('Proyecciones de la empresa'); bullets(history.proyecciones); }
    if (history.explicaciones_balance.length > 0) {
      subheading('Explicaciones del Directorio sobre el balance');
      table({
        startY: y,
        head: [['Tema', 'Explicación']],
        body: history.explicaciones_balance.map(e => [e.tema, e.explicacion]),
        columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' }, 1: { cellWidth: CW - 48 } },
      });
    }
  } else {
    paragraph('Historia y actividad no disponible para este caso.', 9.5, 'italic');
  }

  // ======================================================================
  // 4. ESTADOS CONTABLES Y RATIOS
  // ======================================================================

  sectionTitle('Estados contables y ratios');
  tiles([
    { label: 'Ventas netas', value: money(er.ventas_netas), ...varSub(er.ventas_netas, erAnt?.ventas_netas) },
    { label: 'EBITDA', value: money(ratios.ebitda.actual), ...varSub(ratios.ebitda.actual, ratios.ebitda.anterior) },
    { label: 'Resultado neto', value: money(er.resultado_neto), ...varSub(er.resultado_neto, erAnt?.resultado_neto) },
  ]);
  tiles([
    { label: 'Deuda bancaria', value: money(ratios.deuda_bancaria_total.actual), ...varSub(ratios.deuda_bancaria_total.actual, ratios.deuda_bancaria_total.anterior) },
    { label: 'Patrimonio neto', value: money(esp.patrimonio_neto), ...varSub(esp.patrimonio_neto, espAnt?.patrimonio_neto) },
    { label: 'Total activo', value: money(esp.total_activo), ...varSub(esp.total_activo, espAnt?.total_activo) },
  ]);

  const anioAct = company.anio_actual || 'Actual';
  const anioAnt = company.anio_anterior || 'Anterior';
  const { situacionPatrimonial, estadoResultados } = getComparativeTablesData(extraction, ratios);
  const comparativeTable = (title: string, rows: typeof situacionPatrimonial) => {
    subheading(title);
    const num = (v: number | string | null) => (typeof v === 'number' ? fmtNum(v, 0) : v ?? '-');
    table({
      startY: y,
      head: [['Concepto', anioAnt, anioAct, 'Var. %']],
      body: rows.map(r => [r.concepto, num(r.anio_anterior), num(r.anio_actual), getVariationText(r.anio_actual, r.anio_anterior)]),
      columnStyles: { 0: { cellWidth: 74 }, 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' }, 3: { halign: 'right' } },
    });
  };
  comparativeTable('Estado de situación patrimonial (miles de $)', situacionPatrimonial);
  comparativeTable('Estado de resultados (miles de $)', estadoResultados);

  if (activeResult.inconsistencias.length > 0) {
    subheading('Controles de consistencia del balance');
    table({
      startY: y,
      head: [['Tipo', 'Campo', 'Observación']],
      body: activeResult.inconsistencias.map(i => [i.severidad === 'error' ? 'Error' : 'Advertencia', i.campo, i.mensaje]),
      columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' }, 1: { cellWidth: 55 }, 2: { cellWidth: CW - 77 } },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 0) {
          const sev = activeResult.inconsistencias[data.row.index]?.severidad;
          data.cell.styles.fillColor = tint(sev === 'error' ? STATUS_RGB.critical : STATUS_RGB.warning, 0.35);
        }
      },
    });
  }

  RATIO_BLOCKS.forEach(block => {
    const rows = block.ratios.filter(spec => ratios[spec.key] && (ratios[spec.key].actual !== null || ratios[spec.key].anterior !== null));
    if (rows.length === 0) return;
    subheading(`Ratios · ${block.bloque}`);
    table({
      startY: y,
      head: [['Indicador', anioAnt, anioAct, 'Variación', 'Estado']],
      body: rows.map(spec => {
        const r = ratios[spec.key];
        return [
          spec.name,
          fmtRatio(r.anterior, spec.kind),
          fmtRatio(r.actual, spec.kind),
          fmtRatioVariation(r.actual, r.anterior, r.variacion_pct, spec.kind),
          r.status ? RATIO_STATUS_LABEL[r.status] : '',
        ];
      }),
      columnStyles: {
        0: { cellWidth: 66 },
        1: { halign: 'right', cellWidth: 30 },
        2: { halign: 'right', fontStyle: 'bold', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 32 },
        4: { halign: 'center', fontStyle: 'bold', cellWidth: CW - 158 },
      },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 4) {
          const st = ratios[rows[data.row.index].key]?.status;
          if (st) data.cell.styles.fillColor = tint(RATIO_STATUS_RGB[st], 0.35);
        }
      },
    });
  });
  setText(7, 'italic', MUTED);
  ensure(RATIO_ASSUMPTIONS.length * 3.6 + 4);
  RATIO_ASSUMPTIONS.forEach(a => {
    (doc.splitTextToSize(pdfSafe(a), CW) as string[]).forEach(line => { text(line, M, y); y += 3.4; });
  });

  // ======================================================================
  // 5. SISTEMA FINANCIERO (NOSIS)
  // ======================================================================

  // ======================================================================
  // PROYECCIONES (capacidad de repago, cálculo determinístico)
  // ======================================================================

  sectionTitle('Proyección de capacidad de repago');
  {
    const g = activeResult.proyecciones ?? proyeccionesVacias();
    const res = resolverProyeccion(extraction, ratios, g);
    const pctTxt = (v: number | null | undefined, dec = 1) => (v === null || v === undefined ? '-' : `${fmtNum(v * 100, dec)}%`);
    const xTxt = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${fmtNum(v, 2)}x`);
    const dscrRGB = (v: number | null) =>
      v === null ? null : v > RATIO_THRESHOLDS.dscr.sano ? STATUS_RGB.good : v >= RATIO_THRESHOLDS.dscr.alerta ? STATUS_RGB.warning : STATUS_RGB.critical;
    paragraph('Cálculo determinístico en código, sin IA. Miles de $ en moneda constante del cierre del balance. Los valores editados por el analista llevan un asterisco.', 8.5, 'italic');

    subheading('Año base');
    const inflacion = g.base.inflacionMensual ?? null;
    table({
      startY: y,
      body: [
        ['Inflación mensual', inflacion === null ? (res.sugeridosBase.inflacionRequerida ? 'Falta (necesaria)' : 'No requerida') : `${pctTxt(inflacion, 2)}*`, 'La carga el analista'],
        ['Ventas base', res.base ? `${money(res.base.ventas)}${'ventas' in g.base ? '*' : ''}` : '-', res.sugeridosBase.ventas.fuente],
        ['Deuda bancaria corriente', money(res.base?.deudaCorriente ?? res.sugeridosBase.deudaCorriente.valor), res.sugeridosBase.deudaCorriente.fuente],
        ['Deuda bancaria no corriente', money(res.base?.deudaNoCorriente ?? res.sugeridosBase.deudaNoCorriente.valor), res.sugeridosBase.deudaNoCorriente.fuente],
        ['Deuda post balance', res.incluirDeudaPostBalance ? money(res.base?.deudaPostBalance ?? res.sugeridosBase.deudaPostBalance.valor) : 'Excluida', res.sugeridosBase.deudaPostBalance.fuente],
      ],
      columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' }, 1: { cellWidth: 34, halign: 'right' }, 2: { cellWidth: CW - 82, textColor: MUTED } },
    });

    subheading('Supuestos por escenario');
    const horizonteMax = Math.max(...ESCENARIOS.map(e => res.supuestos[e].horizonte));
    const mark = (e: typeof ESCENARIOS[number], campo: string) => (campo in g.escenarios[e] ? '*' : '');
    const filasSup: Array<[string, (e: typeof ESCENARIOS[number]) => string]> = [
      ['Horizonte (años)', e => `${res.supuestos[e].horizonte}${mark(e, 'horizonte')}`],
      ...Array.from({ length: horizonteMax }, (_, i) => [
        `Crecimiento real ventas año ${i + 1}`,
        (e: typeof ESCENARIOS[number]) => i < res.supuestos[e].horizonte
          ? `${pctTxt(res.supuestos[e].crecimiento[i])}${g.escenarios[e].crecimiento && i in g.escenarios[e].crecimiento! ? '*' : ''}`
          : '-',
      ] as [string, (e: typeof ESCENARIOS[number]) => string]),
      ['Margen EBITDA', e => `${pctTxt(res.supuestos[e].margenEbitda)}${mark(e, 'margenEbitda')}`],
      ['Capex de mantenimiento (% ventas)', e => `${pctTxt(res.supuestos[e].capexPct)}${mark(e, 'capexPct')}`],
      ['Capital de trabajo (% ventas)', e => `${pctTxt(res.supuestos[e].capitalTrabajoPct)}${mark(e, 'capitalTrabajoPct')}`],
      ['Liberación de capital de trabajo', e => `${res.supuestos[e].liberarCapitalTrabajo ? 'Sí' : 'No'}${mark(e, 'liberarCapitalTrabajo')}`],
      ['Tasa real de la deuda', e => `${pctTxt(res.supuestos[e].tasaReal)}${mark(e, 'tasaReal')}`],
      ['Alícuota impuesto a las ganancias', e => `${pctTxt(res.supuestos[e].alicuota)}${mark(e, 'alicuota')}`],
      ['Años amortización deuda no corriente', e => `${res.supuestos[e].aniosAmortizacionNoCorriente}${mark(e, 'aniosAmortizacionNoCorriente')}`],
      ['Años amortización deuda post balance', e => `${res.supuestos[e].aniosAmortizacionPostBalance}${mark(e, 'aniosAmortizacionPostBalance')}`],
    ];
    table({
      startY: y,
      head: [['Supuesto', ...ESCENARIOS.map(e => ESCENARIO_LABEL[e])]],
      body: filasSup.map(([label, f]) => [label, ...ESCENARIOS.map(f)]),
      columnStyles: { 0: { cellWidth: 82 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    const proyectados = Object.fromEntries(ESCENARIOS.map(e => {
      const sup = res.supuestos[e];
      const faltan = [...res.faltaBase, ...faltantes(sup)];
      return [e, !res.base || faltan.length ? { faltan, r: null } : { faltan, r: proyectar(res.base, sup) }];
    })) as Record<typeof ESCENARIOS[number], { faltan: string[]; r: ReturnType<typeof proyectar> | null }>;

    const base = proyectados.base;
    if (!base.r) {
      paragraph(`Proyección incompleta: falta ${base.faltan.join(', ')}.`, 9.5, 'italic');
    } else {
      const f = base.r.filas;
      subheading('Proyección · escenario Base');
      const fila = (label: string, get: (i: number) => string, bold = false) => ({ label, get, bold });
      const filas = [
        fila('Ventas', i => fmtNum(f[i].ventas, 0)),
        fila('EBITDA', i => fmtNum(f[i].ebitda, 0)),
        fila('− Impuestos', i => fmtNum(-f[i].impuestos || 0, 0)),
        fila('− Capex de mantenimiento', i => fmtNum(-f[i].capex || 0, 0)),
        fila('− Δ Capital de trabajo', i => fmtNum(-f[i].deltaCapitalTrabajo || 0, 0)),
        fila('Flujo para deuda (CFADS)', i => fmtNum(f[i].cfads, 0), true),
        fila('Servicio de deuda', i => fmtNum(f[i].servicio, 0), true),
        fila('DSCR', i => (f[i].dscr === null ? 'sin deuda' : xTxt(f[i].dscr)), true),
        fila('Deuda / EBITDA (fin de año)', i => xTxt(f[i].deudaEbitda)),
        fila('Caja acumulada', i => fmtNum(f[i].cajaAcumulada, 0)),
      ];
      table({
        startY: y,
        head: [['Miles de $', ...f.map(r => `Año ${r.anio}`)]],
        body: filas.map(r => [r.label, ...f.map((_, i) => r.get(i))]),
        columnStyles: Object.fromEntries([[0, { cellWidth: 62 }], ...f.map((_, i) => [i + 1, { halign: 'right' }])]),
        didParseCell: data => {
          if (data.section === 'body' && filas[data.row.index]?.bold) data.cell.styles.fontStyle = 'bold';
          if (data.section === 'body' && filas[data.row.index]?.label === 'DSCR' && data.column.index > 0) {
            const c = dscrRGB(f[data.column.index - 1].dscr);
            if (c) data.cell.styles.fillColor = tint(c, 0.35);
          }
        },
      });
    }

    subheading('DSCR por año y resumen de escenarios');
    table({
      startY: y,
      head: [['Escenario', ...Array.from({ length: horizonteMax }, (_, i) => `Año ${i + 1}`), 'DSCR mínimo', 'Punto de quiebre']],
      body: ESCENARIOS.map(e => {
        const p = proyectados[e];
        if (!p.r) return [ESCENARIO_LABEL[e], ...Array.from({ length: horizonteMax }, () => '-'), 'Incompleto', '-'];
        const q = puntoDeQuiebre(res.base!, res.supuestos[e]);
        const quiebre = q.tipo === 'valor' ? `${fmtNum(q.crecimientoAnio1 * 100, 1)}% año 1` : q.tipo === 'ya_debajo' ? 'Ya debajo de 1x' : q.tipo === 'no_se_alcanza' ? 'No se alcanza' : 'Sin deuda';
        return [
          ESCENARIO_LABEL[e],
          ...Array.from({ length: horizonteMax }, (_, i) => { const fl = p.r!.filas[i]; return fl ? (fl.dscr === null ? 'sin deuda' : xTxt(fl.dscr)) : '-'; }),
          p.r.dscrMinimo ? `${xTxt(p.r.dscrMinimo.valor)} (año ${p.r.dscrMinimo.anio})` : 'sin deuda',
          quiebre,
        ];
      }),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 } },
      didParseCell: data => {
        if (data.section !== 'body' || data.column.index === 0 || data.column.index > horizonteMax) return;
        const fl = proyectados[ESCENARIOS[data.row.index]]?.r?.filas[data.column.index - 1];
        const c = fl ? dscrRGB(fl.dscr) : null;
        if (c) data.cell.styles.fillColor = tint(c, 0.35);
        data.cell.styles.halign = 'right';
      },
    });
    const est = proyectados.estres.r;
    if (est) {
      const m = margenDeudaNueva(est, PROJECTION_PARAMS.dscrObjetivoDeudaNueva);
      paragraph(`Margen para deuda nueva (escenario Estrés): ${m > 0 ? `${money(m)} de servicio anual adicional manteniendo DSCR >= ${fmtNum(PROJECTION_PARAMS.dscrObjetivoDeudaNueva, 2)}x` : 'sin margen'}.`, 9);
    }
    paragraph('Punto de quiebre: caída real de ventas en el año 1 que lleva el DSCR mínimo a 1,0x, calculado sin liberación de capital de trabajo. En impuestos se usa el capex de mantenimiento como proxy de la depreciación.', 7.5, 'italic');
  }

  sectionTitle('Sistema financiero (Nosis)');
  const nosis = extraction.extraccion_nosis;
  if (nosis) {
    const sitColor = situacionRGB(nosis.situacion_bcra_peor_estado);
    const sit24 = nosis.peor_situacion_24_meses ?? null;
    tiles([
      { label: 'Score Nosis', value: nosis.score_crediticio === null ? '-' : String(nosis.score_crediticio), sub: risk?.pce_proxy !== null && risk?.pce_proxy !== undefined ? `Pérdida esperada ${risk.pce_proxy}/100` : undefined },
      { label: 'Peor situación BCRA', value: nosis.situacion_bcra_peor_estado === null ? '-' : `Situación ${nosis.situacion_bcra_peor_estado}`, accent: sitColor ?? undefined },
      { label: 'Peor situación 24 meses', value: sit24 === null ? '-' : `Situación ${sit24}`, accent: situacionRGB(sit24) ?? undefined },
      { label: 'Deuda en el sistema', value: money(nosis.deuda_financiera_total_nosis) },
    ]);
    const cheques = nosis.cheques_rechazados_cantidad ?? 0;
    tiles([
      { label: 'Cheques rechazados', value: `${cheques}`, sub: `${money(nosis.cheques_rechazados_monto)}${nosis.cheques_rechazados_levantados ? ` · ${nosis.cheques_rechazados_levantados} levantados` : ''}`, accent: cheques > 0 ? STATUS_RGB.serious : undefined },
      { label: 'Deuda con ARCA', value: money(nosis.deuda_fiscal_previsional ?? null), sub: nosis.planes_de_pago_arca === true ? 'Con planes de pago' : undefined, accent: (nosis.deuda_fiscal_previsional ?? 0) > 0 ? STATUS_RGB.serious : undefined },
      { label: 'Juicios / embargos', value: `${nosis.juicios_cantidad ?? '-'} / ${nosis.embargos_cantidad ?? '-'}`, accent: ((nosis.juicios_cantidad ?? 0) + (nosis.embargos_cantidad ?? 0)) > 0 ? STATUS_RGB.serious : undefined },
      { label: 'Pedidos de quiebra', value: `${nosis.pedidos_quiebra_cantidad ?? '-'}`, accent: (nosis.pedidos_quiebra_cantidad ?? 0) > 0 ? STATUS_RGB.critical : undefined },
    ]);

    const serieNosis = serieTotal(nosis.evolucion_deuda ?? []);
    const porEntidadNosis = seriePorEntidad(nosis.evolucion_deuda ?? []);
    if (serieNosis.length >= 2) {
      subheading(`Evolución de la deuda en el sistema (${mesesDeSerie(serieNosis)} meses)`);
      // Gráfico de línea: total mensual, con los meses en situación 2 o peor marcados.
      const h = 42;
      ensure(h + 16);
      const x0 = M + 16, x1 = M + CW - 2, y0 = y + 2, y1 = y + h;
      const max = Math.max(...serieNosis.map(p => p.total), 1);
      const px = (i: number) => x0 + (i / (serieNosis.length - 1)) * (x1 - x0);
      const py = (v: number) => y1 - (v / max) * (y1 - y0);
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      [0, 0.5, 1].forEach(f => doc.line(x0, py(max * f), x1, py(max * f)));
      setText(6.5, 'normal', MUTED);
      [0, 0.5, 1].forEach(f => text(fmtNum((max * f) / 1000, 0) + ' M', x0 - 2, py(max * f) + 1, { align: 'right' }));
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.5);
      for (let i = 1; i < serieNosis.length; i++) doc.line(px(i - 1), py(serieNosis[i - 1].total), px(i), py(serieNosis[i].total));
      serieNosis.forEach((p, i) => {
        const c = (p.peorSituacion ?? 1) >= 2 ? situacionRGB(p.peorSituacion) : null;
        if (c) { doc.setFillColor(...c); doc.circle(px(i), py(p.total), 1, 'F'); }
      });
      const marcas = [0, Math.floor((serieNosis.length - 1) / 2), serieNosis.length - 1];
      marcas.forEach(i => text(etiquetaPeriodo(serieNosis[i].periodo), px(i), y1 + 4, { align: i === 0 ? 'left' : i === serieNosis.length - 1 ? 'right' : 'center' }));
      doc.setLineWidth(0.2);
      y = y1 + 8;
      const pct = (v: ReturnType<typeof variacion>) => (v && v.pct !== null ? `${v.pct > 0 ? '+' : ''}${fmtNum(v.pct * 100, 1)}%` : 's/d');
      paragraph(`Variación: últimos 6 meses ${pct(variacion(serieNosis, 6))} · últimos 12 meses ${pct(variacion(serieNosis, 12))} · todo el período ${pct(variacionTotalPeriodo(serieNosis))}. Escala en millones de $ (miles de miles). Montos nominales, sin ajustar por inflación; los puntos de color marcan meses con situación 2 o peor.`, 7.5, 'italic');
    }

    if (nosis.detalle_entidades.length > 0) {
      const totalRef = (nosis.deuda_financiera_total_nosis ?? 0) > 0
        ? nosis.deuda_financiera_total_nosis!
        : nosis.detalle_entidades.reduce((a, e) => a + (Number(e.monto) || 0), 0);
      subheading('Deuda por entidad');
      table({
        startY: y,
        head: [['Entidad', 'Situación', 'Monto', 'Participación', ...(porEntidadNosis.length > 0 ? ['Var. 12 m'] : [])]],
        body: nosis.detalle_entidades.map(e => {
          const monto = Number(e.monto) || 0;
          const fila = [e.entidad || 'Desconocido', e.situacion === null ? '-' : String(e.situacion), money(monto), totalRef > 0 ? `${fmtNum((monto / totalRef) * 100, 1)}%` : '-'];
          if (porEntidadNosis.length === 0) return fila;
          const norm = (x: string | null | undefined) => (x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
          const t = porEntidadNosis.find(p => norm(p.entidad) === norm(e.entidad));
          const v = t ? variacion(t.puntos.map(p => ({ periodo: p.periodo, total: p.monto })), 12) : null;
          return [...fila, v && v.pct !== null ? `${v.pct > 0 ? '+' : ''}${fmtNum(v.pct * 100, 1)}%` : v ? 'nueva' : '-'];
        }),
        columnStyles: { 0: { cellWidth: porEntidadNosis.length > 0 ? 66 : 82 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 24 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 1) {
            const c = situacionRGB(nosis.detalle_entidades[data.row.index]?.situacion);
            if (c) data.cell.styles.fillColor = tint(c, 0.35);
          }
        },
      });
    }
  } else {
    paragraph('No se recibió informe Nosis para este caso.', 9.5, 'italic');
  }

  const crossCheck = activeResult.crossCheck;
  if (crossCheck && crossCheck.nosis_debt !== null) {
    subheading('Cruce de deuda: balance vs. Nosis');
    ensure(22);
    const ok = crossCheck.match === true;
    const c = ok ? STATUS_RGB.good : STATUS_RGB.critical;
    doc.setFillColor(...tint(c, 0.15));
    doc.rect(M, y, CW, 18, 'F');
    doc.setFillColor(...c);
    doc.rect(M, y, 1.6, 18, 'F');
    chip(ok ? 'Consistente' : 'Discrepancia', c, M + 5, y + 7, 8);
    setText(8.5, 'normal');
    text(`Balance ${money(crossCheck.balance_debt)}   ·   Nosis ${money(crossCheck.nosis_debt)}   ·   Diferencia ${money(crossCheck.difference_abs)}${crossCheck.difference_pct !== null ? ` (${crossCheck.difference_pct > 0 ? '+' : ''}${fmtNum(crossCheck.difference_pct, 1)}%)` : ''}`, M + 5, y + 14);
    y += 24;
  }

  // ======================================================================
  // 6. INFORMACIÓN POST BALANCE
  // ======================================================================

  sectionTitle('Información post balance');
  const post = extraction.analisis_post_cierre;
  const ventas = post?.detalle_ventas_mensuales ?? [];
  if (ventas.length > 0) {
    subheading('Ventas mensuales posteriores al cierre (nominales)');
    const totalAct = ventas.reduce((a, v) => a + (v.monto || 0), 0);
    const conAnt = ventas.filter(v => v.monto_anio_anterior);
    const totalAnt = conAnt.reduce((a, v) => a + (v.monto_anio_anterior || 0), 0);
    const varOf = (a: number, b: number | null | undefined) => (b ? ((a - b) / b) * 100 : null);
    const fmtVar = (v: number | null) => (v === null ? '-' : `${v > 0 ? '+' : ''}${fmtNum(v, 1)}%`);
    const rowsVar = ventas.map(v => varOf(v.monto, v.monto_anio_anterior));
    const totalVar = totalAnt > 0 ? varOf(conAnt.reduce((a, v) => a + v.monto, 0), totalAnt) : null;
    table({
      startY: y,
      head: [['Mes', 'Año actual', 'Año anterior', 'Var. %']],
      body: ventas.map((v, i) => [v.mes, money(v.monto, v.moneda), v.monto_anio_anterior ? money(v.monto_anio_anterior, v.moneda) : 'Sin información', fmtVar(rowsVar[i])]),
      foot: [['Total', money(totalAct), totalAnt > 0 ? money(totalAnt) : '-', fmtVar(totalVar)]],
      footStyles: { fillColor: SOFT, textColor: INK, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 50 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 3) {
          const v = rowsVar[data.row.index];
          if (v !== null) data.cell.styles.fillColor = tint(v < 0 ? STATUS_RGB.critical : STATUS_RGB.good, 0.25);
        }
      },
    });
    const serieU = serieUnidades(ventas);
    if (hayUnidades(serieU)) {
      const u = (post?.unidad_medida ?? '').trim() || 'unidades';
      const tU = totalesUnidades(serieU);
      const cant = (v: number | null) => (v === null ? '-' : fmtNum(v, 2));
      subheading(`Ventas en ${u}`);
      table({
        startY: y,
        head: [['Mes', 'Año actual', 'Año anterior', 'Var. %']],
        body: serieU.map(p => [p.mes, cant(p.cantidad), p.cantidadAnterior === null ? 'Sin información' : cant(p.cantidadAnterior), fmtVar(p.variacion)]),
        foot: [['Total', cant(tU.total), tU.totalAnterior > 0 ? cant(tU.totalAnterior) : '-', fmtVar(tU.variacion)]],
        footStyles: { fillColor: SOFT, textColor: INK, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 0: { cellWidth: 50 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
      });
      if (tU.variacion !== null && tU.mesesComparables < serieU.length) {
        paragraph('La variación total compara solo los meses con dato en los dos años.', 7.5, 'italic');
      }
    }
    if (post?.notas_relevantes) paragraph(`Nota: ${post.notas_relevantes}`, 8.5, 'italic');
  }
  const deudaPost = post?.deuda_bancaria_post_balance_detalle ?? [];
  if (deudaPost.length > 0) {
    subheading('Deuda bancaria asumida después del cierre');
    const totalArs = deudaPost.filter(d => (d.moneda ?? 'ARS') === 'ARS').reduce((a, d) => a + (Number(d.monto) || 0), 0);
    const totalUsd = deudaPost.filter(d => d.moneda === 'USD').reduce((a, d) => a + (Number(d.monto) || 0), 0);
    table({
      startY: y,
      head: [['Entidad / acreedor', 'Moneda', 'Monto']],
      body: deudaPost.map(d => [d.entidad, d.moneda ?? 'ARS', money(d.monto, d.moneda)]),
      foot: [['Total', '', [totalArs ? money(totalArs) : '', totalUsd ? money(totalUsd, 'USD') : ''].filter(Boolean).join(' + ')]],
      footStyles: { fillColor: SOFT, textColor: INK, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'center' }, 2: { halign: 'right' } },
    });
  }
  if (ventas.length === 0 && deudaPost.length === 0) {
    paragraph('No hay información posterior al cierre para este caso.', 9.5, 'italic');
  }

  // ======================================================================
  // 7. ACCIONISTAS Y DIRECTORIO
  // ======================================================================

  sectionTitle('Accionistas y directorio');
  const accDir = extraction.accionistas_y_directorio;
  const accionistas = (accDir?.accionistas ?? []) as Shareholder[];
  if (accionistas.length > 0) {
    subheading('Composición accionaria');
    const arbolAcc = armarArbol(accionistas);
    const hayCadenas = arbolAcc.some(n => n.hijos.length > 0);
    const renderAccionistas = (list: Shareholder[], nodos: NodoAccionista[], level: number, parent?: string) => {
      const indent = (level - 1) * 6;
      if (parent) {
        ensure(12);
        setText(8, 'bold', MUTED);
        text(`Composición de ${parent}`, M + indent, y);
        y += 3;
      }
      table({
        startY: y,
        margin: { left: M + indent, right: M, top: TOP, bottom: PAGE_H - BOTTOM },
        head: [['Nombre / razón social', 'DNI / CUIT', 'Participación', ...(hayCadenas ? ['Sobre la empresa'] : [])]],
        body: list.map((a, i) => {
          const fila = [a.nombre, a.dni_cuit, a.participacion === null ? 'N/D' : `${fmtNum(Number(a.participacion), 2)}%`];
          const ind = nodos[i]?.indirecta;
          return hayCadenas ? [...fila, ind === null || ind === undefined ? 'N/D' : `${fmtNum(ind, 2)}%`] : fila;
        }),
        headStyles: level === 1 ? {} : { fillColor: SOFT, textColor: INK },
        columnStyles: { 2: { halign: 'right', fontStyle: 'bold', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 30 } },
      });
      list.forEach((a, i) => { if (a.subAccionistas?.length) renderAccionistas(a.subAccionistas, nodos[i]?.hijos ?? [], level + 1, a.nombre); });
    };
    renderAccionistas(accionistas, arbolAcc, 1);
    if (hayCadenas) paragraph('Participación: sobre la sociedad madre. Sobre la empresa: producto de la cadena societaria.', 7.5, 'italic');
  }
  const directorio = accDir?.directorio ?? [];
  if (directorio.length > 0) {
    subheading('Órgano de administración');
    table({
      startY: y,
      head: [['Cargo', 'Nombre']],
      body: directorio.map(d => [d.cargo ?? '', d.nombre ?? '']),
      columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
    });
  }
  if (accionistas.length === 0 && directorio.length === 0) {
    paragraph('No se informaron accionistas ni directorio en los documentos.', 9.5, 'italic');
  }

  // ======================================================================
  // 8. ANEXO: ANÁLISIS DE MERCADO
  // ======================================================================

  sectionTitle('Anexo: análisis de mercado');
  const market = activeResult.marketAnalysis;
  if (market) {
    let buffer: string[] = [];
    const flush = () => { if (buffer.length) { paragraph(buffer.join(' ')); buffer = []; } };
    market.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) { flush(); return; }
      const heading = line.match(/^#{1,4}\s+(.*)$/);
      if (heading) { flush(); y += 1; subheading(stripMarkdown(heading[1])); return; }
      if (/^[-*]\s+/.test(line)) { flush(); bullets([line.replace(/^[-*]\s+/, '')]); return; }
      buffer.push(line);
    });
    flush();
  } else {
    paragraph('No se generó análisis de mercado para este caso.', 9.5, 'italic');
  }

  // ======================================================================
  // ÍNDICE (portada), ENCABEZADOS Y PIES
  // ======================================================================

  doc.setPage(1);
  let ty = tocY;
  setText(8.5, 'bold', MUTED);
  text('CONTENIDO', M, ty);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.line(M, ty + 1.8, M + CW, ty + 1.8);
  ty += 7;
  sections.forEach((s, i) => {
    if (ty > BOTTOM - 2) return;
    setText(9, 'normal');
    text(`${i + 1}.  ${s.title}`, M, ty);
    const tw = doc.getTextWidth(pdfSafe(`${i + 1}.  ${s.title}`));
    doc.setDrawColor(...RULE);
    doc.setLineDashPattern([0.4, 1], 0);
    doc.line(M + tw + 2, ty - 0.8, M + CW - 10, ty - 0.8);
    doc.setLineDashPattern([], 0);
    setText(9, 'bold');
    text(String(s.page), M + CW, ty, { align: 'right' });
    ty += 6;
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      drawLogo(M, 7.6, 5.4, INK, WHITE);
      setText(7, 'normal', MUTED);
      text('Informe de riesgo crediticio', M + 19, 12);
      text(company.name || '', PAGE_W - M, 12, { align: 'right' });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.25);
      doc.line(M, 14.5, PAGE_W - M, 14.5);
    }
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.line(M, PAGE_H - 13, PAGE_W - M, PAGE_H - 13);
    setText(7, 'normal', MUTED);
    text('Confidencial · uso interno del comité de crédito', M, PAGE_H - 8.5);
    text(`Página ${i} de ${totalPages}`, PAGE_W - M, PAGE_H - 8.5, { align: 'right' });
  }

  doc.save(`Informe_Riesgo_${(company.name || 'Empresa').replace(/[^\w\s.-]/g, '').trim()}.pdf`);
};

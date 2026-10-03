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

// ============================================================================
// Informe de riesgo para comité (jsPDF). Orden: portada con el dictamen →
// opinión de riesgos → resumen ejecutivo → historia → estados y ratios →
// Nosis → post balance → accionistas → anexo de mercado.
// Mismo lenguaje visual que la app: paleta de estados siempre con etiqueta,
// tablas con cabecera oscura y secciones numeradas.
// ============================================================================

type RGB = [number, number, number];

const INK: RGB = [20, 20, 20];
const MUTED: RGB = [110, 110, 110];
const RULE: RGB = [220, 218, 214];
const SOFT: RGB = [240, 239, 237];
const ZEBRA: RGB = [250, 249, 247];
const WHITE: RGB = [255, 255, 255];

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
  if (s === null || s === undefined) return null;
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
    .replace(/[‐-‒]/g, '-')
    .replace(/[^\u0000-ÿ–—‘’“”…€]/g, '');

const stripMarkdown = (s: string) => s.replace(/\*\*|__/g, '').replace(/[*_`]/g, '').replace(/^#+\s*/gm, '');

// ---------- Formatos ----------

const fmtNum = (v: number, dec = 2) => v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const money = (v: number | null | undefined, currency = 'ARS') =>
  v === null || v === undefined ? '-' : formatCurrencyThousands(v, currency);

type RatioKind = 'x' | 'pct' | 'dias' | 'monto';
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

const RATIO_BLOCKS: Array<{ bloque: string; ratios: Array<{ key: RatioKey; name: string; kind: RatioKind }> }> = [
  { bloque: 'Capacidad de pago', ratios: [
    { key: 'dscr', name: 'DSCR (servicio de deuda)', kind: 'x' },
    { key: 'deuda_neta_ebitda', name: 'Deuda neta / EBITDA', kind: 'x' },
    { key: 'cobertura_intereses', name: 'Cobertura de intereses', kind: 'x' },
    { key: 'calidad_ganancia', name: 'Calidad de la ganancia (FCO / EBITDA)', kind: 'pct' },
  ]},
  { bloque: 'Liquidez', ratios: [
    { key: 'liquidez_corriente', name: 'Liquidez corriente', kind: 'x' },
    { key: 'liquidez_acida', name: 'Prueba ácida', kind: 'x' },
    { key: 'liquidez_inmediata', name: 'Liquidez inmediata', kind: 'x' },
    { key: 'capital_de_trabajo', name: 'Capital de trabajo', kind: 'monto' },
    { key: 'ktno', name: 'KTNO', kind: 'monto' },
  ]},
  { bloque: 'Rentabilidad', ratios: [
    { key: 'margen_bruto', name: 'Margen bruto', kind: 'pct' },
    { key: 'margen_ebitda', name: 'Margen EBITDA', kind: 'pct' },
    { key: 'margen_neto', name: 'Margen neto', kind: 'pct' },
    { key: 'roe', name: 'ROE', kind: 'pct' },
    { key: 'roa', name: 'ROA', kind: 'pct' },
  ]},
  { bloque: 'Endeudamiento y solvencia', ratios: [
    { key: 'deuda_bancaria_total', name: 'Deuda bancaria total', kind: 'monto' },
    { key: 'deuda_ebitda', name: 'Deuda / EBITDA', kind: 'x' },
    { key: 'deuda_financiera_pn', name: 'Deuda financiera / PN', kind: 'x' },
    { key: 'endeudamiento', name: 'Pasivo / PN', kind: 'x' },
    { key: 'solvencia', name: 'Solvencia (PN / pasivo)', kind: 'x' },
    { key: 'deuda_dias_ventas', name: 'Deuda en días de venta', kind: 'dias' },
    { key: 'autofinanciamiento', name: 'Autofinanciamiento', kind: 'pct' },
  ]},
  { bloque: 'Eficiencia operativa', ratios: [
    { key: 'dias_de_cobro', name: 'Días de cobro', kind: 'dias' },
    { key: 'dias_de_stock', name: 'Días de stock', kind: 'dias' },
    { key: 'dias_de_pago', name: 'Días de pago', kind: 'dias' },
    { key: 'ciclo_conversion_caja', name: 'Ciclo de conversión de caja', kind: 'dias' },
    { key: 'indice_inmovilizacion', name: 'Índice de inmovilización', kind: 'pct' },
  ]},
];

// ---------- Página ----------

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;            // margen lateral
const CW = PAGE_W - 2 * M; // ancho de contenido
const TOP = 24;          // primera línea útil (debajo del encabezado)
const BOTTOM = 280;      // última línea útil (arriba del pie)

export const generatePDF = (activeResult: ExtractionResult | null | undefined) => {
  if (!activeResult || !activeResult.extraction || !activeResult.ratios) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const extraction = activeResult.extraction;
  const ratios = activeResult.ratios;
  const company = extraction.company_profile;
  const risk = activeResult.riskAssessment ?? null;
  const fechaGeneracion = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

  let y = TOP;
  const sections: Array<{ title: string; page: number }> = [];

  // ---------- Primitivas ----------

  const setText = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: RGB = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
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
    styles: { font: 'helvetica', fontSize: 8, textColor: INK, cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 }, lineColor: RULE, lineWidth: { bottom: 0.2 } },
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
    setText(14, 'bold');
    text(title.toUpperCase(), M + 11.5, y + 0.6);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.6);
    doc.line(M, y + 5, M + CW, y + 5);
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
      styles: { font: 'helvetica', fontStyle: style, fontSize: size, textColor: INK, halign: 'left', cellPadding: 0, overflow: 'linebreak' },
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
      styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 1, bottom: 1, left: 0, right: 0 }, overflow: 'linebreak' },
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
  const tiles = (items: Tile[], perRow = items.length) => {
    const gap = 3;
    const w = (CW - gap * (perRow - 1)) / perRow;
    const h = 19;
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
        text(t.label.toUpperCase(), x + 3.5, y + 5);
        setText(11.5, 'bold');
        const value = doc.splitTextToSize(pdfSafe(t.value), w - 6)[0];
        text(value, x + 3.5, y + 11.5);
        if (t.sub) {
          if (t.subColor) {
            doc.setFillColor(...t.subColor);
            doc.rect(x + 3.5, y + 14.3, 1.6, 1.6, 'F');
          }
          setText(7, 'normal', MUTED);
          text(t.sub, x + (t.subColor ? 6.2 : 3.5), y + 15.9);
        }
      });
      y += h + 4;
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
  doc.rect(0, 0, PAGE_W, 46, 'F');
  setText(20, 'bold', WHITE);
  text('BiBank', M, 17);
  setText(8, 'normal', [200, 200, 200]);
  text('ANÁLISIS DE RIESGO CREDITICIO', M, 23);
  setText(18, 'bold', WHITE);
  text('Informe para comité de crédito', M, 37);
  setText(8, 'normal', [200, 200, 200]);
  text(`Generado el ${fechaGeneracion}`, PAGE_W - M, 37, { align: 'right' });

  y = 60;
  setText(17, 'bold');
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
    setText(40, 'bold');
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
  sectionTitle('Resumen ejecutivo');
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
    setText(7.5, 'bold', [190, 190, 190]);
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
  const esp = extraction.ejercicio_actual.estado_situacion_patrimonial;
  const er = extraction.ejercicio_actual.estado_resultados;
  const espAnt = extraction.ejercicio_anterior?.estado_situacion_patrimonial;
  const erAnt = extraction.ejercicio_anterior?.estado_resultados;
  const varSub = (actual: number | null | undefined, anterior: number | null | undefined): Pick<Tile, 'sub' | 'subColor'> => {
    const t = getVariationText(actual ?? null, anterior ?? null);
    if (t === '-') return {};
    return { sub: `${t} interanual`, subColor: t.startsWith('-') ? STATUS_RGB.critical : STATUS_RGB.good };
  };
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

    if (nosis.detalle_entidades.length > 0) {
      const totalRef = (nosis.deuda_financiera_total_nosis ?? 0) > 0
        ? nosis.deuda_financiera_total_nosis!
        : nosis.detalle_entidades.reduce((a, e) => a + (Number(e.monto) || 0), 0);
      subheading('Deuda por entidad');
      table({
        startY: y,
        head: [['Entidad', 'Situación', 'Monto', 'Participación']],
        body: nosis.detalle_entidades.map(e => {
          const monto = Number(e.monto) || 0;
          return [e.entidad || 'Desconocido', e.situacion === null ? '-' : String(e.situacion), money(monto), totalRef > 0 ? `${fmtNum((monto / totalRef) * 100, 1)}%` : '-'];
        }),
        columnStyles: { 0: { cellWidth: 82 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 24 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
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
    const renderAccionistas = (list: Shareholder[], level: number, parent?: string) => {
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
        head: [['Nombre / razón social', 'DNI / CUIT', 'Participación']],
        body: list.map(a => [a.nombre, a.dni_cuit, a.participacion === null ? 'N/D' : `${fmtNum(Number(a.participacion), 2)}%`]),
        headStyles: level === 1 ? {} : { fillColor: SOFT, textColor: INK },
        columnStyles: { 2: { halign: 'right', fontStyle: 'bold', cellWidth: 28 } },
      });
      list.forEach(a => { if (a.subAccionistas?.length) renderAccionistas(a.subAccionistas, level + 1, a.nombre); });
    };
    renderAccionistas(accionistas, 1);
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
      setText(7, 'bold', INK);
      text('BiBank', M, 12);
      setText(7, 'normal', MUTED);
      text('· Informe de riesgo crediticio', M + 9.5, 12);
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

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getComparativeTablesData, formatValue, getVariationText } from '../../components/ComparativeView';
import { ExtractionResult, Shareholder } from '../../types';
import { formatCurrencyThousands } from '../../lib/utils';
import { ComputedRatios, RatioKey, RatioStatus } from '../ratios/calculations';
import { CATEGORY_LABEL, DIMENSIONS, RiskCategory, SEVERIDAD_LABEL, categoryOf } from '../risk/score';
import { RiskDimension, SeveridadRiesgo } from '../extraction/schemas';

type Status = RatioStatus | null;

const statusLabel = (s: Status): string => {
  if (s === 'healthy') return 'Saludable';
  if (s === 'alert') return 'Alerta';
  if (s === 'critical') return 'Crítico';
  return 'N/D';
};

type RatioCardSpec = { key: keyof ComputedRatios; name: string; description: string; format?: 'pct' | 'x' };

const RATIO_CARDS: RatioCardSpec[] = [
  { key: 'liquidez_corriente', name: 'Liquidez Corriente', description: 'Activo Corriente / Pasivo Corriente', format: 'x' },
  { key: 'solvencia', name: 'Solvencia', description: 'Patrimonio Neto / Pasivo Total', format: 'x' },
  { key: 'deuda_ebitda', name: 'Deuda / EBITDA', description: 'Deuda Bancaria / EBITDA', format: 'x' },
  { key: 'cobertura_intereses', name: 'EBITDA / Intereses', description: 'Cobertura de Intereses', format: 'x' },
];

const formatRatioValue = (value: number | null, format?: 'pct' | 'x'): string => {
  if (value === null || !Number.isFinite(value)) return '-';
  if (format === 'pct') return (value * 100).toFixed(1) + '%';
  if (format === 'x') return value.toFixed(2) + 'x';
  return value.toFixed(2);
};

type RatioBlockFormat = 'pct' | 'num';
type RatioBlockSpec = { key: RatioKey; name: string; format: RatioBlockFormat };

const RATIO_BLOCKS: Array<{ bloque: string; ratios: RatioBlockSpec[] }> = [
  { bloque: 'Liquidez', ratios: [
    { key: 'liquidez_corriente', name: 'Liquidez Corriente', format: 'num' },
    { key: 'liquidez_acida', name: 'Prueba Ácida', format: 'num' },
    { key: 'liquidez_inmediata', name: 'Liquidez Inmediata', format: 'num' },
    { key: 'capital_de_trabajo', name: 'Capital de Trabajo', format: 'num' },
    { key: 'ktno', name: 'KTNO', format: 'num' },
  ]},
  { bloque: 'Rentabilidad', ratios: [
    { key: 'margen_bruto', name: 'Margen Bruto', format: 'pct' },
    { key: 'margen_ebitda', name: 'Margen EBITDA', format: 'pct' },
    { key: 'margen_neto', name: 'Margen Neto', format: 'pct' },
    { key: 'roe', name: 'ROE', format: 'pct' },
    { key: 'roa', name: 'ROA', format: 'pct' },
  ]},
  { bloque: 'Endeudamiento', ratios: [
    { key: 'endeudamiento', name: 'Endeudamiento Total', format: 'num' },
    { key: 'solvencia', name: 'Solvencia', format: 'num' },
    { key: 'deuda_ebitda', name: 'Deuda / EBITDA', format: 'num' },
    { key: 'deuda_bancaria_total', name: 'Deuda Bancaria Total', format: 'num' },
    { key: 'deuda_dias_ventas', name: 'Deuda en Días de Venta', format: 'num' },
    { key: 'cobertura_intereses', name: 'Cobertura Intereses', format: 'num' },
    { key: 'autofinanciamiento', name: 'Autofinanciamiento', format: 'pct' },
  ]},
  { bloque: 'Eficiencia Operativa', ratios: [
    { key: 'dias_de_cobro', name: 'Días de Cobro', format: 'num' },
    { key: 'dias_de_pago', name: 'Días de Pago', format: 'num' },
    { key: 'dias_de_stock', name: 'Días de Stock', format: 'num' },
    { key: 'ciclo_conversion_caja', name: 'Ciclo Conv. Caja', format: 'num' },
    { key: 'indice_inmovilizacion', name: 'Índice Inmovilización', format: 'pct' },
  ]},
];

const formatBlockCell = (value: number | null, format: RatioBlockFormat): number | string | null => {
  if (value === null || !Number.isFinite(value)) return null;
  if (format === 'pct') return (value * 100).toFixed(2) + '%';
  return value;
};

// Paleta de estados (igual que en la vista de Opinión de riesgos).
type RGB = [number, number, number];
const STATUS_RGB: Record<'good' | 'warning' | 'serious' | 'critical', RGB> = {
  good: [12, 163, 12],
  warning: [250, 178, 25],
  serious: [236, 131, 90],
  critical: [208, 59, 59],
};
const CATEGORY_RGB: Record<RiskCategory, RGB> = {
  bajo: STATUS_RGB.good, moderado: STATUS_RGB.warning, alto: STATUS_RGB.serious, critico: STATUS_RGB.critical,
};
const SEVERIDAD_RGB: Record<SeveridadRiesgo, RGB> = {
  baja: STATUS_RGB.good, media: STATUS_RGB.warning, alta: STATUS_RGB.serious, critica: STATUS_RGB.critical,
};
// Tinte claro para fondos de celda: el texto sigue en negro.
const tintRGB = ([r, g, b]: RGB, alpha = 0.3): RGB =>
  [r, g, b].map(c => Math.round(255 - (255 - c) * alpha)) as RGB;

const POSTURA_LABEL = {
  favorable: 'Favorable',
  favorable_con_condiciones: 'Favorable con condiciones',
  desfavorable: 'Desfavorable',
} as const;

export const generatePDF = (activeResult: ExtractionResult | null | undefined) => {
  if (!activeResult || !activeResult.extraction || !activeResult.ratios) return;

  const doc = new jsPDF();
  const extraction = activeResult.extraction;
  const ratios = activeResult.ratios;
  const verification = activeResult.verification;
  const crossCheck = activeResult.crossCheck;
  const marketAnalysis = activeResult.marketAnalysis;
  const companyHistory = activeResult.companyHistory;
  const riskAssessment = activeResult.riskAssessment;
  const company = extraction.company_profile;

  const addSectionTitle = (title: string, isFirstPage = false) => {
    if (!isFirstPage) doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 22);
    doc.setFont('helvetica', 'normal');
    return 30;
  };

  const addLongText = (text: string, startY: number) => {
    const cleanText = text.replace(/[*_#]/g, '');
    autoTable(doc, {
      startY: startY,
      body: [[cleanText]],
      theme: 'plain',
      styles: { halign: 'justify', fontSize: 10, cellPadding: 0, textColor: [20, 20, 20] },
      columnStyles: { 0: { cellWidth: 182 } },
      margin: { left: 14, right: 14 },
    });
    return (doc as any).lastAutoTable.finalY + 10;
  };

  const addMarkdownText = (text: string, startY: number) => {
    let currentY = startY;
    text.split('\n').forEach(p => {
      const trimmed = p.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('### ')) {
        currentY += 10;
        if (currentY > 260) { doc.addPage(); currentY = 20; }
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const titleText = doc.splitTextToSize(trimmed.replace('### ', ''), 180);
        doc.text(titleText, 14, currentY);
        currentY += titleText.length * 5 + 5;
      } else if (trimmed.startsWith('## ')) {
        currentY += 12;
        if (currentY > 260) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        const titleText = doc.splitTextToSize(trimmed.replace('## ', ''), 180);
        doc.text(titleText, 14, currentY);
        currentY += titleText.length * 6 + 5;
      } else if (trimmed.startsWith('# ')) {
        currentY += 14;
        if (currentY > 260) { doc.addPage(); currentY = 20; }
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const titleText = doc.splitTextToSize(trimmed.replace('# ', ''), 180);
        doc.text(titleText, 14, currentY);
        currentY += titleText.length * 7 + 5;
      } else {
        let cleanLine = trimmed.replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '').replace(/_/g, '');
        cleanLine = cleanLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(cleanLine, 182);
        if (currentY + (lines.length * 5) > 280) { doc.addPage(); currentY = 20; }
        doc.text(cleanLine, 14, currentY, { align: 'justify', maxWidth: 182 });
        currentY += lines.length * 5 + 5;
      }
    });
    return currentY;
  };

  const addSubheading = (text: string, startY: number) => {
    const y = startY > 255 ? (doc.addPage(), 20) : startY;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(text, 14, y);
    doc.setFont('helvetica', 'normal');
    return y + 4;
  };

  const addBulletList = (items: string[], startY: number) => {
    autoTable(doc, {
      startY,
      body: items.map(item => ['-', item]),
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 }, textColor: [20, 20, 20] },
      columnStyles: { 0: { cellWidth: 5 }, 1: { cellWidth: 177, halign: 'justify' } },
      margin: { left: 14, right: 14 },
    });
    return (doc as any).lastAutoTable.finalY + 8;
  };

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Reporte de Riesgo para Comité', 14, 22);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Empresa: ${company.name || 'N/A'}`, 14, 32);
  doc.text(`CUIT: ${company.cuit || 'N/A'}`, 14, 40);
  doc.text(`Actividad: ${company.activity || 'N/A'}`, 14, 48);

  if (verification?.executive_summary) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen Ejecutivo', 14, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    addLongText(verification.executive_summary, 65);
  }

  let currentY = addSectionTitle('Opinión de riesgos');
  if (riskAssessment) {
    const { opinion, puntaje, senales, pce_proxy } = riskAssessment;
    const color = CATEGORY_RGB[puntaje.categoria];

    // Puntaje grande + categoría + postura
    doc.setFillColor(...color);
    doc.rect(14, currentY - 2, 3, 22, 'F');
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(String(puntaje.final), 21, currentY + 14);
    const scoreWidth = doc.getTextWidth(String(puntaje.final)); // medido con la fuente de 32
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('/ 100', 21 + scoreWidth + 2, currentY + 14);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(CATEGORY_LABEL[puntaje.categoria], 60, currentY + 6);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (opinion.postura) doc.text(`Postura: ${POSTURA_LABEL[opinion.postura]}`, 60, currentY + 13);
    if (pce_proxy !== null) doc.text(`Pérdida esperada (proxy score Nosis): ${pce_proxy}/100`, 60, currentY + 19);
    currentY += 28;

    // Barra de escala 1–100 con las 4 bandas y marcador
    const barX = 14, barW = 182, barH = 5;
    ([[0, 25, 'bajo'], [25, 50, 'moderado'], [50, 75, 'alto'], [75, 100, 'critico']] as Array<[number, number, RiskCategory]>)
      .forEach(([from, to, cat]) => {
        doc.setFillColor(...(cat === puntaje.categoria ? CATEGORY_RGB[cat] : tintRGB(CATEGORY_RGB[cat], 0.35)));
        doc.rect(barX + (from / 100) * barW + (from ? 0.4 : 0), currentY, ((to - from) / 100) * barW - 0.8, barH, 'F');
      });
    const mx = barX + (puntaje.final / 100) * barW;
    doc.setFillColor(20, 20, 20);
    doc.triangle(mx - 2, currentY - 3, mx + 2, currentY - 3, mx, currentY, 'F');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    [0, 25, 50, 75, 100].forEach(v => doc.text(String(v), barX + (v / 100) * barW, currentY + barH + 4, { align: 'center' }));
    doc.setTextColor(20, 20, 20);
    currentY += barH + 12;

    currentY = addSubheading('Dictamen', currentY);
    currentY = addLongText(opinion.dictamen, currentY);
    if (puntaje.piso && puntaje.ponderado !== null && puntaje.piso.piso > puntaje.ponderado) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text(`Promedio de dimensiones ${puntaje.ponderado}; elevado a ${puntaje.final} por regla automática: ${puntaje.piso.motivo}.`, 14, currentY - 4);
      doc.setFont('helvetica', 'normal');
      currentY += 4;
    }

    currentY = addSubheading('Riesgo por dimensión', currentY);
    autoTable(doc, {
      startY: currentY,
      head: [['Dimensión', 'Peso', 'Puntaje', 'Comentario']],
      body: (Object.keys(DIMENSIONS) as RiskDimension[]).map(dim => {
        const d = opinion.dimensiones.find(x => x.dimension === dim);
        return [DIMENSIONS[dim].label, `${DIMENSIONS[dim].weight}%`, d?.puntaje ?? 'S/D', d?.comentario ?? ''];
      }),
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 1.8, textColor: [20, 20, 20] },
      columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 14, halign: 'right' }, 2: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }, 3: { cellWidth: 112 } },
      margin: { left: 14, right: 14 },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 2 && typeof data.cell.raw === 'number') {
          data.cell.styles.fillColor = tintRGB(CATEGORY_RGB[categoryOf(data.cell.raw)], 0.45);
        }
      },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;

    if (opinion.riesgos.length > 0) {
      currentY = addSubheading('Riesgos detectados', currentY);
      autoTable(doc, {
        startY: currentY,
        head: [['Severidad', 'Riesgo', 'Evidencia y mitigante']],
        body: opinion.riesgos.map(r => [
          SEVERIDAD_LABEL[r.severidad],
          r.titulo,
          r.mitigante ? `${r.evidencia}\nMitigante: ${r.mitigante}` : r.evidencia,
        ]),
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 1.8, textColor: [20, 20, 20] },
        columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold', halign: 'center' }, 1: { cellWidth: 48, fontStyle: 'bold' }, 2: { cellWidth: 114 } },
        margin: { left: 14, right: 14 },
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 0) {
            const sev = opinion.riesgos[data.row.index]?.severidad;
            if (sev) data.cell.styles.fillColor = tintRGB(SEVERIDAD_RGB[sev], 0.45);
          }
        },
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    currentY = addSubheading('Lectura integral', currentY);
    currentY = addLongText(opinion.lectura_integral, currentY);

    if (opinion.condiciones_sugeridas.length > 0) {
      currentY = addSubheading('Condiciones sugeridas', currentY);
      currentY = addBulletList(opinion.condiciones_sugeridas, currentY);
    }
    if (opinion.fortalezas.length > 0) {
      currentY = addSubheading('Fortalezas', currentY);
      currentY = addBulletList(opinion.fortalezas, currentY);
    }
    if (opinion.informacion_faltante.length > 0) {
      currentY = addSubheading('Información faltante', currentY);
      currentY = addBulletList(opinion.informacion_faltante, currentY);
    }
    if (senales.length > 0) {
      currentY = addSubheading('Señales automáticas (reglas fijas)', currentY);
      autoTable(doc, {
        startY: currentY,
        body: senales.map(sg => [SEVERIDAD_LABEL[sg.severidad], `${sg.titulo}: ${sg.detalle}`]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.5, textColor: [20, 20, 20] },
        columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold', halign: 'center' }, 1: { cellWidth: 162 } },
        margin: { left: 14, right: 14 },
        didParseCell: data => {
          if (data.column.index === 0) {
            const sev = senales[data.row.index]?.severidad;
            if (sev) data.cell.styles.fillColor = tintRGB(SEVERIDAD_RGB[sev], 0.45);
          }
        },
      });
    }
  } else {
    doc.setFontSize(10);
    doc.text('Opinión de riesgos no disponible para este caso.', 14, currentY);
  }

  currentY = addSectionTitle('Historia y actividad de la empresa');
  if (companyHistory) {
    if (!companyHistory.memoria_disponible) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('No se encontró la Memoria del Directorio: la descripción surge de las Notas a los EECC.', 14, currentY);
      doc.setFont('helvetica', 'normal');
      currentY += 8;
    }
    currentY = addSubheading('Core business', currentY);
    currentY = addLongText(companyHistory.core_business || 'Sin información sobre la actividad.', currentY);

    if (companyHistory.historia) {
      currentY = addSubheading('Historia', currentY);
      currentY = addLongText(companyHistory.historia, currentY);
    }
    if (companyHistory.datos_relevantes.length > 0) {
      currentY = addSubheading('Datos relevantes', currentY);
      currentY = addBulletList(companyHistory.datos_relevantes, currentY);
    }
    if (companyHistory.proyecciones.length > 0) {
      currentY = addSubheading('Proyecciones de la empresa', currentY);
      currentY = addBulletList(companyHistory.proyecciones, currentY);
    }
    if (companyHistory.explicaciones_balance.length > 0) {
      currentY = addSubheading('Explicaciones sobre el balance', currentY);
      autoTable(doc, {
        startY: currentY,
        head: [['Tema', 'Explicación']],
        body: companyHistory.explicaciones_balance.map(e => [e.tema, e.explicacion]),
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 132 } },
        margin: { left: 14, right: 14 },
      });
    }
  } else {
    doc.setFontSize(10);
    doc.text('Historia y actividad no disponible para este caso.', 14, currentY);
  }

  currentY = addSectionTitle('Balance y Ratios');

  const ratioData = RATIO_CARDS.map(spec => {
    const r = ratios[spec.key];
    return [
      spec.name,
      formatRatioValue(r.actual, spec.format),
      statusLabel(r.status),
      spec.description,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Ratio', 'Valor', 'Estado', 'Descripción']],
    body: ratioData,
    theme: 'grid',
    headStyles: { fillColor: [20, 20, 20] },
  });
  currentY = (doc as any).lastAutoTable.finalY + 10;

  const { situacionPatrimonial, estadoResultados, indicadores } = getComparativeTablesData(extraction, ratios);

  const addComparativeTable = (title: string, tableData: Array<{ concepto: string; anio_anterior: number | string | null; anio_actual: number | string | null }>) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, currentY);
    doc.setFont('helvetica', 'normal');
    const body = tableData.map(row => [
      row.concepto,
      formatValue(row.anio_anterior),
      formatValue(row.anio_actual),
      getVariationText(row.anio_actual, row.anio_anterior),
    ]);
    autoTable(doc, {
      startY: currentY + 5,
      head: [['CONCEPTO', 'AÑO ANTERIOR', 'AÑO ACTUAL', 'VARIACIÓN (%)']],
      body,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { halign: 'right' },
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right' },
      },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
    if (currentY > 260) { doc.addPage(); currentY = 20; }
  };

  addComparativeTable('ESTADO DE SITUACIÓN PATRIMONIAL', situacionPatrimonial);
  addComparativeTable('ESTADO DE RESULTADOS', estadoResultados);
  addComparativeTable('INDICADORES Y RATIOS', indicadores);

  RATIO_BLOCKS.forEach(block => {
    const rows = block.ratios
      .map(spec => ({
        concepto: spec.name,
        anio_anterior: formatBlockCell(ratios[spec.key]?.anterior ?? null, spec.format),
        anio_actual: formatBlockCell(ratios[spec.key]?.actual ?? null, spec.format),
      }))
      .filter(row => row.anio_anterior !== null || row.anio_actual !== null);
    if (rows.length === 0) return;
    addComparativeTable(block.bloque.toUpperCase(), rows);
  });

  currentY = addSectionTitle('Accionistas y Directorio');
  const accDir = extraction.accionistas_y_directorio;
  if (accDir) {
    if (accDir.accionistas && accDir.accionistas.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Composición Accionaria', 14, currentY);
      doc.setFont('helvetica', 'normal');
      currentY += 5;

      const renderAccionistasTable = (accionistas: Shareholder[], level: number, parentName?: string) => {
        if (level > 1) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(`↳ Composición de ${parentName}`, 14 + (level - 1) * 5, currentY);
          doc.setFont('helvetica', 'normal');
          currentY += 5;
        }
        const accData = accionistas.map(a => [
          a.nombre,
          a.dni_cuit,
          a.participacion === null ? 'N/D' : `${a.participacion}%`,
        ]);
        autoTable(doc, {
          startY: currentY,
          margin: { left: 14 + (level - 1) * 5 },
          head: [['Nombre / Razón Social', 'DNI / CUIT', '% Participación']],
          body: accData,
          theme: 'grid',
          headStyles: { fillColor: level === 1 ? [20, 20, 20] : [240, 240, 240], textColor: level === 1 ? 255 : 20 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
        accionistas.forEach(a => {
          if (a.subAccionistas && a.subAccionistas.length > 0) {
            renderAccionistasTable(a.subAccionistas, level + 1, a.nombre);
          }
        });
      };
      renderAccionistasTable(accDir.accionistas as Shareholder[], 1);
    }

    if (accDir.directorio && accDir.directorio.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Directorio', 14, currentY);
      doc.setFont('helvetica', 'normal');
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Cargo', 'Nombre']],
        body: accDir.directorio.map(d => [d.cargo, d.nombre]),
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20] },
      });
    }
  } else {
    doc.setFontSize(10);
    doc.text('Información no disponible.', 14, currentY);
  }

  currentY = addSectionTitle('Mercado');
  if (marketAnalysis) {
    currentY = addMarkdownText(marketAnalysis, currentY);
  } else {
    doc.setFontSize(10);
    doc.text('Análisis de mercado no disponible.', 14, currentY);
    currentY += 10;
  }

  currentY = addSectionTitle('Información post balance');
  const post = extraction.analisis_post_cierre;
  if (post && (post.total_ventas_post_cierre ?? 0) > 0) {
    doc.setFontSize(10);
    doc.text(
      `Total Ventas Post Cierre: ${formatCurrencyThousands(post.total_ventas_post_cierre)}`,
      14,
      currentY
    );
    currentY += 10;

    if (post.detalle_ventas_mensuales && post.detalle_ventas_mensuales.length > 0) {
      const ventasData = post.detalle_ventas_mensuales.map(v => [
        v.mes,
        formatCurrencyThousands(v.monto),
        v.monto_anio_anterior ? formatCurrencyThousands(v.monto_anio_anterior) : 'N/A',
      ]);
      autoTable(doc, {
        startY: currentY,
        head: [['Mes', 'Monto Actual', 'Monto Año Anterior']],
        body: ventasData,
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    if (post.notas_relevantes) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Notas:', 14, currentY);
      doc.setFont('helvetica', 'normal');
      currentY = addLongText(post.notas_relevantes, currentY + 5);
    }
  } else {
    doc.setFontSize(10);
    doc.text('Información no disponible.', 14, currentY);
    currentY += 10;
  }

  if (post && post.deuda_bancaria_post_balance_detalle.length > 0) {
    if (currentY > 250) { doc.addPage(); currentY = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DEUDA BANCARIA ASUMIDA POST BALANCE', 14, currentY);
    doc.setFont('helvetica', 'normal');
    const deudaBody = post.deuda_bancaria_post_balance_detalle.map(item => [
      item.entidad,
      formatCurrencyThousands(item.monto, item.moneda),
    ]);
    const totalDeuda = post.deuda_bancaria_post_balance_detalle.reduce(
      (acc, curr) => acc + (Number(curr.monto) || 0),
      0
    );
    const firstCurrency = post.deuda_bancaria_post_balance_detalle[0]?.moneda || 'ARS';
    autoTable(doc, {
      startY: currentY + 5,
      head: [['ENTIDAD BANCARIA / ACREEDOR', 'MONTO ASUMIDO']],
      body: deudaBody,
      foot: [['TOTAL DEUDA POST BALANCE:', formatCurrencyThousands(totalDeuda, firstCurrency)]],
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 20] },
      footStyles: { fillColor: [240, 239, 237], textColor: [20, 20, 20], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  currentY = addSectionTitle('Sistema Financiero (Nosis)');
  const nosis = extraction.extraccion_nosis;
  if (nosis) {
    doc.setFontSize(10);
    doc.text(`Score Crediticio: ${nosis.score_crediticio}`, 14, currentY);
    doc.text(`Situación BCRA (Peor Estado): ${nosis.situacion_bcra_peor_estado}`, 14, currentY + 8);
    doc.text(
      `Cheques Rechazados: ${nosis.cheques_rechazados_cantidad} (Monto: ${formatCurrencyThousands(nosis.cheques_rechazados_monto)})`,
      14,
      currentY + 16
    );
    doc.text(
      `Deuda Financiera Total: ${formatCurrencyThousands(nosis.deuda_financiera_total_nosis)}`,
      14,
      currentY + 24
    );
    currentY += 34;

    if (nosis.detalle_entidades.length > 0) {
      const deudaTotalNosis = nosis.deuda_financiera_total_nosis ?? 0;
      const totalRef =
        deudaTotalNosis > 0
          ? deudaTotalNosis
          : nosis.detalle_entidades.reduce((acc, e) => acc + (Number(e.monto) || 0), 0);
      const entidadesData = nosis.detalle_entidades.map(e => {
        const monto = Number(e.monto) || 0;
        const participacion = totalRef > 0 ? ((monto / totalRef) * 100).toFixed(1) : '0.0';
        return [
          e.entidad || 'Desconocido',
          e.situacion?.toString() || 'N/A',
          `${formatCurrencyThousands(monto)} (${participacion}%)`,
        ];
      });
      autoTable(doc, {
        startY: currentY,
        head: [['Entidad', 'Situación', 'Monto / Participación']],
        body: entidadesData,
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20] },
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }
  } else {
    doc.setFontSize(10);
    doc.text('Información no disponible.', 14, currentY);
  }

  if (crossCheck && crossCheck.nosis_debt !== null) {
    if (currentY > 250) { doc.addPage(); currentY = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Cruce de Deuda (Balance vs Nosis)', 14, currentY);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: currentY + 5,
      head: [['Métrica', 'Valor']],
      body: [
        ['Deuda en Balance', formatCurrencyThousands(crossCheck.balance_debt)],
        ['Deuda en Nosis', formatCurrencyThousands(crossCheck.nosis_debt)],
        ['Diferencia', crossCheck.difference_abs !== null ? formatCurrencyThousands(crossCheck.difference_abs) : '-'],
        ['Estado', crossCheck.match ? 'Consistente' : 'Discrepancia Detectada'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 20] },
    });
  }

  doc.save(`Reporte_Riesgo_${company.name || 'Empresa'}.pdf`);
};

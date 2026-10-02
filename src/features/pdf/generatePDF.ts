import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getComparativeTablesData, formatValue, getVariationText } from '../../components/ComparativeView';
import { ExtractionResult, Shareholder } from '../../types';
import { formatCurrencyThousands } from '../../lib/utils';
import { ComputedRatios, RatioStatus } from '../ratios/calculations';

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

export const generatePDF = (activeResult: ExtractionResult | null | undefined) => {
  if (!activeResult || !activeResult.extraction || !activeResult.ratios) return;

  const doc = new jsPDF();
  const extraction = activeResult.extraction;
  const ratios = activeResult.ratios;
  const verification = activeResult.verification;
  const crossCheck = activeResult.crossCheck;
  const marketAnalysis = activeResult.marketAnalysis;
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

  let currentY = addSectionTitle('Balance y Ratios');

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

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getComparativeTablesData, formatValue, getVariationText } from '../../components/ComparativeView';
import { ExtractionResult, Shareholder } from '../../types';
import { formatCurrencyThousands } from '../../lib/utils';

export const generatePDF = (activeResult: ExtractionResult | null | undefined) => {
    if (!activeResult || !activeResult.dashboardData || !activeResult.data) return;

    const doc = new jsPDF();
    const company = activeResult.dashboardData.company_profile || { name: '', cuit: '', activity: '', anio_actual: '', anio_anterior: '' };
    const data = activeResult.data;
    const dashboard = activeResult.dashboardData;

    // Helper to add new page and title
    const addSectionTitle = (title: string, isFirstPage = false) => {
      if (!isFirstPage) {
        doc.addPage();
      }
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(title, 14, 22);
      doc.setFont("helvetica", "normal");
      return 30; // Return Y position after title
    };

    // Helper to add long text with auto page breaks and justify
    const addLongText = (text: string, startY: number) => {
      const cleanText = text.replace(/[*_#]/g, '');
      autoTable(doc, {
        startY: startY,
        body: [[cleanText]],
        theme: 'plain',
        styles: {
          halign: 'justify',
          fontSize: 10,
          cellPadding: 0,
          textColor: [20, 20, 20]
        },
        columnStyles: {
          0: { cellWidth: 182 }
        },
        margin: { left: 14, right: 14 }
      });
      return (doc as any).lastAutoTable.finalY + 10;
    };

    // Helper to render markdown-like text
    const addMarkdownText = (text: string, startY: number) => {
      let currentY = startY;
      const paragraphs = text.split('\n');

      paragraphs.forEach(p => {
        const trimmed = p.trim();
        if (!trimmed) return;

        if (trimmed.startsWith('### ')) {
          currentY += 10;
          if (currentY > 260) { doc.addPage(); currentY = 20; }
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          const titleText = doc.splitTextToSize(trimmed.replace('### ', ''), 180);
          doc.text(titleText, 14, currentY);
          currentY += titleText.length * 5 + 5;
        } else if (trimmed.startsWith('## ')) {
          currentY += 12;
          if (currentY > 260) { doc.addPage(); currentY = 20; }
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          const titleText = doc.splitTextToSize(trimmed.replace('## ', ''), 180);
          doc.text(titleText, 14, currentY);
          currentY += titleText.length * 6 + 5;
        } else if (trimmed.startsWith('# ')) {
          currentY += 14;
          if (currentY > 260) { doc.addPage(); currentY = 20; }
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          const titleText = doc.splitTextToSize(trimmed.replace('# ', ''), 180);
          doc.text(titleText, 14, currentY);
          currentY += titleText.length * 7 + 5;
        } else {
          // Clean bold/italic markers for plain text
          let cleanLine = trimmed.replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '').replace(/_/g, '');
          // Clean links [text](url) -> text (url)
          cleanLine = cleanLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");

          // Split text to lines to calculate exact height
          const lines = doc.splitTextToSize(cleanLine, 182);

          // Check if we need a page break before drawing
          if (currentY + (lines.length * 5) > 280) {
            doc.addPage();
            currentY = 20;
          }

          // Draw justified text
          doc.text(cleanLine, 14, currentY, { align: 'justify', maxWidth: 182 });

          // Update currentY based on the number of lines drawn
          currentY += lines.length * 5 + 5;
        }
      });
      return currentY;
    };

    // Título
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text('Reporte de Riesgo para Comité', 14, 22);

    // Información de la Empresa
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Empresa: ${company.name || 'N/A'}`, 14, 32);
    doc.text(`CUIT: ${company.cuit || 'N/A'}`, 14, 40);
    doc.text(`Actividad: ${company.activity || 'N/A'}`, 14, 48);

    // Resumen Ejecutivo
    if (dashboard.executive_summary) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text('Resumen Ejecutivo', 14, 60);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      addLongText(dashboard.executive_summary, 65);
    }

    // Balance y Ratios
    let currentY = addSectionTitle('Balance y Ratios');

    if (dashboard.ratios && dashboard.ratios.length > 0) {
      const ratioData = dashboard.ratios.map(r => [
        r.name,
        typeof r.value === 'number' ? r.value.toFixed(2) : r.value,
        r.status === 'healthy' ? 'Saludable' : r.status === 'alert' ? 'Alerta' : 'Crítico',
        r.description || ''
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Ratio', 'Valor', 'Estado', 'Descripción']],
        body: ratioData,
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20] }
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    const { situacionPatrimonial, estadoResultados, indicadores } = getComparativeTablesData(data, dashboard.motor_de_ratios);

    const addComparativeTable = (title: string, tableData: any[]) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 14, currentY);
      doc.setFont('helvetica', 'normal');

      const body = tableData.map(row => [
        row.concepto,
        formatValue(row.anio_anterior),
        formatValue(row.anio_actual),
        getVariationText(row.anio_actual, row.anio_anterior)
      ]);

      autoTable(doc, {
        startY: currentY + 5,
        head: [['CONCEPTO', 'AÑO ANTERIOR', 'AÑO ACTUAL', 'VARIACIÓN (%)']],
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { halign: 'right' },
          2: { halign: 'right', fontStyle: 'bold' },
          3: { halign: 'right' }
        }
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;

      if (currentY > 260) {
         doc.addPage();
         currentY = 20;
      }
    };

    addComparativeTable('ESTADO DE SITUACIÓN PATRIMONIAL', situacionPatrimonial);
    addComparativeTable('ESTADO DE RESULTADOS', estadoResultados);
    addComparativeTable('INDICADORES Y RATIOS', indicadores);

    // Accionistas y Directorio
    currentY = addSectionTitle('Accionistas y Directorio');
    if (dashboard.accionistas_y_directorio) {
      if (dashboard.accionistas_y_directorio.accionistas && dashboard.accionistas_y_directorio.accionistas.length > 0) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text('Composición Accionaria', 14, currentY);
        doc.setFont("helvetica", "normal");
        currentY += 5;

        const renderAccionistasTable = (accionistas: Shareholder[], level: number, parentName?: string) => {
          if (level > 1) {
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text(`↳ Composición de ${parentName}`, 14 + (level - 1) * 5, currentY);
            doc.setFont("helvetica", "normal");
            currentY += 5;
          }

          const accData = accionistas.map(a => [
            a.nombre,
            a.dni_cuit,
            `${a.participacion}%`
          ]);

          autoTable(doc, {
            startY: currentY,
            margin: { left: 14 + (level - 1) * 5 },
            head: [['Nombre / Razón Social', 'DNI / CUIT', '% Participación']],
            body: accData,
            theme: 'grid',
            headStyles: { fillColor: level === 1 ? [20, 20, 20] : [240, 240, 240], textColor: level === 1 ? 255 : 20 }
          });
          currentY = (doc as any).lastAutoTable.finalY + 10;

          accionistas.forEach(a => {
            if (a.subAccionistas && a.subAccionistas.length > 0) {
              renderAccionistasTable(a.subAccionistas, level + 1, a.nombre);
            }
          });
        };

        renderAccionistasTable(dashboard.accionistas_y_directorio.accionistas, 1);
      }

      if (dashboard.accionistas_y_directorio.directorio && dashboard.accionistas_y_directorio.directorio.length > 0) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text('Directorio', 14, currentY);
        doc.setFont("helvetica", "normal");

        const dirData = dashboard.accionistas_y_directorio.directorio.map(d => [
          d.cargo,
          d.nombre
        ]);

        autoTable(doc, {
          startY: currentY + 5,
          head: [['Cargo', 'Nombre']],
          body: dirData,
          theme: 'grid',
          headStyles: { fillColor: [20, 20, 20] }
        });
      }
    } else {
      doc.setFontSize(10);
      doc.text('Información no disponible.', 14, currentY);
    }

    // Historia y actividad de la empresa
    currentY = addSectionTitle('Historia y actividad de la empresa');
    doc.setFontSize(10);
    doc.text('Sección en desarrollo', 14, currentY);

    // Mercado
    currentY = addSectionTitle('Mercado');
    if (dashboard.analisis_mercado) {
      currentY = addMarkdownText(dashboard.analisis_mercado, currentY);
    } else {
      doc.setFontSize(10);
      doc.text('Sección en desarrollo', 14, currentY);
      currentY += 10;
    }

    // Información post balance
    currentY = addSectionTitle('Información post balance');
    if (data.analisis_post_cierre && data.analisis_post_cierre.total_ventas_post_cierre > 0) {
      doc.setFontSize(10);
      doc.text(`Total Ventas Post Cierre: ${formatCurrencyThousands(data.analisis_post_cierre.total_ventas_post_cierre)}`, 14, currentY);
      currentY += 10;

      if (data.analisis_post_cierre.detalle_ventas_mensuales && data.analisis_post_cierre.detalle_ventas_mensuales.length > 0) {
        const ventasData = data.analisis_post_cierre.detalle_ventas_mensuales.map(v => [
          v.mes,
          formatCurrencyThousands(v.monto),
          v.monto_anio_anterior ? formatCurrencyThousands(v.monto_anio_anterior) : 'N/A'
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Mes', 'Monto Actual', 'Monto Año Anterior']],
          body: ventasData,
          theme: 'grid',
          headStyles: { fillColor: [20, 20, 20] }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      if (data.analisis_post_cierre.notas_relevantes) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Notas:`, 14, currentY);
        doc.setFont("helvetica", "normal");
        currentY = addLongText(data.analisis_post_cierre.notas_relevantes, currentY + 5);
      }
    } else {
      doc.setFontSize(10);
      doc.text('Información no disponible.', 14, currentY);
      currentY += 10;
    }

    // Deuda Bancaria Asumida Post Balance
    if (data.analisis_post_cierre && Array.isArray(data.analisis_post_cierre.deuda_bancaria_post_balance_detalle) && data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.length > 0) {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text('DEUDA BANCARIA ASUMIDA POST BALANCE', 14, currentY);
      doc.setFont("helvetica", "normal");

      const deudaBody = data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.map((item: any) => [
        item.entidad,
        formatCurrencyThousands(item.monto, item.moneda)
      ]);

      const totalDeuda = data.analisis_post_cierre.deuda_bancaria_post_balance_detalle.reduce((acc: number, curr: any) => acc + (Number(curr.monto) || 0), 0);
      const firstCurrency = data.analisis_post_cierre.deuda_bancaria_post_balance_detalle[0]?.moneda || 'ARS';

      autoTable(doc, {
        startY: currentY + 5,
        head: [['ENTIDAD BANCARIA / ACREEDOR', 'MONTO ASUMIDO']],
        body: deudaBody,
        foot: [['TOTAL DEUDA POST BALANCE:', formatCurrencyThousands(totalDeuda, firstCurrency)]],
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20] },
        footStyles: { fillColor: [240, 239, 237], textColor: [20, 20, 20], fontStyle: 'bold' },
        columnStyles: {
          1: { halign: 'right' }
        }
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Proyecciones
    currentY = addSectionTitle('Proyecciones');
    if (dashboard.sales_analysis && dashboard.sales_analysis.projection_text) {
      currentY = addLongText(dashboard.sales_analysis.projection_text, currentY);
    } else {
      doc.setFontSize(10);
      doc.text('Información no disponible.', 14, currentY);
    }

    // Opinión de riesgos
    currentY = addSectionTitle('Opinión de riesgos');
    doc.setFontSize(10);
    doc.text('Sección en desarrollo', 14, currentY);

    // Sistema Financiero (Nosis)
    currentY = addSectionTitle('Sistema Financiero (Nosis)');
    if (dashboard.extraccion_nosis) {
      const nosis = dashboard.extraccion_nosis;
      doc.setFontSize(10);
      doc.text(`Score Crediticio: ${nosis.score_crediticio}`, 14, currentY);
      doc.text(`Situación BCRA (Peor Estado): ${nosis.situacion_bcra_peor_estado}`, 14, currentY + 8);
      doc.text(`Cheques Rechazados: ${nosis.cheques_rechazados_cantidad} (Monto: ${formatCurrencyThousands(nosis.cheques_rechazados_monto)})`, 14, currentY + 16);
      doc.text(`Deuda Financiera Total: ${formatCurrencyThousands(nosis.deuda_financiera_total_nosis)}`, 14, currentY + 24);

      currentY += 34;

      if (Array.isArray(nosis.detalle_entidades) && nosis.detalle_entidades.length > 0) {
        const totalDeudaNosis = nosis.deuda_financiera_total_nosis || 0;
        const totalSuma = nosis.detalle_entidades.reduce((acc, curr) => acc + (Number(curr?.monto) || 0), 0);
        const totalReferencia = totalDeudaNosis > 0 ? totalDeudaNosis : totalSuma;

        const entidadesData = nosis.detalle_entidades.map(e => {
          const monto = Number(e?.monto) || 0;
          const participacion = totalReferencia > 0 ? ((monto / totalReferencia) * 100).toFixed(1) : "0.0";
          return [
            e?.entidad || 'Desconocido',
            e?.situacion?.toString() || 'N/A',
            `${formatCurrencyThousands(monto)} (${participacion}%)`
          ];
        });

        autoTable(doc, {
          startY: currentY,
          head: [['Entidad', 'Situación', 'Monto / Participación']],
          body: entidadesData,
          theme: 'grid',
          headStyles: { fillColor: [20, 20, 20] }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      }
    } else {
      doc.setFontSize(10);
      doc.text('Información no disponible.', 14, currentY);
    }

    // Cruce Nosis vs Balance
    if (dashboard.cross_check) {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text('Cruce de Deuda (Balance vs Nosis)', 14, currentY);
      doc.setFont("helvetica", "normal");

      autoTable(doc, {
        startY: currentY + 5,
        head: [['Métrica', 'Valor']],
        body: [
          ['Deuda en Balance', formatCurrencyThousands(dashboard.cross_check.balance_debt)],
          ['Deuda en Nosis', formatCurrencyThousands(dashboard.cross_check.nosis_debt)],
          ['Diferencia', formatCurrencyThousands(dashboard.cross_check.difference)],
          ['Estado', dashboard.cross_check.match ? 'Consistente' : 'Discrepancia Detectada']
        ],
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20] }
      });
    }

    doc.save(`Reporte_Riesgo_${company.name || 'Empresa'}.pdf`);
};

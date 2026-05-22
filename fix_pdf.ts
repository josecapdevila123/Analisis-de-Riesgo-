import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const pdfStart = content.indexOf('const generatePDF = () => {');
const pdfEnd = content.indexOf('doc.save(`Reporte_Riesgo_${company.name || \'Empresa\'}.pdf`);', pdfStart) + 60;

const newPdf = `const generatePDF = () => {
    if (!activeResult || !activeResult.dashboardData || !activeResult.data) return;

    const doc = new jsPDF();
    const company = activeResult.dashboardData.company_profile || {};
    const data = activeResult.data;
    const dashboard = activeResult.dashboardData;
    const currentYear = data?.hoja_estado_situacion_patrimonial?.ejercicio_actual;
    const prevYear = data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior;

    // Header / Cover
    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Reporte de Riesgo Crediticio", 20, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(\`Generado el: \${new Date().toLocaleDateString()}\`, 20, 30);
    doc.text("Valores expresados en miles de pesos", 20, 35);

    // Company Info
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(company.name || "EMPRESA NO IDENTIFICADA", 20, 60);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(\`CUIT: \${company.cuit || "N/A"}\`, 20, 70);
    doc.text(\`Actividad: \${company.activity || "N/A"}\`, 20, 76);

    if (currentYear && prevYear) {
      // Summary Table (Comparative)
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Resumen Patrimonial Comparativo", 20, 95);

      autoTable(doc, {
        startY: 100,
        head: [['Concepto', String(company.anio_actual || 'Actual'), String(company.anio_anterior || 'Anterior')]],
        body: [
          ['Total Activo', 
            formatCurrencyThousands(currentYear?.activo?.total_del_activo),
            formatCurrencyThousands(prevYear?.activo?.total_del_activo)
          ],
          ['Total Pasivo', 
            formatCurrencyThousands(currentYear?.pasivo?.total_del_pasivo),
            formatCurrencyThousands(prevYear?.pasivo?.total_del_pasivo)
          ],
          ['Patrimonio Neto', 
            formatCurrencyThousands(currentYear?.patrimonio_neto_total),
            formatCurrencyThousands(prevYear?.patrimonio_neto_total)
          ],
          ['Resultado del Ejercicio', 
            formatCurrencyThousands(data?.hoja_estado_resultados?.ejercicio_actual?.resultado_del_ejercicio_final),
            formatCurrencyThousands(data?.hoja_estado_resultados?.ejercicio_anterior?.resultado_del_ejercicio_final)
          ]
        ],
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { font: 'helvetica', fontSize: 10, cellPadding: 5 },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right' },
          2: { halign: 'right' }
        }
      });
    }

    // Ratios Section
    if (dashboard.ratios && dashboard.ratios.length > 0) {
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Análisis de Ratios", 20, 20);

      autoTable(doc, {
        startY: 30,
        head: [['Ratio', 'Valor', 'Interpretación']],
        body: dashboard.ratios.map(r => [
          r.name, 
          r.value.toString(), 
          r.interpretation
        ]),
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255] },
        styles: { font: 'helvetica', fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold' },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 'auto' }
        }
      });
    }

    // Nosis Section
    if (dashboard.extraccion_nosis) {
      const nosis = dashboard.extraccion_nosis;
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Información Sistema Financiero (Nosis)", 20, 20);

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(\`Score Crediticio: \${nosis.score_crediticio || 'N/A'}\`, 20, 35);
      doc.text(\`Peor Situación BCRA: \${nosis.peor_situacion_bcra || 'N/A'}\`, 20, 42);
      doc.text(\`Total Deuda Sistema: \${formatCurrencyThousands(nosis.total_deuda_sistema)}\`, 20, 49);

      if (nosis.detalle_entidades && nosis.detalle_entidades.length > 0) {
        autoTable(doc, {
          startY: 60,
          head: [['Entidad', 'Situación', 'Monto']],
          body: nosis.detalle_entidades.map(e => [e.entidad, e.situacion.toString(), formatCurrencyThousands(e.monto)]),
          theme: 'grid',
          headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255] }
        });
      }
    }

    doc.save(\`Reporte_Riesgo_\${company.name || 'Empresa'}.pdf\`);`;

const newContent = content.substring(0, pdfStart) + newPdf + content.substring(pdfEnd);
fs.writeFileSync('src/App.tsx', newContent);
console.log("Fixed PDF generation");

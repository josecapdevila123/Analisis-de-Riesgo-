import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const evaluationLogic = `
  const evaluateVariation = (variation: number | null): 'healthy' | 'alert' | 'critical' => {
    if (variation === null) return 'alert';
    if (variation > 0) return 'healthy';
    if (variation > -5) return 'alert';
    return 'critical';
  };

  const evaluateRatio = (name: string, value: number | string): 'healthy' | 'alert' | 'critical' => {
    if (typeof value !== 'number') return 'alert';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('liquidez')) {
      if (value > 1.2) return 'healthy';
      if (value >= 1) return 'alert';
      return 'critical';
    }
    if (lowerName.includes('deuda / ebitda') || lowerName.includes('deuda/ebitda')) {
      if (value < 2) return 'healthy';
      if (value <= 3.5) return 'alert';
      return 'critical';
    }
    if (lowerName.includes('solvencia')) {
      if (value > 1.5) return 'healthy';
      if (value >= 1) return 'alert';
      return 'critical';
    }
    if (lowerName.includes('ebitda / intereses')) {
      if (value > 3) return 'healthy';
      if (value >= 1.5) return 'alert';
      return 'critical';
    }
    return 'healthy';
  };
`;

content = content.replace('const calculateVariation =', evaluationLogic + '\n  const calculateVariation =');

// Update Row 1 (New KPIs)
// Add StatusBadge to VENTAS
content = content.replace(
  /<p className="text-\[10px\] font-sans font-bold text-\[#141414\] uppercase mb-2">VENTAS<\/p>/g,
  `<div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateVariation(calculateVariation(
                            activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas || 0,
                            activeResult.data?.hoja_estado_resultados?.ejercicio_anterior?.ventas_netas || 0
                          ))} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">VENTAS</p>`
);

// Add StatusBadge to EBITDA
content = content.replace(
  /<p className="text-\[10px\] font-sans font-bold text-\[#141414\] uppercase mb-2">EBITDA<\/p>/g,
  `<div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateVariation(calculateVariation(
                            (activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined) ? activeResult.dashboardData.motor_de_ratios.ebitda : (calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual) || 0),
                            calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_anterior, activeResult.data?.hoja_flujo_efectivo?.ejercicio_anterior) || 0
                          ))} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">EBITDA</p>`
);

// Add StatusBadge to DEUDA BANCARIA TOTAL
content = content.replace(
  /<p className="text-\[10px\] font-sans font-bold text-\[#141414\] uppercase mb-2">DEUDA BANCARIA TOTAL<\/p>/g,
  `<div className="absolute top-4 right-4">
                          <StatusBadge status={evaluateRatio('deuda / ebitda', activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_ebitda !== 'N/A' ? (activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_ebitda || 0) : 0)} />
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">DEUDA BANCARIA TOTAL</p>`
);

// Add StatusBadge to DEUDA CORTO PLAZO
content = content.replace(
  /<p className="text-\[10px\] font-sans font-bold text-\[#141414\] uppercase mb-2">DEUDA CORTO PLAZO<\/p>/g,
  `<div className="absolute top-4 right-4">
                          {(() => {
                            const deudaCPActual = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.pasivo_corriente);
                            const deudaCPAnterior = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.pasivo?.pasivo_corriente);
                            return <StatusBadge status={evaluateVariation(calculateVariation(deudaCPActual || 0, deudaCPAnterior || 0))} />;
                          })()}
                        </div>
                        <p className="text-[10px] font-sans font-bold text-[#141414] uppercase mb-2">DEUDA CORTO PLAZO</p>`
);

// Update typography sizes
// Main values: text-2xl -> text-3xl
content = content.replace(/className="text-2xl font-bold font-sans mb-2 text-\[#141414\]"/g, 'className="text-3xl font-bold font-sans mb-2 text-[#141414]"');

// Subtitles/Descriptions: text-[10px] opacity-60 -> text-xs text-gray-600
content = content.replace(/className="flex items-center text-\[10px\] font-sans font-bold opacity-60 leading-tight"/g, 'className="flex items-center text-xs font-sans font-bold text-gray-600 leading-tight"');
content = content.replace(/className="text-\[10px\] font-sans font-bold opacity-60 leading-tight"/g, 'className="text-xs font-sans font-bold text-gray-600 leading-tight"');

// For the original KPI row, update the StatusBadge to use the evaluateRatio function
content = content.replace(
  /<StatusBadge status=\{ratio\.status\} \/>/g,
  `<StatusBadge status={evaluateRatio(ratio.name, ratio.value)} />`
);

fs.writeFileSync('src/App.tsx', content);
console.log("Updated KPIs");

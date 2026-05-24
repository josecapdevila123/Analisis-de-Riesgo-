import React from 'react';
import { FinancialData, MotorDeRatios } from '../types';
import { calculateEBITDA } from '../features/ratios/calculations';

interface ComparativeViewProps {
  json_extraccion?: FinancialData | null;
  json_ratios?: MotorDeRatios | null;
}

export const formatValue = (value: number | null | undefined | string) => {
  if (value === null || value === undefined || value === 'N/A') return '-';
  if (typeof value === 'string') return value;
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 2
  }).format(value);
};

export const getVariationText = (actual: number | null | undefined | string, anterior: number | null | undefined | string): string => {
  if (
    actual === null || actual === undefined || actual === 'N/A' || 
    anterior === null || anterior === undefined || anterior === 'N/A' || anterior === 0
  ) return '-';
  
  const numActual = typeof actual === 'string' ? parseFloat(actual) : actual;
  const numAnterior = typeof anterior === 'string' ? parseFloat(anterior) : anterior;
  
  if (isNaN(numActual) || isNaN(numAnterior)) return '-';
  
  const variation = ((numActual - numAnterior) / Math.abs(numAnterior)) * 100;
  if (variation === 0) return '0.0%';
  const isPositive = variation > 0;
  const formatted = Math.abs(variation).toFixed(1) + '%';
  return (isPositive ? '+' : '-') + formatted;
};

const calculateVariation = (actual: number | null | undefined | string, anterior: number | null | undefined | string) => {
  const text = getVariationText(actual, anterior);
  if (text === '-') return <span className="text-gray-500">-</span>;
  
  const isPositive = text.startsWith('+');
  const isZero = text === '0.0%';
  
  return (
    <span className={isZero ? 'text-gray-500' : isPositive ? 'text-green-600' : 'text-red-600'}>
      {text}
    </span>
  );
};

interface TableProps {
  title: string;
  data: Array<{
    concepto: string;
    anio_anterior: number | string | null;
    anio_actual: number | string | null;
  }>;
}

const Table = ({ title, data }: TableProps) => (
  <div className="bg-white border border-[#141414] rounded-sm mb-8 overflow-hidden max-w-full print:break-inside-avoid shadow-sm">
    <div className="bg-[#FAFAFA] border-b border-[#141414]/10 px-4 py-3">
      <h3 className="text-lg font-bold text-[#141414] uppercase tracking-widest">{title}</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left font-mono">
        <thead className="bg-[#F0EFED] text-[#141414] uppercase text-xs border-b border-[#141414]/10">
          <tr>
            <th className="px-4 py-3 text-left w-2/5 font-bold tracking-wider">CONCEPTO</th>
            <th className="px-4 py-3 text-right font-bold tracking-wider">AÑO ANTERIOR</th>
            <th className="px-4 py-3 text-right font-bold tracking-wider">AÑO ACTUAL</th>
            <th className="px-4 py-3 text-right font-bold tracking-wider">VARIACIÓN (%)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#141414]/5 bg-white">
          {data.map((row, index) => (
            <tr key={index} className="hover:bg-[#141414]/5 transition-colors">
              <td className="px-4 py-3 font-semibold text-[#141414] text-left">{row.concepto}</td>
              <td className="px-4 py-3 text-right text-[#141414]/70">{formatValue(row.anio_anterior)}</td>
              <td className="px-4 py-3 text-right text-[#141414] font-bold">{formatValue(row.anio_actual)}</td>
              <td className="px-4 py-3 text-right font-medium">{calculateVariation(row.anio_actual, row.anio_anterior)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export function getComparativeTablesData(json_extraccion: FinancialData | null | undefined, json_ratios: MotorDeRatios | null | undefined) {
  // Safe helper para extraer datos de json_extraccion
  const anteriorSit = json_extraccion?.hoja_estado_situacion_patrimonial?.ejercicio_anterior;
  const actualSit = json_extraccion?.hoja_estado_situacion_patrimonial?.ejercicio_actual;

  // TABLA 1: SITUACION PATRIMONIAL
  const situacionPatrimonial = [
    { 
      concepto: 'Activo Corriente', 
      anio_anterior: anteriorSit?.activo?.activo_corriente?.total ?? null, 
      anio_actual: actualSit?.activo?.activo_corriente?.total ?? null 
    },
    { 
      concepto: 'Activo No Corriente', 
      anio_anterior: anteriorSit?.activo?.activo_no_corriente?.total ?? null, 
      anio_actual: actualSit?.activo?.activo_no_corriente?.total ?? null 
    },
    { 
      concepto: 'Activo Total', 
      anio_anterior: anteriorSit?.activo?.total_del_activo ?? null, 
      anio_actual: actualSit?.activo?.total_del_activo ?? null 
    },
    { 
      concepto: 'Pasivo Corriente', 
      anio_anterior: anteriorSit?.pasivo?.pasivo_corriente?.total ?? null, 
      anio_actual: actualSit?.pasivo?.pasivo_corriente?.total ?? null 
    },
    { 
      concepto: 'Pasivo No Corriente', 
      anio_anterior: anteriorSit?.pasivo?.pasivo_no_corriente?.total ?? null, 
      anio_actual: actualSit?.pasivo?.pasivo_no_corriente?.total ?? null 
    },
    { 
      concepto: 'Pasivo Total', 
      anio_anterior: anteriorSit?.pasivo?.total_del_pasivo ?? null, 
      anio_actual: actualSit?.pasivo?.total_del_pasivo ?? null 
    },
    { 
      concepto: 'Patrimonio Neto', 
      anio_anterior: anteriorSit?.patrimonio_neto_total ?? null, 
      anio_actual: actualSit?.patrimonio_neto_total ?? null 
    }
  ];

  const anteriorRes = json_extraccion?.hoja_estado_resultados?.ejercicio_anterior;
  const actualRes = json_extraccion?.hoja_estado_resultados?.ejercicio_actual;

  // Fallback matemático si el motor LLM no obtuvo el EBITDA del año anterior
  const fbEbitdaAnterior = calculateEBITDA(anteriorRes, json_extraccion?.hoja_flujo_efectivo?.ejercicio_anterior);

  const fbLiquidezAnterior = (anteriorSit?.activo?.activo_corriente?.total && anteriorSit?.pasivo?.pasivo_corriente?.total) 
    ? (anteriorSit.activo.activo_corriente.total / anteriorSit.pasivo.pasivo_corriente.total) 
    : null;
    
  const fbEndeudamientoAnterior = (anteriorSit?.pasivo?.total_del_pasivo && anteriorSit?.patrimonio_neto_total)
    ? (anteriorSit.pasivo.total_del_pasivo / anteriorSit.patrimonio_neto_total)
    : null;
    
  const fbCapitalTrabajoAnterior = (anteriorSit?.activo?.activo_corriente?.total && anteriorSit?.pasivo?.pasivo_corriente?.total)
    ? (anteriorSit.activo.activo_corriente.total - anteriorSit.pasivo.pasivo_corriente.total)
    : null;
    
  const fbRentabilidadAnterior = (anteriorRes?.resultado_del_ejercicio_final && anteriorSit?.patrimonio_neto_total)
    ? (anteriorRes.resultado_del_ejercicio_final / anteriorSit.patrimonio_neto_total)
    : null;

  const ventasNetas = {
    concepto: 'Ventas Netas',
    anio_anterior: anteriorRes?.ventas_netas ?? null,
    anio_actual: actualRes?.ventas_netas ?? null
  };

  const fallbackEbitdaJson = json_ratios?.ebitda_anterior && json_ratios.ebitda_anterior !== 'N/A' 
          ? json_ratios.ebitda_anterior 
          : fbEbitdaAnterior;

  const ebitda = {
    concepto: 'EBITDA (Calculado)',
    anio_anterior: fallbackEbitdaJson,
    anio_actual: json_ratios?.ebitda && json_ratios.ebitda !== 'N/A' ? json_ratios.ebitda : null
  };

  const resultadosFinancieros = {
    concepto: 'Resultados Financieros',
    anio_anterior: anteriorRes?.resultado_financiero_y_por_tenencia ?? null,
    anio_actual: actualRes?.resultado_financiero_y_por_tenencia ?? null
  };

  const resultadoBruto = {
    concepto: 'Resultado Bruto',
    anio_anterior: anteriorRes?.resultado_bruto ?? null,
    anio_actual: actualRes?.resultado_bruto ?? null
  };

  const resultadoOrdinario = {
    concepto: 'Resultado Ordinario',
    anio_anterior: anteriorRes?.resultado_ordinario ?? null,
    anio_actual: actualRes?.resultado_ordinario ?? null
  };

  const resultadoNeto = {
    concepto: 'Resultado del Ejercicio',
    anio_anterior: anteriorRes?.resultado_del_ejercicio_final ?? null,
    anio_actual: actualRes?.resultado_del_ejercicio_final ?? null
  };

  const estadoResultados = [
    ventasNetas,
    resultadoBruto,
    ebitda,
    resultadoOrdinario,
    resultadosFinancieros,
    resultadoNeto
  ];

  const indicadores = [
    {
      concepto: 'Liquidez Corriente',
      anio_anterior: json_ratios?.liquidez_anterior && json_ratios.liquidez_anterior !== 'N/A' ? json_ratios.liquidez_anterior : fbLiquidezAnterior,
      anio_actual: json_ratios?.liquidez ?? null
    },
    {
      concepto: 'Prueba Ácida',
      anio_anterior: json_ratios?.liquidez_acida_anterior !== 'N/A' ? json_ratios?.liquidez_acida_anterior : null,
      anio_actual: json_ratios?.liquidez_acida ?? null
    },
    {
      concepto: 'Endeudamiento Total',
      anio_anterior: json_ratios?.endeudamiento_anterior && json_ratios.endeudamiento_anterior !== 'N/A' ? json_ratios.endeudamiento_anterior : fbEndeudamientoAnterior,
      anio_actual: json_ratios?.endeudamiento ?? null
    },
    {
      concepto: 'Capital de Trabajo',
      anio_anterior: json_ratios?.capital_de_trabajo_anterior && json_ratios.capital_de_trabajo_anterior !== 'N/A' ? json_ratios.capital_de_trabajo_anterior : fbCapitalTrabajoAnterior,
      anio_actual: json_ratios?.capital_de_trabajo ?? null
    },
    {
      concepto: 'Rentabilidad',
      anio_anterior: json_ratios?.rentabilidad_anterior && json_ratios.rentabilidad_anterior !== 'N/A' 
        ? (json_ratios.rentabilidad_anterior * 100).toFixed(2) + '%' 
        : (fbRentabilidadAnterior ? ((fbRentabilidadAnterior * 100).toFixed(2) + '%') : null),
      anio_actual: json_ratios?.rentabilidad !== 'N/A' && json_ratios?.rentabilidad 
        ? (json_ratios.rentabilidad * 100).toFixed(2) + '%' 
        : null
    }
  ];

  return { situacionPatrimonial, estadoResultados, indicadores };
}

export function ComparativeView({
  json_extraccion,
  json_ratios
}: ComparativeViewProps) {
  const [isVerticalAnalysis, setIsVerticalAnalysis] = React.useState(false);
  
  const { situacionPatrimonial, estadoResultados, indicadores } = getComparativeTablesData(json_extraccion, json_ratios);

  const totalActivoAnterior = json_extraccion?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.activo?.total_del_activo || null;
  const totalActivoActual = json_extraccion?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.activo?.total_del_activo || null;

  const ventasAnterior = json_extraccion?.hoja_estado_resultados?.ejercicio_anterior?.ventas_netas || null;
  const ventasActual = json_extraccion?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas || null;

  const getVerticalValue = (value: number | string | null, base: number | null) => {
    if (value === null || value === undefined || value === 'N/A' || base === null || base === 0) return null;
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return null;
    return (numValue / base) * 100;
  };

  const formatVertical = (val: number | null) => {
    if (val === null) return null;
    return val.toFixed(1) + '%';
  };

  const processData = (data: any[], baseAnterior: number | null, baseActual: number | null) => {
    if (!isVerticalAnalysis) return data;
    return data.map(item => ({
      ...item,
      anio_anterior: formatVertical(getVerticalValue(item.anio_anterior, baseAnterior)) ?? item.anio_anterior,
      anio_actual: formatVertical(getVerticalValue(item.anio_actual, baseActual)) ?? item.anio_actual
    }));
  };

  const renderSituacion = processData(situacionPatrimonial, totalActivoAnterior, totalActivoActual);
  const renderResultados = processData(estadoResultados, ventasAnterior, ventasActual);

  return (
    <div className="font-['Poppins']">
      <div className="flex justify-end mb-6">
        <div className="inline-flex bg-[#F0EFED] p-1 rounded-sm border border-[#141414]/10">
          <button
            onClick={() => setIsVerticalAnalysis(false)}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${!isVerticalAnalysis ? 'bg-white shadow-sm text-[#141414]' : 'text-[#141414]/50 hover:text-[#141414]'}`}
          >
            $ Valores Absolutos
          </button>
          <button
            onClick={() => setIsVerticalAnalysis(true)}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${isVerticalAnalysis ? 'bg-white shadow-sm text-[#141414]' : 'text-[#141414]/50 hover:text-[#141414]'}`}
          >
            % Análisis Vertical
          </button>
        </div>
      </div>
      <div>
        <Table title="ESTADO DE SITUACIÓN PATRIMONIAL" data={renderSituacion} />
        <Table title="ESTADO DE RESULTADOS" data={renderResultados} />
        <Table title="INDICADORES Y RATIOS" data={indicadores} />
      </div>
    </div>
  );
}

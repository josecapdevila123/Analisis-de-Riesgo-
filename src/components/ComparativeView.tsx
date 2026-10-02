import React from 'react';
import { RawExtraction } from '../features/extraction/schemas';
import { ComputedRatios } from '../features/ratios/calculations';
import { EditableNumber, Path, useEdit } from '../features/editing/editing';

interface ComparativeViewProps {
  extraction: RawExtraction | null;
  ratios: ComputedRatios | null;
}

export const formatValue = (value: number | null | undefined | string) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 2,
  }).format(value);
};

export const getVariationText = (
  actual: number | null | undefined | string,
  anterior: number | null | undefined | string
): string => {
  if (actual === null || actual === undefined || anterior === null || anterior === undefined) return '-';
  const numActual = typeof actual === 'string' ? parseFloat(actual) : actual;
  const numAnterior = typeof anterior === 'string' ? parseFloat(anterior) : anterior;
  if (!Number.isFinite(numActual) || !Number.isFinite(numAnterior) || numAnterior === 0) return '-';
  const variation = ((numActual - numAnterior) / Math.abs(numAnterior)) * 100;
  if (variation === 0) return '0.0%';
  const isPositive = variation > 0;
  return (isPositive ? '+' : '-') + Math.abs(variation).toFixed(1) + '%';
};

const variationCell = (
  actual: number | null | undefined | string,
  anterior: number | null | undefined | string
) => {
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

interface Row {
  concepto: string;
  anio_anterior: number | string | null;
  anio_actual: number | string | null;
  // Paths en la extracción; si están presentes la celda es editable en modo edición.
  path_anterior?: Path;
  path_actual?: Path;
  nullable?: boolean;
}

const ValueCell = ({ value, path, nullable }: { value: number | string | null; path?: Path; nullable?: boolean }) => {
  const { editing } = useEdit();
  if (!editing || !path || typeof value === 'string') return <>{formatValue(value)}</>;
  return <EditableNumber path={path} value={value} required={!nullable} />;
};

interface TableProps {
  title: string;
  data: Row[];
}

export const Table = ({ title, data }: TableProps) => (
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
              <td className="px-4 py-3 text-right text-[#141414]/70"><ValueCell value={row.anio_anterior} path={row.path_anterior} nullable={row.nullable} /></td>
              <td className="px-4 py-3 text-right text-[#141414] font-bold"><ValueCell value={row.anio_actual} path={row.path_actual} nullable={row.nullable} /></td>
              <td className="px-4 py-3 text-right font-medium">{variationCell(row.anio_actual, row.anio_anterior)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export function getComparativeTablesData(
  extraction: RawExtraction | null | undefined,
  ratios: ComputedRatios | null | undefined
) {
  const actualEsp = extraction?.ejercicio_actual?.estado_situacion_patrimonial;
  const anteriorEsp = extraction?.ejercicio_anterior?.estado_situacion_patrimonial;
  const actualEr = extraction?.ejercicio_actual?.estado_resultados;
  const anteriorEr = extraction?.ejercicio_anterior?.estado_resultados;

  const situacionPatrimonial: Row[] = [
    {
      concepto: 'Activo Corriente',
      anio_anterior: anteriorEsp?.activo_corriente.total ?? null,
      anio_actual: actualEsp?.activo_corriente.total ?? null,
      path_anterior: anteriorEsp ? ['ejercicio_anterior', 'estado_situacion_patrimonial', 'activo_corriente', 'total'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_situacion_patrimonial', 'activo_corriente', 'total'],
    },
    {
      concepto: 'Activo No Corriente',
      anio_anterior: anteriorEsp?.activo_no_corriente.total ?? null,
      anio_actual: actualEsp?.activo_no_corriente.total ?? null,
      path_anterior: anteriorEsp ? ['ejercicio_anterior', 'estado_situacion_patrimonial', 'activo_no_corriente', 'total'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_situacion_patrimonial', 'activo_no_corriente', 'total'],
    },
    {
      concepto: 'Activo Total',
      anio_anterior: anteriorEsp?.total_activo ?? null,
      anio_actual: actualEsp?.total_activo ?? null,
      path_anterior: anteriorEsp ? ['ejercicio_anterior', 'estado_situacion_patrimonial', 'total_activo'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_situacion_patrimonial', 'total_activo'],
    },
    {
      concepto: 'Pasivo Corriente',
      anio_anterior: anteriorEsp?.pasivo_corriente.total ?? null,
      anio_actual: actualEsp?.pasivo_corriente.total ?? null,
      path_anterior: anteriorEsp ? ['ejercicio_anterior', 'estado_situacion_patrimonial', 'pasivo_corriente', 'total'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_situacion_patrimonial', 'pasivo_corriente', 'total'],
    },
    {
      concepto: 'Pasivo No Corriente',
      anio_anterior: anteriorEsp?.pasivo_no_corriente.total ?? null,
      anio_actual: actualEsp?.pasivo_no_corriente.total ?? null,
      path_anterior: anteriorEsp ? ['ejercicio_anterior', 'estado_situacion_patrimonial', 'pasivo_no_corriente', 'total'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_situacion_patrimonial', 'pasivo_no_corriente', 'total'],
    },
    {
      concepto: 'Pasivo Total',
      anio_anterior: anteriorEsp?.total_pasivo ?? null,
      anio_actual: actualEsp?.total_pasivo ?? null,
      path_anterior: anteriorEsp ? ['ejercicio_anterior', 'estado_situacion_patrimonial', 'total_pasivo'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_situacion_patrimonial', 'total_pasivo'],
    },
    {
      concepto: 'Patrimonio Neto',
      anio_anterior: anteriorEsp?.patrimonio_neto ?? null,
      anio_actual: actualEsp?.patrimonio_neto ?? null,
      path_anterior: anteriorEsp ? ['ejercicio_anterior', 'estado_situacion_patrimonial', 'patrimonio_neto'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_situacion_patrimonial', 'patrimonio_neto'],
    },
  ];

  const estadoResultados: Row[] = [
    {
      concepto: 'Ventas Netas',
      anio_anterior: anteriorEr?.ventas_netas ?? null,
      anio_actual: actualEr?.ventas_netas ?? null,
      path_anterior: anteriorEr ? ['ejercicio_anterior', 'estado_resultados', 'ventas_netas'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_resultados', 'ventas_netas'],
    },
    {
      concepto: 'Resultado Bruto',
      anio_anterior: anteriorEr?.resultado_bruto ?? null,
      anio_actual: actualEr?.resultado_bruto ?? null,
      path_anterior: anteriorEr ? ['ejercicio_anterior', 'estado_resultados', 'resultado_bruto'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_resultados', 'resultado_bruto'],
    },
    {
      concepto: 'EBITDA (Calculado)',
      anio_anterior: ratios?.ebitda.anterior ?? null,
      anio_actual: ratios?.ebitda.actual ?? null,
    },
    {
      concepto: 'Resultado Ordinario',
      anio_anterior: anteriorEr?.resultado_ordinario ?? null,
      anio_actual: actualEr?.resultado_ordinario ?? null,
      path_anterior: anteriorEr ? ['ejercicio_anterior', 'estado_resultados', 'resultado_ordinario'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_resultados', 'resultado_ordinario'],
    },
    {
      concepto: 'Resultados Financieros',
      anio_anterior: anteriorEr?.resultado_financiero_y_tenencia ?? null,
      anio_actual: actualEr?.resultado_financiero_y_tenencia ?? null,
      path_anterior: anteriorEr ? ['ejercicio_anterior', 'estado_resultados', 'resultado_financiero_y_tenencia'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_resultados', 'resultado_financiero_y_tenencia'],
      nullable: true,
    },
    {
      concepto: 'Resultado del Ejercicio',
      anio_anterior: anteriorEr?.resultado_neto ?? null,
      anio_actual: actualEr?.resultado_neto ?? null,
      path_anterior: anteriorEr ? ['ejercicio_anterior', 'estado_resultados', 'resultado_neto'] : undefined,
      path_actual: ['ejercicio_actual', 'estado_resultados', 'resultado_neto'],
    },
  ];

  const formatPct = (v: number | null) => (v === null ? null : (v * 100).toFixed(2) + '%');

  const indicadores: Row[] = [
    {
      concepto: 'Liquidez Corriente',
      anio_anterior: ratios?.liquidez_corriente.anterior ?? null,
      anio_actual: ratios?.liquidez_corriente.actual ?? null,
    },
    {
      concepto: 'Prueba Ácida',
      anio_anterior: ratios?.liquidez_acida.anterior ?? null,
      anio_actual: ratios?.liquidez_acida.actual ?? null,
    },
    {
      concepto: 'Endeudamiento Total',
      anio_anterior: ratios?.endeudamiento.anterior ?? null,
      anio_actual: ratios?.endeudamiento.actual ?? null,
    },
    {
      concepto: 'Capital de Trabajo',
      anio_anterior: ratios?.capital_de_trabajo.anterior ?? null,
      anio_actual: ratios?.capital_de_trabajo.actual ?? null,
    },
    {
      concepto: 'Rentabilidad s/Ventas',
      anio_anterior: formatPct(ratios?.margen_neto.anterior ?? null),
      anio_actual: formatPct(ratios?.margen_neto.actual ?? null),
    },
  ];

  return { situacionPatrimonial, estadoResultados, indicadores };
}

export function ComparativeView({ extraction, ratios }: ComparativeViewProps) {
  const { editing } = useEdit();
  const [verticalSelected, setIsVerticalAnalysis] = React.useState(false);
  // En modo edición siempre se muestran valores absolutos (los editables).
  const isVerticalAnalysis = verticalSelected && !editing;
  const { situacionPatrimonial, estadoResultados, indicadores } = getComparativeTablesData(extraction, ratios);

  const totalActivoAnterior =
    extraction?.ejercicio_anterior?.estado_situacion_patrimonial.total_activo ?? null;
  const totalActivoActual =
    extraction?.ejercicio_actual?.estado_situacion_patrimonial.total_activo ?? null;
  const ventasAnterior = extraction?.ejercicio_anterior?.estado_resultados.ventas_netas ?? null;
  const ventasActual = extraction?.ejercicio_actual?.estado_resultados.ventas_netas ?? null;

  const getVerticalValue = (value: number | string | null, base: number | null) => {
    if (value === null || value === undefined || base === null || base === 0) return null;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (!Number.isFinite(num)) return null;
    return (num / base) * 100;
  };

  const formatVertical = (v: number | null) => (v === null ? null : v.toFixed(1) + '%');

  const processData = (data: Row[], baseAnterior: number | null, baseActual: number | null): Row[] => {
    if (!isVerticalAnalysis) return data;
    return data.map((item) => ({
      ...item,
      anio_anterior: formatVertical(getVerticalValue(item.anio_anterior, baseAnterior)) ?? item.anio_anterior,
      anio_actual: formatVertical(getVerticalValue(item.anio_actual, baseActual)) ?? item.anio_actual,
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
            disabled={editing}
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

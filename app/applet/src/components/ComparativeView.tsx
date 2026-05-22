import React from 'react';

const mockupData = {
  estado_situacion_patrimonial: [
    { concepto: 'Activo Corriente', anio_anterior: 3200000, anio_actual: 3800000 },
    { concepto: 'Activo No Corriente', anio_anterior: 1500000, anio_actual: 1450000 },
    { concepto: 'Activo Total', anio_anterior: 4700000, anio_actual: 5250000 },
    { concepto: 'Pasivo Corriente', anio_anterior: 2100000, anio_actual: 2300000 },
    { concepto: 'Pasivo No Corriente', anio_anterior: 800000, anio_actual: 700000 },
    { concepto: 'Pasivo Total', anio_anterior: 2900000, anio_actual: 3000000 },
    { concepto: 'Patrimonio Neto', anio_anterior: 1800000, anio_actual: 2250000 }
  ],
  estado_resultados: [
    { concepto: 'Ventas', anio_anterior: 5500000, anio_actual: 6800000 },
    { concepto: 'EBITDA', anio_anterior: 950000, anio_actual: 1200000 },
    { concepto: 'Resultados', anio_anterior: 600000, anio_actual: 900000 },
    { concepto: 'Resultado Neto', anio_anterior: 420000, anio_actual: null }
  ],
  indicadores_ratios: [
    { concepto: 'Liquidez', anio_anterior: 1.52, anio_actual: 1.65 },
    { concepto: 'Endeudamiento', anio_anterior: 1.61, anio_actual: 1.33 },
    { concepto: 'Rotaciones', anio_anterior: 4.5, anio_actual: null },
    { concepto: 'Rentabilidad', anio_anterior: 0.23, anio_actual: 0.27 }
  ]
};

const formatValue = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 2
  }).format(value);
};

const calculateVariation = (actual: number | null, anterior: number | null) => {
  if (actual === null || anterior === null || anterior === 0) return '-';
  const variation = ((actual - anterior) / Math.abs(anterior)) * 100;
  const isPositive = variation > 0;
  const formatted = Math.abs(variation).toFixed(1) + '%';
  return (
    <span className={variation === 0 ? 'text-gray-500' : isPositive ? 'text-green-600' : 'text-red-600'}>
      {variation === 0 ? '' : isPositive ? '+' : '-'}{formatted}
    </span>
  );
};

const Table = ({ title, data }: { title: string, data: any[] }) => (
  <div className="bg-white border rounded-lg shadow-sm mb-6 overflow-hidden max-w-full">
    <div className="bg-gray-50 border-b px-4 py-3">
      <h3 className="text-lg font-semibold text-gray-800 tracking-tight">{title}</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-600 uppercase text-xs border-b">
          <tr>
            <th className="px-4 py-3 text-left w-2/5 font-semibold">Concepto</th>
            <th className="px-4 py-3 text-right font-semibold">Año Anterior</th>
            <th className="px-4 py-3 text-right font-semibold">Año Actual</th>
            <th className="px-4 py-3 text-right font-semibold">Variación (%)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row, index) => (
            <tr key={index} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-800 text-left">{row.concepto}</td>
              <td className="px-4 py-3 text-right text-gray-600">{formatValue(row.anio_anterior)}</td>
              <td className="px-4 py-3 text-right text-gray-800 font-semibold">{formatValue(row.anio_actual)}</td>
              <td className="px-4 py-3 text-right font-medium">{calculateVariation(row.anio_actual, row.anio_anterior)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export function ComparativeView({ data = mockupData }) {
  return (
    <div className="font-['Poppins']">
      <div className="space-y-6">
        <Table title="ESTADO DE SITUACIÓN PATRIMONIAL" data={data.estado_situacion_patrimonial} />
        <Table title="ESTADO DE RESULTADOS" data={data.estado_resultados} />
        <Table title="INDICADORES Y RATIOS" data={data.indicadores_ratios} />
      </div>
    </div>
  );
}

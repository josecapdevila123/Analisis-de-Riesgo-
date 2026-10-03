import React from 'react';
import { RawExtraction } from '../extraction/schemas';
import { AddRowButton, EditableBoolean, EditableNumber, EditableSelect, EditableText, Path, RemoveRowButton } from './editing';

// Datos extraídos que alimentan los ratios pero no se muestran en otras vistas.
// Solo se renderiza en modo edición.

type FieldSpec = { label: string; path: Path; required?: boolean };

const ESP = ['estado_situacion_patrimonial'];
const ER = ['estado_resultados'];
const EF = ['flujo_efectivo'];

const BALANCE_FIELDS: Array<{ group: string; fields: FieldSpec[] }> = [
  { group: 'Estado de situación patrimonial', fields: [
    { label: 'Bienes de Cambio', path: [...ESP, 'bienes_de_cambio'] },
  ]},
  { group: 'Estado de resultados', fields: [
    { label: 'Costo de Ventas', path: [...ER, 'costo_ventas'], required: true },
    { label: 'Resultado Valuación Bienes de Cambio', path: [...ER, 'resultado_valuacion_bienes_de_cambio'] },
    { label: 'Gastos de Administración', path: [...ER, 'gastos_administracion'], required: true },
    { label: 'Gastos de Comercialización', path: [...ER, 'gastos_comercializacion'], required: true },
    { label: 'Resultado Inversiones Permanentes', path: [...ER, 'resultado_inversiones_permanentes'] },
    { label: 'Gastos Financieros', path: [...ER, 'gastos_financieros'] },
    { label: 'RECPAM', path: [...ER, 'recpam'] },
    { label: 'Impuesto a las Ganancias', path: [...ER, 'impuesto_ganancias'] },
  ]},
  { group: 'Flujo de efectivo', fields: [
    { label: 'Depreciación Bienes de Uso', path: [...EF, 'depreciacion_bienes_de_uso'] },
    { label: 'Flujo Neto Operativo', path: [...EF, 'flujo_neto_operativo'] },
    { label: 'Pagos por Bienes de Uso (capex)', path: [...EF, 'pagos_bienes_de_uso'] },
  ]},
];

const GROUPS: Array<{ key: string; label: string }> = [
  { key: 'activo_corriente', label: 'Activo Corriente' },
  { key: 'activo_no_corriente', label: 'Activo No Corriente' },
  { key: 'pasivo_corriente', label: 'Pasivo Corriente' },
  { key: 'pasivo_no_corriente', label: 'Pasivo No Corriente' },
];

const DEUDA_GROUPS: Array<{ key: 'corriente' | 'no_corriente'; label: string }> = [
  { key: 'corriente', label: 'Deuda Bancaria Corriente' },
  { key: 'no_corriente', label: 'Deuda Bancaria No Corriente' },
];

const get = (obj: unknown, path: Path): any =>
  path.reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white border border-brand-blue/60 rounded-sm mb-8 overflow-hidden">
    <div className="bg-brand-blue/5 border-b border-brand-blue/30 px-4 py-3">
      <h3 className="text-lg font-bold text-ink uppercase tracking-widest">{title}</h3>
    </div>
    <div className="p-4 overflow-x-auto">{children}</div>
  </div>
);

type DetalleList = Array<{ rubro: string; monto: number }>;

const DetalleTable = ({ basePath, list, emptyItem }: { basePath: Path; list: DetalleList; emptyItem: object }) => (
  <>
    <table className="w-full text-sm font-mono">
      <tbody className="divide-y divide-ink/5">
        {list.map((item, i) => (
          <tr key={i}>
            <td className="py-1 pr-2">
              <EditableText path={[...basePath, i, 'rubro']} value={item.rubro} />
            </td>
            <td className="py-1 pr-2 text-right w-36">
              <EditableNumber path={[...basePath, i, 'monto']} value={item.monto} required />
            </td>
            <td className="py-1 w-8"><RemoveRowButton path={basePath} list={list} index={i} /></td>
          </tr>
        ))}
      </tbody>
    </table>
    <AddRowButton path={basePath} list={list} newItem={emptyItem} label="Agregar rubro" />
  </>
);

export function SourceDataEditor({ extraction }: { extraction: RawExtraction }) {
  const years: Array<{ key: 'ejercicio_actual' | 'ejercicio_anterior'; label: string }> = [
    { key: 'ejercicio_anterior', label: `Año anterior ${extraction.company_profile.anio_anterior ?? ''}` },
    { key: 'ejercicio_actual', label: `Año actual ${extraction.company_profile.anio_actual ?? ''}` },
  ];
  const deudaYears: Array<{ key: 'deuda_bancaria_actual' | 'deuda_bancaria_anterior'; label: string }> = [
    { key: 'deuda_bancaria_anterior', label: years[0].label },
    { key: 'deuda_bancaria_actual', label: years[1].label },
  ];

  return (
    <div className="font-['Poppins']">
      <Card title="Datos de origen (usados en ratios)">
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase opacity-60">Año actual</span>
            <EditableText path={['company_profile', 'anio_actual']} value={extraction.company_profile.anio_actual} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase opacity-60">Año anterior</span>
            <EditableText path={['company_profile', 'anio_anterior']} value={extraction.company_profile.anio_anterior} />
          </label>
        </div>
        <table className="w-full text-sm font-mono">
          <thead className="bg-canvas text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Concepto</th>
              {years.map(y => <th key={y.key} className="px-3 py-2 text-right">{y.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {BALANCE_FIELDS.map(({ group, fields }) => (
              <React.Fragment key={group}>
                <tr><td colSpan={3} className="px-3 pt-4 pb-1 text-xs font-bold uppercase opacity-50">{group}</td></tr>
                {fields.map(f => (
                  <tr key={f.label}>
                    <td className="px-3 py-1.5 font-semibold font-sans">{f.label}</td>
                    {years.map(y => (
                      <td key={y.key} className="px-3 py-1.5 text-right">
                        {extraction[y.key] ? (
                          <EditableNumber path={[y.key, ...f.path]} value={get(extraction[y.key], f.path)} required={f.required} />
                        ) : <span className="opacity-40">Sin ejercicio</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Información complementaria">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-sans">
          <label className="flex items-center justify-between gap-3">
            <span className="font-semibold">Balance en moneda homogénea (RT 6)</span>
            <EditableBoolean path={['informacion_complementaria', 'balance_ajustado_por_inflacion']} value={extraction.informacion_complementaria?.balance_ajustado_por_inflacion} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="font-semibold">Opinión del auditor</span>
            <EditableSelect
              path={['informacion_complementaria', 'opinion_auditor']}
              value={extraction.informacion_complementaria?.opinion_auditor ?? 'favorable'}
              options={['favorable', 'con_salvedades', 'adversa', 'abstencion']}
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="font-semibold">Detalle de la opinión del auditor</span>
            <EditableText path={['informacion_complementaria', 'detalle_opinion_auditor']} value={extraction.informacion_complementaria?.detalle_opinion_auditor} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="font-semibold">Deuda financiera en moneda extranjera (miles $)</span>
            <EditableNumber path={['informacion_complementaria', 'deuda_financiera_moneda_extranjera']} value={extraction.informacion_complementaria?.deuda_financiera_moneda_extranjera} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="font-semibold">% de ventas de exportación</span>
            <EditableNumber path={['informacion_complementaria', 'porcentaje_ventas_exportacion']} value={extraction.informacion_complementaria?.porcentaje_ventas_exportacion} />
          </label>
        </div>
      </Card>

      <Card title="Deuda bancaria">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {deudaYears.map(y => {
            const deuda = extraction[y.key];
            return (
              <div key={y.key}>
                <h4 className="text-xs font-bold uppercase opacity-60 mb-2">{y.label}</h4>
                {!deuda ? <p className="text-xs opacity-40">Sin datos del ejercicio.</p> : DEUDA_GROUPS.map(g => (
                  <div key={g.key} className="mb-4">
                    <div className="flex items-center justify-between text-sm font-bold mb-1">
                      <span>{g.label} (total)</span>
                      <EditableNumber path={[y.key, g.key, 'total']} value={deuda[g.key].total} required />
                    </div>
                    <table className="w-full text-sm font-mono">
                      <tbody className="divide-y divide-ink/5">
                        {deuda[g.key].items.map((item, i) => (
                          <tr key={i}>
                            <td className="py-1 pr-2"><EditableText path={[y.key, g.key, 'items', i, 'rubro']} value={item.rubro} /></td>
                            <td className="py-1 pr-2 text-right w-36"><EditableNumber path={[y.key, g.key, 'items', i, 'monto']} value={item.monto} required /></td>
                            <td className="py-1 w-8"><RemoveRowButton path={[y.key, g.key, 'items']} list={deuda[g.key].items} index={i} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <AddRowButton path={[y.key, g.key, 'items']} list={deuda[g.key].items} newItem={{ rubro: '', monto: 0 }} label="Agregar ítem" />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Detalle por rubro">
        <p className="text-xs opacity-60 mb-4 font-sans">
          Disponibilidades, créditos por ventas y deudas comerciales se toman de estos rubros para liquidez inmediata, KTNO y días de cobro/pago.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {years.map(y => {
            const esp = extraction[y.key]?.estado_situacion_patrimonial;
            return (
              <div key={y.key}>
                <h4 className="text-xs font-bold uppercase opacity-60 mb-2">{y.label}</h4>
                {!esp ? <p className="text-xs opacity-40">Sin datos del ejercicio.</p> : GROUPS.map(g => {
                  const grupo = (esp as any)[g.key] as { total: number; detalles: DetalleList };
                  return (
                    <div key={g.key} className="mb-4">
                      <div className="text-sm font-bold mb-1">{g.label}</div>
                      <DetalleTable
                        basePath={[y.key, 'estado_situacion_patrimonial', g.key, 'detalles']}
                        list={grupo.detalles ?? []}
                        emptyItem={{ rubro: '', monto: 0 }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

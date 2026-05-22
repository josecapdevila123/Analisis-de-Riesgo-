import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const helpers = `
  const calculateEBITDA = (ejercicio: any, flujo: any) => {
    if (!ejercicio) return null;
    const resultado_bruto = ejercicio.resultado_bruto || 0;
    const resultado_valuacion = ejercicio.resultado_valuacion_bienes_de_cambio || 0;
    const depreciacion = flujo?.depreciacion_bienes_de_uso || 0;
    const resultado_inversiones = ejercicio.resultado_inversiones_permanentes || 0;
    const gastos_com = ejercicio.gastos_comercializacion || 0;
    const gastos_adm = ejercicio.gastos_administracion || 0;
    return (resultado_bruto + resultado_valuacion + depreciacion + resultado_inversiones) - (gastos_com + gastos_adm);
  };

  const getDeudaCortoPlazo = (pasivo_corriente: any) => {
    if (!pasivo_corriente || !pasivo_corriente.detalles) return null;
    const keywords = ['préstamo', 'prestamo', 'bancari', 'financier'];
    let total = 0;
    let found = false;
    pasivo_corriente.detalles.forEach((item: any) => {
      const rubro = item.rubro.toLowerCase();
      if (keywords.some(kw => rubro.includes(kw))) {
        total += item.monto || 0;
        found = true;
      }
    });
    return found ? total : null;
  };
`;

content = content.replace('const calculateVariation =', helpers + '\n  const calculateVariation =');

const newGrid = `
                  {/* Nuevas Tarjetas KPI (Fila Superior) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {/* Tarjeta 1: VENTAS */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <p className="text-[10px] font-serif italic text-[#141414] uppercase mb-2">VENTAS</p>
                      <p className="text-2xl font-bold font-mono mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas)}
                      </p>
                      <div className="flex items-center text-[10px] opacity-60 leading-tight">
                        <VariationBadge variation={calculateVariation(
                          activeResult.data?.hoja_estado_resultados?.ejercicio_actual?.ventas_netas || 0,
                          activeResult.data?.hoja_estado_resultados?.ejercicio_anterior?.ventas_netas || 0
                        )} />
                        <span className="ml-1">Var. interanual</span>
                      </div>
                    </div>

                    {/* Tarjeta 2: EBITDA */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <p className="text-[10px] font-serif italic text-[#141414] uppercase mb-2">EBITDA</p>
                      <p className="text-2xl font-bold font-mono mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined ? activeResult.dashboardData.motor_de_ratios.ebitda : calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual))}
                      </p>
                      <div className="flex items-center text-[10px] opacity-60 leading-tight">
                        <VariationBadge variation={calculateVariation(
                          (activeResult.dashboardData?.motor_de_ratios?.ebitda !== 'N/A' && activeResult.dashboardData?.motor_de_ratios?.ebitda !== undefined) ? activeResult.dashboardData.motor_de_ratios.ebitda : (calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_actual, activeResult.data?.hoja_flujo_efectivo?.ejercicio_actual) || 0),
                          calculateEBITDA(activeResult.data?.hoja_estado_resultados?.ejercicio_anterior, activeResult.data?.hoja_flujo_efectivo?.ejercicio_anterior) || 0
                        )} />
                        <span className="ml-1">Var. interanual</span>
                      </div>
                    </div>

                    {/* Tarjeta 3: DEUDA BANCARIA TOTAL */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <p className="text-[10px] font-serif italic text-[#141414] uppercase mb-2">DEUDA BANCARIA TOTAL</p>
                      <p className="text-2xl font-bold font-mono mb-2 text-[#141414]">
                        {formatCurrencyThousands(activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_total !== 'N/A' ? activeResult.dashboardData?.motor_de_ratios?.deuda_bancaria_total : null)}
                      </p>
                      <p className="text-[10px] opacity-60 leading-tight">Total sistema financiero</p>
                    </div>

                    {/* Tarjeta 4: DEUDA CORTO PLAZO */}
                    <div className="bg-white border border-[#141414] p-4 relative overflow-hidden group hover:shadow-lg transition-all">
                      <p className="text-[10px] font-serif italic text-[#141414] uppercase mb-2">DEUDA CORTO PLAZO</p>
                      {(() => {
                        const deudaCPActual = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_actual?.pasivo?.pasivo_corriente);
                        const deudaCPAnterior = getDeudaCortoPlazo(activeResult.data?.hoja_estado_situacion_patrimonial?.ejercicio_anterior?.pasivo?.pasivo_corriente);
                        
                        if (deudaCPActual === null) {
                          return <p className="text-2xl font-bold font-mono mb-2 text-[#141414]">-</p>;
                        }

                        return (
                          <>
                            <p className="text-2xl font-bold font-mono mb-2 text-[#141414]">
                              {formatCurrencyThousands(deudaCPActual)}
                            </p>
                            {deudaCPAnterior !== null && (
                              <div className="flex items-center text-[10px] opacity-60 leading-tight">
                                <VariationBadge variation={calculateVariation(deudaCPActual, deudaCPAnterior)} />
                                <span className="ml-1">Var. interanual</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* KPI Cards (Fila Original) */}
`;

content = content.replace('{/* KPI Cards */}', newGrid);

fs.writeFileSync('src/App.tsx', content);
console.log("Added new KPI row");

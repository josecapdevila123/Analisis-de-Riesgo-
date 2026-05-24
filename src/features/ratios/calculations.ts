export const calculateEBITDA = (ejercicio: any, flujo: any) => {
  if (!ejercicio) return null;
  const resultado_bruto = Number(ejercicio.resultado_bruto) || 0;
  const resultado_valuacion = Number(ejercicio.resultado_valuacion_bienes_de_cambio) || 0;
  const depreciacion = Number(flujo?.depreciacion_bienes_de_uso) || 0;
  const resultado_inversiones = Number(ejercicio.resultado_inversiones_permanentes) || 0;
  const gastos_com = Number(ejercicio.gastos_comercializacion) || 0;
  const gastos_adm = Number(ejercicio.gastos_administracion) || 0;
  return (resultado_bruto + resultado_valuacion + depreciacion + resultado_inversiones) - (gastos_com + gastos_adm);
};

export const evaluateRatio = (name: string, value: number | string): 'healthy' | 'alert' | 'critical' => {
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

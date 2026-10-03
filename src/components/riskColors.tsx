import React from 'react';
import { AlertCircle, AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SeveridadRiesgo } from '../features/extraction/schemas';
import { RiskCategory } from '../features/risk/score';

// Paleta de estados (fija, reservada para estado): bueno / advertencia / serio / crítico.
// Siempre va acompañada de ícono + etiqueta; el texto queda en tinta, nunca en el color.
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;
export type Status = keyof typeof STATUS;

export const CATEGORY_STATUS: Record<RiskCategory, Status> = {
  bajo: 'good', moderado: 'warning', alto: 'serious', critico: 'critical',
};
export const SEVERIDAD_STATUS: Record<SeveridadRiesgo, Status> = {
  baja: 'good', media: 'warning', alta: 'serious', critica: 'critical',
};
export const STATUS_ICON: Record<Status, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  good: CheckCircle2, warning: AlertCircle, serious: AlertTriangle, critical: AlertOctagon,
};

export const tint = (hex: string, alpha: number) => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

export const StatusBadge = ({ status, label }: { status: Status; label: string }) => {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-bold uppercase tracking-wider text-[#141414] whitespace-nowrap"
      style={{ backgroundColor: tint(STATUS[status], 0.18) }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: STATUS[status] }} />
      {label}
    </span>
  );
};

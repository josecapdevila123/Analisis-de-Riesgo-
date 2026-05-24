import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrencyThousands = (value: any, currency: string = 'ARS') => {
  if (value === undefined || value === null || value === 'N/A') return '-';
  const num = Number(value);
  if (isNaN(num)) return String(value);

  if (currency === 'USD') {
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  // Value is already in thousands from LLM extraction, so we just format it
  return num.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
};

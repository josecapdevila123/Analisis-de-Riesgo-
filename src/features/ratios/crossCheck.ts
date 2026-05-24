import { RawExtraction } from '../extraction/schemas';

export type CrossCheckResult = {
  balance_debt: number;
  nosis_debt: number | null;
  difference_abs: number | null;
  difference_pct: number | null;
  match: boolean | null;
};

const UMBRAL_PCT = 10;

export function runCrossCheck(extraction: RawExtraction): CrossCheckResult {
  const balance_debt =
    extraction.deuda_bancaria_actual.corriente.total +
    extraction.deuda_bancaria_actual.no_corriente.total;

  const nosis_debt = extraction.extraccion_nosis?.deuda_financiera_total_nosis ?? null;

  if (nosis_debt === null) {
    return {
      balance_debt,
      nosis_debt: null,
      difference_abs: null,
      difference_pct: null,
      match: null,
    };
  }

  const difference_abs = balance_debt - nosis_debt;
  const difference_pct = nosis_debt !== 0 ? (difference_abs / Math.abs(nosis_debt)) * 100 : null;
  const match = difference_pct !== null && Math.abs(difference_pct) <= UMBRAL_PCT;

  return { balance_debt, nosis_debt, difference_abs, difference_pct, match };
}

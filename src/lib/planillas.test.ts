import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { esPlanilla, planillaATexto } from './planillas';

describe('planillas a texto', () => {
  it('reconoce Excel y CSV por extensión', () => {
    expect(esPlanilla(new File([''], 'mora.xlsx'))).toBe(true);
    expect(esPlanilla(new File([''], 'mora.CSV'))).toBe(true);
    expect(esPlanilla(new File([''], 'balance.pdf', { type: 'application/pdf' }))).toBe(false);
  });

  it('CSV → tabla de texto', async () => {
    const t = await planillaATexto(new File(['tramo,monto\nal_dia,900\n31-90,60\n'], 'mora.csv', { type: 'text/csv' }));
    expect(t).toContain('tramo,monto');
    expect(t).toContain('31-90,60');
  });

  it('Excel con dos hojas → una tabla por hoja', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tramo', 'Monto'], ['Al día', 900], ['+90', 40]]), 'Mora');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Producto', 'Cartera'], ['Prendarios', 500]]), 'Productos');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const t = await planillaATexto(new File([buf], 'mora.xlsx'));
    expect(t).toContain('### Hoja "Mora"');
    expect(t).toContain('+90,40');
    expect(t).toContain('### Hoja "Productos"');
    expect(t).toContain('Prendarios,500');
  });
});

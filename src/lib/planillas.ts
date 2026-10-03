// Planillas (Excel / CSV): Gemini no las lee como archivo, así que en el
// navegador se convierten a texto (una tabla CSV por hoja) y se mandan así.
// SheetJS se carga solo cuando hace falta (chunk aparte).

const EXT_PLANILLA = /\.(xlsx|xlsm|xls|csv)$/i;
const MIME_PLANILLA = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
];

export const ACCEPT_PLANILLAS: Record<string, string[]> = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
};

export const esPlanilla = (file: File) => EXT_PLANILLA.test(file.name) || MIME_PLANILLA.includes(file.type);

// Límite de texto por planilla para no exceder lo que acepta el modelo.
const MAX_CARACTERES = 300_000;

export async function planillaATexto(file: File): Promise<string> {
  const XLSX = await import('xlsx');
  const datos = /\.csv$/i.test(file.name) || file.type === 'text/csv'
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const hojas = datos.SheetNames.map(nombre => {
    const csv = XLSX.utils.sheet_to_csv(datos.Sheets[nombre], { blankrows: false, strip: true });
    return `### Hoja "${nombre}"\n${csv}`;
  });
  const texto = hojas.join('\n\n');
  return texto.length > MAX_CARACTERES ? `${texto.slice(0, MAX_CARACTERES)}\n[... planilla recortada por tamaño ...]` : texto;
}

// Archivo → formato que acepta el cliente de Gemini: las planillas como texto,
// el resto como data URL (base64).
export async function leerArchivo(file: File): Promise<{ file: File; preview: string; texto?: string }> {
  if (esPlanilla(file)) return { file, preview: '', texto: await planillaATexto(file) };
  const preview = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { file, preview };
}

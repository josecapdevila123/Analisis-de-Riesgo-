import type jsPDF from 'jspdf';
// ?inline: Vite las incrusta como data URL en base64. Este módulo se importa de
// forma dinámica, así que solo se descarga cuando se genera un PDF.
import interRegular from '../../assets/fonts/Inter-Regular.ttf?inline';
import interSemiBold from '../../assets/fonts/Inter-SemiBold.ttf?inline';
import interBold from '../../assets/fonts/Inter-Bold.ttf?inline';
import interItalic from '../../assets/fonts/Inter-Italic.ttf?inline';
import poppinsSemiBold from '../../assets/fonts/Poppins-SemiBold.ttf?inline';
import poppinsBold from '../../assets/fonts/Poppins-Bold.ttf?inline';

const FONTS: Array<{ file: string; family: string; style: string; dataUrl: string }> = [
  { file: 'Inter-Regular.ttf', family: 'Inter', style: 'normal', dataUrl: interRegular },
  { file: 'Inter-SemiBold.ttf', family: 'Inter', style: 'semibold', dataUrl: interSemiBold },
  { file: 'Inter-Bold.ttf', family: 'Inter', style: 'bold', dataUrl: interBold },
  { file: 'Inter-Italic.ttf', family: 'Inter', style: 'italic', dataUrl: interItalic },
  { file: 'Poppins-SemiBold.ttf', family: 'Poppins', style: 'semibold', dataUrl: poppinsSemiBold },
  { file: 'Poppins-Bold.ttf', family: 'Poppins', style: 'bold', dataUrl: poppinsBold },
];

export function registerBrandFonts(doc: jsPDF) {
  for (const f of FONTS) {
    doc.addFileToVFS(f.file, f.dataUrl.slice(f.dataUrl.indexOf(',') + 1));
    doc.addFont(f.file, f.family, f.style);
  }
}

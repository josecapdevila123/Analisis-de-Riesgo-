import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { CompanyHistory } from '../features/extraction/schemas';

interface CompanyHistoryViewProps {
  history: CompanyHistory | null;
  isGenerating: boolean;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white border border-[#141414] p-6">
    <h3 className="text-base font-bold uppercase tracking-widest mb-4 text-[#141414]">{title}</h3>
    {children}
  </div>
);

const BulletList = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length === 0 ? (
    <p className="text-sm text-[#141414]/50 italic">{empty}</p>
  ) : (
    <ul className="space-y-2 text-sm text-[#141414] list-disc pl-5 marker:text-[#141414]/40">
      {items.map((item, i) => <li key={i} className="leading-relaxed">{item}</li>)}
    </ul>
  );

export function CompanyHistoryView({ history, isGenerating }: CompanyHistoryViewProps) {
  if (!history) {
    return (
      <div className="bg-white border border-[#141414] p-12 text-center text-[#141414]/60 font-mono text-sm">
        {isGenerating ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Leyendo la Memoria del balance...
          </span>
        ) : (
          'No hay historia y actividad generada para este caso. Se genera en los análisis nuevos.'
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {!history.memoria_disponible && (
        <div className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          No se encontró la Memoria del Directorio entre los documentos. La descripción sale de las Notas a los estados contables.
        </div>
      )}

      {/* Lo más importante: de qué vive la empresa */}
      <div className="bg-[#141414] text-[#E4E3E0] border border-[#141414] p-8">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-4 opacity-70">Core business</h3>
        <p className="text-base leading-relaxed text-justify whitespace-pre-line">
          {history.core_business || 'Sin información sobre la actividad en los documentos.'}
        </p>
      </div>

      <Section title="Historia">
        <p className="text-sm leading-relaxed text-justify text-[#141414] whitespace-pre-line">
          {history.historia || <span className="text-[#141414]/50 italic">Sin datos históricos en los documentos.</span>}
        </p>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title="Datos relevantes">
          <BulletList items={history.datos_relevantes} empty="Sin datos relevantes informados." />
        </Section>
        <Section title="Proyecciones de la empresa">
          <BulletList items={history.proyecciones} empty="La Memoria no informa proyecciones." />
        </Section>
      </div>

      <Section title="Explicaciones sobre el balance">
        {history.explicaciones_balance.length === 0 ? (
          <p className="text-sm text-[#141414]/50 italic">El Directorio no explica variaciones del balance.</p>
        ) : (
          <dl className="divide-y divide-[#141414]/10">
            {history.explicaciones_balance.map((item, i) => (
              <div key={i} className="py-3 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-1 md:gap-6">
                <dt className="text-sm font-bold text-[#141414]">{item.tema}</dt>
                <dd className="text-sm text-[#141414]/80 leading-relaxed">{item.explicacion}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>
    </div>
  );
}

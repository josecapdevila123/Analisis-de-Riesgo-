import { Scale } from 'lucide-react';
import { avisoPerfil } from '../features/risk/avisoPerfil';
import { PerfilEfectivo } from '../features/risk/policy';
import { SectorCaso } from '../features/risk/porton';
import type { FuenteMora } from '../features/ratios/financieras';
import type { DocumentoSectorial } from '../features/sectorDocs/tipos';

// Recuadro "Perfil de evaluación" (Balance y Ratios y Opinión de riesgos).
// Generado por código desde la foto del perfil: no hay texto escrito a mano.
export function PerfilAviso({ perfil, sector, mora, documentos, onVerPolitica }: {
  perfil: PerfilEfectivo;
  sector: SectorCaso | null | undefined;
  mora?: FuenteMora | null;
  documentos?: DocumentoSectorial[] | null;
  onVerPolitica?: () => void;
}) {
  const a = avisoPerfil(perfil, sector, { mora, documentos });
  // Solo el perfil y quién lo confirmó; el detalle (umbrales, KPIs, documentos) está en la política.
  return (
    <section className="bg-white border border-ink/15 border-l-4 border-l-brand-blue px-5 py-3 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <Scale className="w-4 h-4 self-center text-brand-blue" />
        <strong className="font-semibold">{a.titulo}</strong>
        {a.subsegmento && <span className="text-ink/60">{a.subsegmento}</span>}
        {a.confirmacion && <span className="text-ink/60">{a.confirmacion}</span>}
      </p>
      <p className="text-xs text-ink/55 mt-1">
        {onVerPolitica ? (
          <>Revisá la <button onClick={onVerPolitica} className="underline underline-offset-2 hover:text-ink">política de riesgos</button> para más información.</>
        ) : 'Revisá la política de riesgos para más información.'}
      </p>
      {a.versionDesactualizada && (
        <p className="text-xs font-medium text-ink bg-brand-blue/10 inline-block px-2 py-1 rounded-sm mt-2">{a.versionDesactualizada}</p>
      )}
    </section>
  );
}

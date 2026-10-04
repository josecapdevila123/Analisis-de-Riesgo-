import { Scale } from 'lucide-react';
import { avisoPerfil } from '../features/risk/avisoPerfil';
import { PerfilEfectivo } from '../features/risk/policy';
import { SectorCaso } from '../features/risk/porton';
import type { FuenteMora } from '../features/ratios/financieras';
import type { DocumentoSectorial } from '../features/sectorDocs/tipos';

// Recuadro "Perfil de evaluación": completo en la Opinión de riesgos; compacto en Balance y Ratios.
// Generado por código desde la foto del perfil: no hay texto escrito a mano.
export function PerfilAviso({ perfil, sector, mora, documentos, compacto = false, onVerPolitica }: {
  perfil: PerfilEfectivo;
  sector: SectorCaso | null | undefined;
  mora?: FuenteMora | null;
  documentos?: DocumentoSectorial[] | null;
  // Compacto (Balance y Ratios): solo el perfil y quién lo confirmó; el detalle está en la política.
  compacto?: boolean;
  onVerPolitica?: () => void;
}) {
  const a = avisoPerfil(perfil, sector, { mora, documentos });
  if (compacto) {
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
      </section>
    );
  }
  return (
    <section className="bg-white border border-ink/15 border-l-4 border-l-brand-blue px-5 py-4 text-sm space-y-2">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <Scale className="w-4 h-4 self-center text-brand-blue" />
        <strong className="font-semibold">{a.titulo}</strong>
        {a.confirmacion && <span className="text-ink/60">{a.confirmacion}</span>}
      </p>
      {a.subsegmento && <p className="text-ink/70">{a.subsegmento}</p>}
      {a.cambio && <p className="text-ink/70">{a.cambio}</p>}
      {sector?.nota && <p className="text-ink/70">Nota del analista: {sector.nota}</p>}
      {a.esGenerico ? (
        <p className="text-ink/70">Se aplican los criterios generales de la política, sin ajustes por rubro.</p>
      ) : (
        <div className="text-ink/70 space-y-1">
          <p>Este análisis se realiza con criterios específicos del rubro.</p>
          {a.diferencias.length > 0 && <p><span className="font-medium text-ink/80">Difiere del perfil genérico en:</span> {a.diferencias.join('; ')}.</p>}
          {a.propios.length > 0 && <p><span className="font-medium text-ink/80">Indicadores propios del rubro:</span> {a.propios.join('; ')}.</p>}
          {a.ajustes.length > 0 && <p>{a.ajustes.join('. ')}.</p>}
          {a.noAplican.length > 0 && <p><span className="font-medium text-ink/80">No aplican:</span> {a.noAplican.join('; ')}.</p>}
        </div>
      )}
      <p className="text-ink/70"><span className="font-medium text-ink/80">KPIs prioritarios del rubro:</span> {a.kpis.join(', ')}.</p>
      {a.fuenteMora && <p className="text-ink/70">{a.fuenteMora}</p>}
      {a.documentacion && <p className="text-ink/70">{a.documentacion}</p>}
      <p className="text-[11px] text-ink/45">{a.politica}</p>
      {a.versionDesactualizada && (
        <p className="text-xs font-medium text-ink bg-brand-blue/10 inline-block px-2 py-1 rounded-sm">{a.versionDesactualizada}</p>
      )}
    </section>
  );
}

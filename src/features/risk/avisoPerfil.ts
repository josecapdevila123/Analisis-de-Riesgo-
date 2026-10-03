import { PerfilEfectivo, perfilEfectivo, POLICY_STATUS, POLICY_VERSION, RATIO_LABEL_CORTO, RatioWithThreshold, SECTOR_PROFILES } from './policy';
import type { RatioKey } from '../ratios/calculations';
import type { SectorCaso } from './porton';

// Recuadro "Perfil de evaluación" para el Resumen ejecutivo, la Opinión de
// riesgos y el PDF. Todo sale de comparar la foto del perfil contra el genérico:
// no se escribe ninguna diferencia a mano.

const fmtUmbral = (v: number, unidad: 'x' | '%') =>
  unidad === '%' ? `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%` : `${v.toLocaleString('es-AR', { maximumFractionDigits: 2 })}x`;

const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

export type AvisoPerfil = {
  titulo: string;           // "Perfil de evaluación: Comercio y distribución."
  confirmacion: string | null;
  cambio: string | null;    // "Sugerido: Industria. Motivo del cambio: …"
  esGenerico: boolean;
  diferencias: string[];    // "Margen EBITDA (sano > 5% vs. 10%)"
  ajustes: string[];        // "Liquidez corriente y pasivo / PN sin anticipos de clientes"
  noAplican: string[];      // "Prueba ácida (motivo)"
  kpis: string[];
  politica: string;         // "Política de riesgos v2.0.0 — Propuesta inicial…"
  versionDesactualizada: string | null;
};

export function avisoPerfil(perfil: PerfilEfectivo, sector: SectorCaso | null | undefined): AvisoPerfil {
  const base = perfilEfectivo('generico');
  const diferencias = (Object.keys(perfil.umbrales) as RatioWithThreshold[]).flatMap(k => {
    if (perfil.noAplica[k]) return [];
    const p = perfil.umbrales[k];
    const g = base.umbrales[k];
    if (p.sano === g.sano && p.alerta === g.alerta) return [];
    const signo = p.mejorSi === 'mayor' ? '>' : '≤';
    return [`${RATIO_LABEL_CORTO[k] ?? p.label} (sano ${signo} ${fmtUmbral(p.sano, p.unidad)} vs. ${fmtUmbral(g.sano, g.unidad)}; alerta ${fmtUmbral(p.alerta, p.unidad)} vs. ${fmtUmbral(g.alerta, g.unidad)})`];
  });
  const s = perfil.senales;
  const gs = base.senales;
  if (s.deuda.cortoPlazoShare !== gs.deuda.cortoPlazoShare) diferencias.push(`Señal de deuda que vence en 12 meses (> ${s.deuda.cortoPlazoShare * 100}% vs. ${gs.deuda.cortoPlazoShare * 100}%)`);
  if (s.deuda.pasivoPnMedia !== gs.deuda.pasivoPnMedia || s.deuda.pasivoPnAlta !== gs.deuda.pasivoPnAlta) diferencias.push(`Señal de pasivo / PN (${s.deuda.pasivoPnMedia}x / ${s.deuda.pasivoPnAlta}x vs. ${gs.deuda.pasivoPnMedia}x / ${gs.deuda.pasivoPnAlta}x)`);
  if (s.liquidez.ciclosDiasAumento !== gs.liquidez.ciclosDiasAumento) diferencias.push(`Señal de aumento del ciclo de caja (> ${s.liquidez.ciclosDiasAumento} vs. ${gs.liquidez.ciclosDiasAumento} días)`);
  const pesos = (Object.keys(perfil.pesos) as Array<keyof typeof perfil.pesos>).filter(d => perfil.pesos[d] !== base.pesos[d]);
  if (pesos.length) diferencias.push(`Pesos del puntaje (${pesos.map(d => `${d.replace(/_/g, ' ')} ${perfil.pesos[d]} vs. ${base.pesos[d]}`).join('; ')})`);

  const ajustes: string[] = [];
  if (perfil.ajustes.excluirAnticiposClientes) ajustes.push('Liquidez corriente y pasivo / PN se miden sin anticipos de clientes');
  if (perfil.ajustes.margenEbitdaPromedio) ajustes.push('El semáforo del margen EBITDA usa el promedio de los dos ejercicios');

  const confirmadoEn = fechaCorta(sector?.confirmadoEn ?? null);
  const confirmacion = sector?.confirmado
    ? `Confirmado por ${sector.confirmadoPor ?? 'el analista'}${confirmadoEn ? ` el ${confirmadoEn}` : ''}.`
    : null;
  const cambio = sector?.sugerido && sector.confirmado && sector.sugerido !== sector.confirmado
    ? `Sugerido: ${SECTOR_PROFILES[sector.sugerido].label}. Motivo del cambio: ${sector.motivoCambio ?? '—'}`
    : null;

  return {
    titulo: `Perfil de evaluación: ${perfil.label}.`,
    confirmacion,
    cambio,
    esGenerico: perfil.rubro === 'generico',
    diferencias,
    ajustes,
    noAplican: Object.entries(perfil.noAplica).map(([k, m]) => `${RATIO_LABEL_CORTO[k as RatioKey] ?? k} (${m})`),
    kpis: perfil.kpisPrioritarios.map(k => RATIO_LABEL_CORTO[k] ?? k),
    politica: `Política de riesgos v${perfil.version} — ${POLICY_STATUS}.`,
    versionDesactualizada: perfil.version !== POLICY_VERSION ? `Evaluado con política v${perfil.version}; vigente v${POLICY_VERSION}.` : null,
  };
}

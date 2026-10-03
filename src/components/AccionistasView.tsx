import React, { useMemo } from 'react';
import { CornerDownRight, Network, Users } from 'lucide-react';
import { Accionista, RawExtraction } from '../features/extraction/schemas';
import { AddRowButton, EditableNumber, EditableText, Path, RemoveRowButton, useEdit } from '../features/editing/editing';
import { armarArbol, esAccionista, finalesDeCadena, NodoAccionista, nombresDeAccionistas, sumaCierra, sumaParticipaciones } from '../features/accionistas/estructura';
import { StatusBadge } from './riskColors';

// Pestaña "Accionistas y Directorio": composición accionaria con la cadena
// societaria (participación directa y sobre la empresa), quiénes quedan al
// final de cada cadena y el directorio, marcando quién también es accionista.
// Todo editable en modo edición. Nunca muestra datos de ejemplo.

type Datos = RawExtraction['accionistas_y_directorio'];
type Miembro = NonNullable<Datos>['directorio'][number];

const BASE_ACC: Path = ['accionistas_y_directorio', 'accionistas'];
const BASE_DIR: Path = ['accionistas_y_directorio', 'directorio'];

const fmtPct = (v: number | null | undefined, dec = 2) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('es-AR', { maximumFractionDigits: dec })}%`;

// Orden del directorio por cargo. Se evalúa de lo más específico a lo más
// general: "Vicepresidente" contiene "presidente" y "Síndico titular", "titular".
const rangoCargo = (c: string | null | undefined) => {
  const cargo = c ?? '';
  if (/vice/i.test(cargo)) return 1;
  if (/presidente/i.test(cargo)) return 0;
  if (/s[ií]ndic|fiscaliz|consejo de vigilancia/i.test(cargo)) return 4;
  if (/suplente/i.test(cargo)) return 3;
  if (/director|titular|gerente general/i.test(cargo)) return 2;
  if (/gerente|apoderado/i.test(cargo)) return 5;
  return 6;
};

const iniciales = (nombre: string | null | undefined) => {
  const partes = (nombre ?? '').replace(/,/g, ' ').split(/\s+/).filter(p => p && p.length > 1);
  return (partes.slice(0, 2).map(p => p[0]).join('') || '?').toUpperCase();
};

const Card = ({ title, subtitle, icon, right, children }: {
  title: string; subtitle?: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) => (
  <section className="bg-white border border-ink/15">
    <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink/10">
      <div>
        <h3 className="font-display text-base font-semibold flex items-center gap-2">{icon}{title}</h3>
        {subtitle && <p className="text-[11px] text-ink/50 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </header>
    {children}
  </section>
);

const Kpi = ({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="bg-white border border-ink/15 px-5 py-4 flex flex-col gap-1.5 min-w-0">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">{label}</p>
    <div className="text-xl font-semibold text-ink truncate">{children}</div>
    {sub && <div className="text-xs text-ink/55">{sub}</div>}
  </div>
);

const SumaBadge = ({ suma }: { suma: number }) =>
  sumaCierra(suma)
    ? <StatusBadge status="good" label={`Suma ${fmtPct(suma)}`} />
    : <StatusBadge status="warning" label={`Suma ${fmtPct(suma)}: no da 100%`} />;

// ---------- filas del árbol ----------

function FilasNivel({ lista, nodos, path, padre }: { lista: Accionista[]; nodos: NodoAccionista[]; path: Path; padre?: string }) {
  const { editing } = useEdit();
  return (
    <>
      {nodos.map((n, i) => {
        const a = lista[i];
        const subPath: Path = [...path, i, 'subAccionistas'];
        const indent = (n.nivel - 1) * 20;
        return (
          <React.Fragment key={n.indices.join('-')}>
            <tr className={n.nivel === 1 ? 'border-t border-ink/10' : ''}>
              <td className="!text-left px-5 py-2.5">
                <div className="flex items-center gap-1.5" style={{ paddingLeft: indent }}>
                  {n.nivel > 1 && <CornerDownRight className="w-3.5 h-3.5 text-ink/30 shrink-0" />}
                  <RemoveRowButton path={path} list={lista} index={i} />
                  <span className={n.nivel === 1 ? 'font-semibold text-ink' : 'text-body'}>
                    <EditableText path={[...path, i, 'nombre']} value={a?.nombre} display={n.nombre || <span className="text-ink/30">Sin nombre</span>} />
                  </span>
                </div>
              </td>
              <td className="!text-left px-3 py-2.5 text-ink/55 tabular-nums whitespace-nowrap">
                <EditableText path={[...path, i, 'dni_cuit']} value={a?.dni_cuit} display={n.dni_cuit || '—'} />
              </td>
              <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                <EditableNumber path={[...path, i, 'participacion']} value={a?.participacion} display={fmtPct(n.directa)} inputClassName="w-20" />
              </td>
              <td className="!text-left px-5 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-ink/[0.07] overflow-hidden min-w-[60px]">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, n.indirecta ?? 0)}%`, opacity: n.nivel === 1 ? 1 : 0.55 }} />
                  </div>
                  <span className="text-xs tabular-nums text-ink/70 w-14 text-right">{fmtPct(n.indirecta, 1)}</span>
                </div>
              </td>
            </tr>
            {n.hijos.length > 0 && (
              <tr>
                <td colSpan={4} className="!text-left px-5 pt-1 pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink/50" style={{ paddingLeft: indent + 20 }}>
                    Composición de {n.nombre || 'esta sociedad'}
                    {n.sumaHijos !== null && !sumaCierra(n.sumaHijos) && <SumaBadge suma={n.sumaHijos} />}
                  </div>
                </td>
              </tr>
            )}
            {n.hijos.length > 0 && <FilasNivel lista={a?.subAccionistas ?? []} nodos={n.hijos} path={subPath} padre={n.nombre} />}
            {editing && (
              <tr>
                <td colSpan={4} className="!text-left px-5 py-0">
                  <div style={{ paddingLeft: indent + 20 }}>
                    <AddRowButton
                      path={subPath}
                      list={a?.subAccionistas ?? []}
                      newItem={{ nombre: '', dni_cuit: '', participacion: null }}
                      label={n.hijos.length > 0 ? `Agregar socio de ${n.nombre || 'esta sociedad'}` : `Agregar composición de ${n.nombre || 'este accionista'}`}
                    />
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
      {editing && padre === undefined && (
        <tr>
          <td colSpan={4} className="!text-left px-5 pb-3">
            <AddRowButton path={path} list={lista} newItem={{ nombre: '', dni_cuit: '', participacion: null }} label="Agregar accionista" />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------- vista ----------

export function AccionistasView({ datos }: { datos: Datos }) {
  const { editing } = useEdit();
  const accionistas = datos?.accionistas ?? [];
  const directorio = datos?.directorio ?? [];
  const arbol = useMemo(() => armarArbol(accionistas), [accionistas]);
  const finales = useMemo(() => finalesDeCadena(arbol), [arbol]);
  const nombres = useMemo(() => nombresDeAccionistas(arbol), [arbol]);
  const suma = sumaParticipaciones(accionistas);
  const hayCadenas = arbol.some(n => n.hijos.length > 0);
  const mayor = [...arbol].sort((a, b) => (b.directa ?? -1) - (a.directa ?? -1))[0];

  const miembros = directorio
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rangoCargo(a.m.cargo) - rangoCargo(b.m.cargo));
  const tambienAccionistas = directorio.filter(m => esAccionista(m.nombre, nombres)).length;

  return (
    <div className="@container space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
      {/* Resumen */}
      {(accionistas.length > 0 || directorio.length > 0) && (
        <div className="grid grid-cols-1 @md:grid-cols-2 @4xl:grid-cols-4 gap-3">
          <Kpi label="Accionistas directos" sub={hayCadenas ? 'Con sociedades en la cadena' : undefined}>{accionistas.length}</Kpi>
          <Kpi label="Mayor accionista" sub={mayor?.directa != null ? `${fmtPct(mayor.directa)}${(mayor.directa ?? 0) > 50 ? ' · controlante' : ''}` : undefined}>
            <span title={mayor?.nombre}>{mayor?.nombre || '—'}</span>
          </Kpi>
          <Kpi label="Suma del primer nivel">{accionistas.length > 0 ? <SumaBadge suma={suma} /> : '—'}</Kpi>
          <Kpi label="Directorio" sub={tambienAccionistas > 0 ? `${tambienAccionistas} también ${tambienAccionistas === 1 ? 'es accionista' : 'son accionistas'}` : undefined}>
            {directorio.length} {directorio.length === 1 ? 'miembro' : 'miembros'}
          </Kpi>
        </div>
      )}

      {/* Composición accionaria */}
      <Card
        title="Composición accionaria"
        subtitle={hayCadenas ? 'Directa: sobre su sociedad madre · Sobre la empresa: producto de la cadena' : 'Participación de cada accionista'}
        icon={<Network className="w-4 h-4" />}
      >
        {accionistas.length > 0 || editing ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-ink/50">
                  <th className="text-left font-semibold px-5 py-2.5">Accionista</th>
                  <th className="text-left font-semibold px-3 py-2.5">DNI / CUIT</th>
                  <th className="text-right font-semibold px-3 py-2.5">Directa</th>
                  <th className="text-left font-semibold px-5 py-2.5 w-[30%]">Sobre la empresa</th>
                </tr>
              </thead>
              <tbody>
                <FilasNivel lista={accionistas} nodos={arbol} path={BASE_ACC} />
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-ink/50">No se encontró la composición accionaria en la documentación. Se puede cargar a mano con "Editar valores".</p>
        )}
      </Card>

      {/* Final de cada cadena */}
      {hayCadenas && !editing && finales.length > 0 && (
        <Card
          title="Al final de la cadena"
          subtitle="Participación total sobre la empresa de cada persona o sociedad que no tiene socios informados, sumando todas sus cadenas"
        >
          <ul className="divide-y divide-ink/5">
            {finales.map(f => (
              <li key={(f.dni_cuit || f.nombre) + f.cadenas} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{f.nombre || 'Sin nombre'}</p>
                  <p className="text-[11px] text-ink/45 tabular-nums">
                    {f.dni_cuit || 'Sin DNI / CUIT'}{f.cadenas > 1 ? ` · ${f.cadenas} cadenas` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 w-48 shrink-0">
                  <div className="flex-1 h-1.5 rounded-full bg-ink/[0.07] overflow-hidden">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, f.indirecta ?? 0)}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums w-14 text-right">{fmtPct(f.indirecta, 1)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Directorio */}
      <Card title="Directorio y administración" icon={<Users className="w-4 h-4" />}>
        {directorio.length > 0 || editing ? (
          <div className="p-5">
            <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-3">
              {miembros.map(({ m, i }) => (
                <MiembroCard key={i} m={m} i={i} lista={directorio} accionista={esAccionista(m.nombre, nombres)} />
              ))}
            </div>
            <AddRowButton path={BASE_DIR} list={directorio} newItem={{ cargo: '', nombre: '' }} label="Agregar miembro" />
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-ink/50">No se encontró el directorio en la documentación. Se puede cargar a mano con "Editar valores".</p>
        )}
      </Card>
    </div>
  );
}

function MiembroCard({ m, i, lista, accionista }: { m: Miembro; i: number; lista: Miembro[]; accionista: boolean }) {
  const { editing } = useEdit();
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${editing ? 'border-brand-blue/40' : 'border-ink/10'} bg-panel`}>
      <span className="w-9 h-9 rounded-full bg-ink text-white text-xs font-semibold flex items-center justify-center shrink-0" aria-hidden="true">
        {iniciales(m.nombre)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-ink/50">
          <EditableText path={[...BASE_DIR, i, 'cargo']} value={m.cargo} display={m.cargo || 'Sin cargo'} />
        </p>
        <p className="font-medium text-ink">
          <EditableText path={[...BASE_DIR, i, 'nombre']} value={m.nombre} display={m.nombre || 'Sin nombre'} />
        </p>
        {accionista && !editing && (
          <span className="mt-1.5 inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink/[0.06] text-ink/70">
            También accionista
          </span>
        )}
      </div>
      <RemoveRowButton path={BASE_DIR} list={lista} index={i} />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2, Search, Trash2, X } from 'lucide-react';
import type { ExtractionResult } from '../types';
import { agruparPorEmpresa, EstadoCorrida, estadoCorrida, filtrarGrupos } from '../features/cases/historial';
import { CATEGORY_STATUS, STATUS } from './riskColors';
import { cn } from '../lib/utils';

// Historial del sidebar: una fila por empresa (agrupa corridas por CUIT o razón
// social, en el frontend). Clic abre la última corrida; el chevron despliega las
// anteriores. Buscador en vivo por razón social o CUIT.

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fechaHora = (iso: string) => {
  const d = new Date(iso);
  return `${fecha(iso)} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

// Estado de la corrida: score con color y categoría (nunca color solo), o texto.
function Estado({ e, compacto = false }: { e: EstadoCorrida; compacto?: boolean }) {
  if (e.tipo === 'score') {
    return (
      <span className="inline-flex items-center gap-1.5 shrink-0" title={`Riesgo ${e.score}/100 · ${e.etiqueta}`}>
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS[CATEGORY_STATUS[e.categoria]] }} />
        <span className="text-xs font-semibold tabular-nums text-white">{e.score}</span>
        {!compacto && <span className="text-[10px] text-white/55">{e.etiqueta}</span>}
      </span>
    );
  }
  if (e.tipo === 'en_proceso') return <span className="inline-flex items-center gap-1 text-[10px] text-white/60 shrink-0"><Loader2 className="w-3 h-3 animate-spin" />{e.etiqueta}</span>;
  if (e.tipo === 'error') return <span className="inline-flex items-center gap-1 text-[10px] text-white/80 shrink-0"><AlertCircle className="w-3 h-3" style={{ color: STATUS.critical }} />{e.etiqueta}</span>;
  return <span className="text-[10px] text-white/45 text-right leading-tight max-w-[110px]">{e.etiqueta}</span>;
}

export function HistorialEmpresas({ results, activeId, onAbrir, onEliminar }: {
  results: ExtractionResult[];
  activeId: string | null;
  onAbrir: (id: string) => void;
  onEliminar: (id: string) => void;
}) {
  const [consulta, setConsulta] = useState('');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const grupos = useMemo(() => agruparPorEmpresa(results), [results]);
  const visibles = useMemo(() => filtrarGrupos(grupos, consulta), [grupos, consulta]);
  const alternar = (clave: string) => setAbiertos(prev => {
    const n = new Set(prev);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });

  return (
    <div>
      {results.length > 0 && (
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={consulta}
            onChange={e => setConsulta(e.target.value)}
            placeholder="Buscar por razón social o CUIT"
            className="w-full bg-white/[0.06] border border-white/15 rounded-full pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-brand-green"
          />
          {consulta && (
            <button onClick={() => setConsulta('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white" title="Limpiar búsqueda">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {results.length === 0 ? (
          <p className="text-xs text-white/40 italic py-4">No hay casos recientes.</p>
        ) : visibles.length === 0 ? (
          <p className="text-xs text-white/40 italic py-4">Ninguna empresa coincide con "{consulta}".</p>
        ) : (
          visibles.map(g => {
            const activo = g.corridas.some(c => c.id === activeId);
            const abierto = abiertos.has(g.clave);
            const anteriores = g.corridas.length > 1;
            return (
              <div key={g.clave} className={cn('border-l-2 transition-all', activo ? 'border-brand-green bg-white/10' : 'border-transparent hover:bg-white/5')}>
                <div onClick={() => onAbrir(g.ultima.id)} className={cn('group pl-3 pr-2 py-2.5 cursor-pointer', activo ? 'text-white' : 'text-white/75 hover:text-white')}>
                  <p className="text-xs font-medium truncate" title={g.nombre}>{g.nombre}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-white/45 whitespace-nowrap">
                      {fecha(g.ultima.timestamp)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <Estado e={estadoCorrida(g.ultima)} />
                      {anteriores ? (
                        <button
                          onClick={e => { e.stopPropagation(); alternar(g.clave); }}
                          className="p-0.5 text-white/45 hover:text-white"
                          title={abierto ? 'Ocultar corridas' : 'Ver corridas anteriores'}
                          aria-expanded={abierto}
                        >
                          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', abierto && 'rotate-180')} />
                        </button>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); onEliminar(g.ultima.id); }}
                          className="p-0.5 text-white/40 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Eliminar corrida"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  </div>
                </div>
                {abierto && anteriores && (
                  <ul className="pb-2 pl-3 pr-2 space-y-0.5">
                    {g.corridas.map(c => (
                      <li
                        key={c.id}
                        onClick={() => onAbrir(c.id)}
                        className={cn('group flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer', c.id === activeId ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white')}
                      >
                        <span className="text-[10px] font-mono whitespace-nowrap">{fechaHora(c.timestamp)}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Estado e={estadoCorrida(c)} compacto />
                          <button
                            onClick={e => { e.stopPropagation(); onEliminar(c.id); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-white/40 hover:text-white"
                            title="Eliminar corrida"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

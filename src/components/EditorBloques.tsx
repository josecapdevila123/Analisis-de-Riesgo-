import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { BloqueTexto, bloqueVacio } from '../features/textos/bloques';

// Texto por bloques (título + texto) para Historia y Mercado. Se edita con el
// mismo "Editar valores" del header: en edición se pueden editar, sacar (−) y
// agregar (+) bloques; "Guardar cambios" lo guarda junto con los números. La
// versión guardada reemplaza al original en la pantalla, el PDF y la opinión.

// Prosa de marca: Inter, alineada a la izquierda (el manual no permite justificar),
// renglones de ~75 caracteres para que el borde derecho no quede desparejo,
// títulos en Poppins y colores solo de tokens.
export const PROSA = 'prose prose-sm md:prose-base max-w-[75ch] text-left text-ink/80 prose-p:text-left prose-p:leading-relaxed prose-li:text-left prose-headings:font-display prose-headings:font-semibold prose-headings:text-ink prose-strong:text-ink prose-a:text-ink prose-a:font-medium prose-a:underline prose-a:decoration-brand-green prose-a:decoration-2 prose-a:underline-offset-2 hover:prose-a:decoration-ink print:max-w-none';

type Props = {
  editando: boolean;
  bloques: BloqueTexto[];            // en edición: el borrador; si no, la versión vigente
  editado: boolean;                  // hay una versión editada guardada (o se está editando)
  original: React.ReactNode;         // vista del texto de la IA
  onCambiar: (bloques: BloqueTexto[]) => void;
  onRestaurar: () => void;
};

export function EditorBloques({ editando, bloques, editado, original, onCambiar, onRestaurar }: Props) {
  if (!editando) {
    if (!editado) return <>{original}</>;
    return (
      <div className="bg-white border border-ink/15 p-8 md:p-10 space-y-6">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue">Editado por el analista</p>
        {bloques.length === 0 && <p className="text-sm text-ink/50">Se sacaron todos los bloques.</p>}
        {bloques.map(b => (
          <section key={b.id}>
            {b.titulo && <h3 className="font-display text-lg font-semibold text-ink mb-2">{b.titulo}</h3>}
            <div className={PROSA}><ReactMarkdown>{b.texto}</ReactMarkdown></div>
          </section>
        ))}
      </div>
    );
  }

  const cambiar = (id: string, campo: 'titulo' | 'texto', valor: string) => onCambiar(bloques.map(x => (x.id === id ? { ...x, [campo]: valor } : x)));
  const agregarDespues = (idx: number) => onCambiar([...bloques.slice(0, idx + 1), bloqueVacio(), ...bloques.slice(idx + 1)]);
  const sacar = (id: string) => onCambiar(bloques.filter(x => x.id !== id));

  return (
    <div className="bg-white border border-brand-blue/40 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink/60">Editá títulos y textos, sacá (−) lo que no haga falta o agregá (+) un bloque. Se guarda con "Guardar cambios" y es lo que sale en el PDF y lee la opinión.</p>
        {editado && (
          <button onClick={onRestaurar} className="inline-flex items-center gap-1 text-xs text-ink/55 hover:text-ink underline underline-offset-2">
            <RotateCcw className="w-3 h-3" /> Restaurar original
          </button>
        )}
      </div>
      {bloques.length === 0 && (
        <button onClick={() => onCambiar([bloqueVacio()])} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-ink">
          <Plus className="w-3.5 h-3.5" /> Agregar bloque
        </button>
      )}
      {bloques.map((b, idx) => (
        <div key={b.id} className="space-y-1.5">
          <div className="border border-ink/10 rounded p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input value={b.titulo} onChange={e => cambiar(b.id, 'titulo', e.target.value)} placeholder="Título del bloque (opcional)"
                className="flex-1 bg-brand-blue/5 border border-brand-blue/40 rounded-sm px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-blue" />
              <button onClick={() => sacar(b.id)} className="w-7 h-7 rounded-full border border-ink/20 flex items-center justify-center text-ink/60 hover:border-ink hover:text-ink" title="Sacar este bloque" aria-label="Sacar este bloque">
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea value={b.texto} onChange={e => cambiar(b.id, 'texto', e.target.value)} rows={Math.min(14, Math.max(3, b.texto.split('\n').length + 1))}
              className="w-full bg-brand-blue/5 border border-brand-blue/40 rounded-sm px-2 py-1.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          </div>
          <button onClick={() => agregarDespues(idx)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-ink" title="Agregar un bloque acá">
            <Plus className="w-3.5 h-3.5" /> Agregar bloque
          </button>
        </div>
      ))}
    </div>
  );
}

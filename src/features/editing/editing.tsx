import React, { createContext, useContext, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export type Path = Array<string | number>;

type EditContextValue = {
  editing: boolean;
  update: (path: Path, value: unknown) => void;
};

const EditContext = createContext<EditContextValue>({ editing: false, update: () => {} });

export const EditProvider = EditContext.Provider;
export const useEdit = () => useContext(EditContext);

// Set inmutable por path. Crea objetos/arrays intermedios si faltan.
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const base: any = obj ?? (typeof head === 'number' ? [] : {});
  const copy: any = Array.isArray(base) ? [...base] : { ...base };
  copy[head] = setIn(base[head], rest, value);
  return copy;
}

export function getIn(obj: unknown, path: Path): unknown {
  return path.reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// Acepta formato es-AR ("1.234.567,89") y formato con punto decimal ("1234567.89").
export function parseNumberInput(raw: string): number | null {
  let s = raw.trim().replace(/[$\s%]/g, '');
  if (s === '' || s === '-') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const toInputString = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? ''
    : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 6, useGrouping: false }).format(value);

const inputClass =
  'bg-brand-blue/5 border border-brand-blue/50 rounded-sm px-1.5 py-0.5 font-mono text-ink focus:outline-none focus:ring-2 focus:ring-brand-blue';

type EditableNumberProps = {
  path: Path;
  value: number | null | undefined;
  // Campos obligatorios del schema: vacío → 0 en vez de null.
  required?: boolean;
  display?: React.ReactNode;
  className?: string;
  inputClassName?: string;
};

export function EditableNumber({ path, value, required, display, className, inputClassName }: EditableNumberProps) {
  const { editing, update } = useEdit();
  const [text, setText] = useState(toInputString(value));

  useEffect(() => setText(toInputString(value)), [value]);

  if (!editing) return <span className={className}>{display ?? toInputString(value)}</span>;

  const commit = () => {
    const parsed = parseNumberInput(text);
    const next = parsed === null && required ? 0 : parsed;
    if (next !== (value ?? null)) update(path, next);
    setText(toInputString(next));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(toInputString(value));
      }}
      onClick={e => e.stopPropagation()}
      placeholder={required ? '0' : '—'}
      className={cn(inputClass, 'w-28 max-w-full text-right', inputClassName)}
    />
  );
}

type EditableTextProps = {
  path: Path;
  value: string | null | undefined;
  display?: React.ReactNode;
  className?: string;
  inputClassName?: string;
  multiline?: boolean;
};

export function EditableText({ path, value, display, className, inputClassName, multiline }: EditableTextProps) {
  const { editing, update } = useEdit();
  const [text, setText] = useState(value ?? '');

  useEffect(() => setText(value ?? ''), [value]);

  if (!editing) return <span className={className}>{display ?? value}</span>;

  const commit = () => {
    if (text !== (value ?? '')) update(path, text);
  };

  if (multiline) {
    return (
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        rows={3}
        className={cn(inputClass, 'w-full font-sans', inputClassName)}
      />
    );
  }

  return (
    <input
      type="text"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(value ?? '');
      }}
      onClick={e => e.stopPropagation()}
      className={cn(inputClass, 'w-full font-sans', inputClassName)}
    />
  );
}

export function EditableSelect({ path, value, options, display }: {
  path: Path;
  value: string;
  options: string[];
  display?: React.ReactNode;
}) {
  const { editing, update } = useEdit();
  if (!editing) return <>{display ?? value}</>;
  return (
    <select value={value} onChange={e => update(path, e.target.value)} className={cn(inputClass, 'font-sans')}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Botones para agregar / quitar filas de listas, visibles solo en modo edición.
export function AddRowButton({ path, list, newItem, label = 'Agregar fila' }: {
  path: Path;
  list: unknown[] | null | undefined;
  newItem: unknown;
  label?: string;
}) {
  const { editing, update } = useEdit();
  if (!editing) return null;
  return (
    <button
      type="button"
      onClick={() => update(path, [...(list ?? []), newItem])}
      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-ink print:hidden"
    >
      <Plus className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

export function RemoveRowButton({ path, list, index }: { path: Path; list: unknown[]; index: number }) {
  const { editing, update } = useEdit();
  if (!editing) return null;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); update(path, list.filter((_, i) => i !== index)); }}
      className="p-1 text-red-500 hover:text-red-700"
      title="Quitar fila"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

// Booleano con "sin dato" (null): Sí / No / —.
export function EditableBoolean({ path, value }: { path: Path; value: boolean | null | undefined }) {
  const { editing, update } = useEdit();
  const label = value === true ? 'Sí' : value === false ? 'No' : '—';
  if (!editing) return <>{label}</>;
  return (
    <select
      value={value === true ? 'si' : value === false ? 'no' : ''}
      onChange={e => update(path, e.target.value === 'si' ? true : e.target.value === 'no' ? false : null)}
      className={cn(inputClass, 'font-sans')}
    >
      <option value="">Sin dato</option>
      <option value="si">Sí</option>
      <option value="no">No</option>
    </select>
  );
}

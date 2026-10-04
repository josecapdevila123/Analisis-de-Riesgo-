import React, { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import type { User } from 'firebase/auth';

// Avatar a la derecha del header (como Gmail): al hacer clic muestra el mail y "Cerrar sesión".
export function MenuUsuario({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  const avatar = (tam: string) => user.photoURL ? (
    <img src={user.photoURL} alt="" className={`${tam} rounded-full`} referrerPolicy="no-referrer" />
  ) : (
    <span className={`${tam} rounded-full bg-brand-green text-ink flex items-center justify-center text-xs font-semibold`}>
      {user.email?.[0].toUpperCase()}
    </span>
  );

  return (
    <div ref={ref} className="relative ml-1">
      <button
        onClick={() => setAbierto(a => !a)}
        className="rounded-full ring-2 ring-transparent hover:ring-white/30 transition"
        title={user.email ?? 'Cuenta'}
        aria-label="Cuenta"
        aria-expanded={abierto}
      >
        {avatar('w-9 h-9')}
      </button>
      {abierto && (
        <div className="absolute right-0 top-11 z-50 w-72 bg-white border border-ink/15 rounded-lg shadow-lg p-4">
          <div className="flex items-center gap-3">
            {avatar('w-10 h-10 shrink-0')}
            <div className="min-w-0">
              {user.displayName && <p className="text-sm font-semibold truncate">{user.displayName}</p>}
              <p className="text-xs text-ink/60 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => { setAbierto(false); onLogout(); }}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-ink/20 text-xs font-semibold hover:border-ink transition"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

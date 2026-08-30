/**
 * ============================================================================
 * Archivo: PreferenciasContext.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Contexto único que maneja tema, fuente y tamaño de letra para el usuario.
 * Todo se guarda en localStorage (sin backend).
 *
 * Uso: envolver la app con <PreferenciasProvider>
 * y consumir con usePreferencias() en cualquier componente hijo.
 * ============================================================================
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Tema = 'light' | 'dark' | 'system';
type Fuente = 'Inter' | 'SF Pro' | 'System';
type TamanoFuente = 'small' | 'medium' | 'large';

interface PreferenciasContextValue {
  tema: Tema;
  fuente: Fuente;
  tamanoFuente: TamanoFuente;
  cargando: boolean;
  setTema: (value: Tema) => void;
  setFuente: (value: Fuente) => void;
  setTamanoFuente: (value: TamanoFuente) => void;
}

const PreferenciasContext = createContext<PreferenciasContextValue | undefined>(undefined);

const STORAGE_KEY = 'condominium_preferences';

const cargarPreferencias = (): { tema: Tema; fuente: Fuente; tamanoFuente: TamanoFuente } => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        tema: parsed.tema || 'system',
        fuente: parsed.fuente || 'Inter',
        tamanoFuente: parsed.tamanoFuente || 'medium',
      };
    }
  } catch { /* ignore */ }
  return { tema: 'system', fuente: 'Inter', tamanoFuente: 'medium' };
};

const guardarPreferencias = (prefs: { tema: Tema; fuente: Fuente; tamanoFuente: TamanoFuente }) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
};

const aplicarTema = (value: Tema) => {
  const prefiereOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const esOscuro = value === 'dark' || (value === 'system' && prefiereOscuro);
  document.documentElement.setAttribute('data-theme', esOscuro ? 'dark' : 'light');
};

const aplicarFuente = (value: Fuente) => {
  document.body.style.fontFamily = value === 'Inter' ? "'Inter', sans-serif" :
    value === 'SF Pro' ? "'SF Pro Display', -apple-system, sans-serif" :
      "system-ui, -apple-system, sans-serif";
};

const aplicarTamano = (value: TamanoFuente) => {
  document.documentElement.style.fontSize = value === 'small' ? '14px' : value === 'large' ? '18px' : '16px';
};

export function PreferenciasProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>('system');
  const [fuente, setFuenteState] = useState<Fuente>('Inter');
  const [tamanoFuente, setTamanoFuenteState] = useState<TamanoFuente>('medium');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const prefs = cargarPreferencias();
    setTemaState(prefs.tema);
    setFuenteState(prefs.fuente);
    setTamanoFuenteState(prefs.tamanoFuente);
    aplicarTema(prefs.tema);
    aplicarFuente(prefs.fuente);
    aplicarTamano(prefs.tamanoFuente);
    setCargando(false);
  }, []);

  const setTema = (value: Tema) => {
    setTemaState(value);
    aplicarTema(value);
    guardarPreferencias({ tema: value, fuente, tamanoFuente });
  };

  const setFuente = (value: Fuente) => {
    setFuenteState(value);
    aplicarFuente(value);
    guardarPreferencias({ tema, fuente: value, tamanoFuente });
  };

  const setTamanoFuente = (value: TamanoFuente) => {
    setTamanoFuenteState(value);
    aplicarTamano(value);
    guardarPreferencias({ tema, fuente, tamanoFuente: value });
  };

  return (
    <PreferenciasContext.Provider value={{ tema, fuente, tamanoFuente, cargando, setTema, setFuente, setTamanoFuente }}>
      {children}
    </PreferenciasContext.Provider>
  );
}

export function usePreferencias() {
  const ctx = useContext(PreferenciasContext);
  if (!ctx) {
    throw new Error('usePreferencias debe usarse dentro de <PreferenciasProvider>');
  }
  return ctx;
}

/**
 * ============================================================================
 * Archivo: Toast.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Muestra notificaciones temporales (toasts) en la esquina inferior derecha.
 * Se usa para informar al usuario sobre resultados de acciones (éxito, error,
 * información) sin interrumpir lo que está haciendo.
 *
 * Props / API que expone
 * - showToast(mensaje, tipo)  → Muestra un toast por 3 segundos
 *   - mensaje: string (texto a mostrar)
 *   - tipo: 'success' | 'error' | 'info' (color del borde)
 *
 * Quién lo utiliza
 * - Cualquier componente que necesite mostrar un mensaje temporal
 * - Ej: NuevaReservaPage, RegistrarVisitantePage, MisReservasPage
 * - GuardiaVisitas
 *
 * Flujo
 * Componente → showToast('Reserva creada', 'success')
 *   → Toast aparece en pantalla
 *   → Desaparece automáticamente a los 3 segundos
 *
 * ============================================================================
 */

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" id="toastContainer">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

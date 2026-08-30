/**
 * ============================================================================
 * Archivo: Alert.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Sistema de diálogos personalizado que reemplaza los nativos de JavaScript:
 * - showAlert(...)  → reemplaza window.alert()  (modal informativo)
 * - confirmar(...)  → reemplaza window.confirm() (modal de confirmación con
 *                     Cancelar / Confirmar, devuelve Promise<boolean>)
 * Ambos muestran un modal centrado con ícono según el tipo, título y mensaje,
 * y respetan el tema claro/oscuro de la app.
 *
 * API
 * - showAlert(mensaje)                      → alerta informativa (título "Aviso")
 * - showAlert(mensaje, { titulo, tipo })    → personalizada
 * - confirmar(mensaje)                      → Promise<boolean>
 * - confirmar(mensaje, { titulo, tipo, confirmarTexto, cancelarTexto })
 *
 *   tipo: 'info' | 'success' | 'error' | 'warning'
 *
 * Quién lo utiliza
 * - Todas las páginas que antes usaban alert() nativo (admin, guardia, auth)
 * - ReservasPage y MisVisitantesPage para las confirmaciones de cancelación
 *
 * Flujo
 * Componente → const ok = await confirmar('Texto', { tipo: 'warning' })
 *   → Modal de confirmación aparece con los botones Cancelar / Confirmar
 *   → ok = true si confirma; false si cancela, pulsa Escape o clic fuera
 *
 * ============================================================================
 */

import { useState, useRef, useCallback, createContext, useContext, useEffect, type ReactNode } from 'react';

export type AlertTipo = 'info' | 'success' | 'error' | 'warning';

interface AlertOptions {
  titulo?: string;
  tipo?: AlertTipo;
}

interface ConfirmOptions {
  titulo?: string;
  tipo?: AlertTipo;
  confirmarTexto?: string;
  cancelarTexto?: string;
}

interface ConfirmState {
  mensaje: string;
  titulo: string;
  tipo: AlertTipo;
  confirmarTexto: string;
  cancelarTexto: string;
  resolve: (ok: boolean) => void;
}

interface AlertContextType {
  showAlert: (mensaje: string, opciones?: AlertOptions) => void;
  confirmar: (mensaje: string, opciones?: ConfirmOptions) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType | null>(null);

const ICONOS: Record<AlertTipo, string> = {
  info: 'fa-info-circle',
  success: 'fa-check-circle',
  error: 'fa-times-circle',
  warning: 'fa-exclamation-triangle'
};

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerta, setAlerta] = useState<{ mensaje: string; titulo: string; tipo: AlertTipo } | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmState | null>(null);
  // Ref con el resolver pendiente: se resuelve FUERA del updater de estado
  // (los updaters deben ser puros y React StrictMode los invoca dos veces en dev).
  const confirmacionRef = useRef<ConfirmState | null>(null);

  const showAlert = useCallback((mensaje: string, opciones: AlertOptions = {}) => {
    setAlerta({
      mensaje,
      titulo: opciones.titulo || 'Aviso',
      tipo: opciones.tipo || 'info'
    });
  }, []);

  const cerrar = useCallback(() => setAlerta(null), []);

  const confirmar = useCallback((mensaje: string, opciones: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const estado: ConfirmState = {
        mensaje,
        titulo: opciones.titulo || '¿Estás seguro?',
        tipo: opciones.tipo || 'warning',
        confirmarTexto: opciones.confirmarTexto || 'Confirmar',
        cancelarTexto: opciones.cancelarTexto || 'Cancelar',
        resolve
      };
      confirmacionRef.current = estado;
      setConfirmacion(estado);
    });
  }, []);

  const cerrarConfirmacion = useCallback((ok: boolean) => {
    const pendiente = confirmacionRef.current;
    confirmacionRef.current = null;
    setConfirmacion(null);
    if (pendiente) pendiente.resolve(ok);
  }, []);

  // Cerrar con tecla Escape mientras un diálogo está visible
  useEffect(() => {
    if (!alerta && !confirmacion) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (alerta) cerrar();
      if (confirmacion) cerrarConfirmacion(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [alerta, confirmacion, cerrar, cerrarConfirmacion]);

  return (
    <AlertContext.Provider value={{ showAlert, confirmar }}>
      {children}

      {/* Alerta informativa (reemplaza window.alert) */}
      {alerta && (
        <div className="modal-overlay open alert-overlay" onClick={cerrar}>
          <div
            className="modal alert-modal"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="alertTitulo"
            aria-describedby="alertMensaje"
          >
            <div className={`alert-icon alert-icon-${alerta.tipo}`}>
              <i className={`fas ${ICONOS[alerta.tipo]}`}></i>
            </div>
            <h3 id="alertTitulo">{alerta.titulo}</h3>
            <p id="alertMensaje" className="alert-mensaje">{alerta.mensaje}</p>
            <div className="actions">
              <button className="btn-primary alert-aceptar" onClick={cerrar} autoFocus>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación (reemplaza window.confirm) */}
      {confirmacion && (
        <div className="modal-overlay open alert-overlay" onClick={() => cerrarConfirmacion(false)}>
          <div
            className="modal alert-modal"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmarTitulo"
            aria-describedby="confirmarMensaje"
          >
            <div className={`alert-icon alert-icon-${confirmacion.tipo}`}>
              <i className={`fas ${ICONOS[confirmacion.tipo]}`}></i>
            </div>
            <h3 id="confirmarTitulo">{confirmacion.titulo}</h3>
            <p id="confirmarMensaje" className="alert-mensaje">{confirmacion.mensaje}</p>
            <div className="actions">
              <button className="btn-secondary" onClick={() => cerrarConfirmacion(false)}>
                {confirmacion.cancelarTexto}
              </button>
              <button className="btn-danger" onClick={() => cerrarConfirmacion(true)} autoFocus>
                {confirmacion.confirmarTexto}
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within AlertProvider');
  return ctx;
}

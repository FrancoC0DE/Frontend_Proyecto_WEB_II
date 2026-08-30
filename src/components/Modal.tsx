/**
 * ============================================================================
 * Archivo: Modal.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Componente reutilizable para mostrar ventanas modales de confirmación.
 * Se usa para preguntar al usuario antes de realizar acciones destructivas
 * (eliminar, deshabilitar, cerrar sesión, etc.).
 *
 * Props que recibe
 * - isOpen: boolean       → Controla si el modal se muestra
 * - onClose: () => void   → Se llama al cerrar (clic fuera, Escape)
 * - title: string         → Título del modal
 * - message?: string      → Mensaje opcional
 * - children?: ReactNode  → Contenido personalizado
 * - footer?: ReactNode    → Botones personalizados
 * - confirmText?: string  → Texto del botón confirmar
 * - confirmClassName?: string → Clase CSS del botón (default: 'btn-danger')
 * - onConfirm?: () => void → Se llama al confirmar
 *
 * Quién lo utiliza
 * - AreasPage (confirmar deshabilitar área)
 * - PersonalPage (confirmar deshabilitar empleado)
 * - Cualquier página que necesite confirmación
 * - GlobalModals en App.tsx (cierre de sesión)
 *
 * Eventos que genera
 * - Cierra con tecla Escape
 * - Cierra al hacer clic fuera del modal
 * - Confirma al hacer clic en el botón de confirmar
 *
 * ============================================================================
 */

import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  children?: ReactNode;
  footer?: ReactNode;
  confirmText?: string;
  confirmClassName?: string;
  onConfirm?: () => void;
}

export default function Modal({
  isOpen, onClose, title, message, children, footer,
  confirmText, confirmClassName = 'btn-danger', onConfirm
}: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" id="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        {children}
        <div className="actions">
          {footer || (
            <>
              <button className="btn-secondary" onClick={onClose}>Cancelar</button>
              {onConfirm && (
                <button className={confirmClassName} id="modalConfirmBtn" onClick={onConfirm}>
                  {confirmText || 'Confirmar'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

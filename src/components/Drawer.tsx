/**
 * ============================================================================
 * Archivo: Drawer.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Componente reutilizable que muestra un panel lateral deslizante (drawer).
 * Se usa para formularios de creación/edición y para ver detalles de un
 * elemento sin cambiar de página.
 *
 * Props que recibe
 * - isOpen: boolean         → Controla si el drawer se muestra
 * - onClose: () => void     → Se llama al cerrar
 * - title: string           → Título del drawer
 * - size?: 'sm' | 'md' | 'lg' → Ancho del drawer (default: 'lg')
 * - children: ReactNode     → Contenido del cuerpo
 * - footer?: ReactNode      → Botones personalizados
 * - onSave?: () => void     → Función para guardar
 * - saveText?: string       → Texto del botón guardar (default: 'Guardar')
 *
 * Quién lo utiliza
 * - AreasPage (crear/editar áreas)
 * - PersonalPage (crear/editar empleados)
 * - ReservasPage (ver detalle de reserva)
 * - VisitasPage (ver detalle de visita)
 * - ProfileDrawer (editar perfil del usuario)
 *
 * Eventos que genera
 * - Cierra con tecla Escape
 * - Cierra al hacer clic fuera
 * - Guarda al hacer clic en el botón Guardar
 *
 * ============================================================================
 */

import { useEffect, type ReactNode } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
  onSave?: () => void;
  saveText?: string;
}

export default function Drawer({
  isOpen, onClose, title, size = 'lg', children, footer, onSave, saveText = 'Guardar'
}: DrawerProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  return (
    <>
      <div className={`drawer-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>
      <div className={`drawer drawer-${size} ${isOpen ? 'open' : ''}`} id="drawer">
        <div className="drawer-header">
          <h3 id="drawerTitle">{title}</h3>
          <button className="close-drawer" onClick={onClose} aria-label="Cerrar">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="drawer-body" id="drawerBody">
          {children}
        </div>
        <div className="drawer-footer" id="drawerFooter">
          {footer || (
            <>
              <button className="btn-secondary" onClick={onClose}>Cancelar</button>
              {onSave && (
                <button className="btn-primary" id="drawerSaveBtn" onClick={onSave}>
                  {saveText}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

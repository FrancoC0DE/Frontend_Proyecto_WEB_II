/**
 * ============================================================================
 * Archivo: NotificationDropdown.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Muestra un dropdown con las notificaciones del usuario. Se abre al hacer
 * clic en la campana de la barra de navegación. Permite marcar notificaciones
 * como leídas individualmente o todas a la vez.
 *
 * Props que recibe
 * - role: UserRole → Rol del usuario para mostrar sus notificaciones
 *
 * Quién lo utiliza
 * - Navbar.tsx (se renderiza dentro de la barra superior)
 *
 * Datos que consume
 * - adminNotifications | guardiaNotifications | inquilinoNotifications
 *   (según el rol, desde DataContext)
 *
 * ============================================================================
 */

import { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { getTimeAgo } from '../hooks/useLocalDate';
import type { UserRole } from '../types';

/** Cada cuánto se recalcula el texto relativo ("hace 5 min"/"hace 2 h"). */
const INTERVALO_REFRESCO_MS = 30_000;

interface NotificationDropdownProps {
  role: UserRole;
}

export default function NotificationDropdown({ role }: NotificationDropdownProps) {
  const {
    adminNotifications, guardiaNotifications,
    inquilinoNotifications, markAsRead, markAllRead,
    recargarNotificaciones
  } = useData();
  const [isOpen, setIsOpen] = useState(false);
  // Fuerza un re-render periódico para que los tiempos relativos se actualicen
  // mientras el dropdown está abierto ("hace 1 min" → "hace 2 min", etc.).
  const [, setTick] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const notifications = role === 'admin' ? adminNotifications
    : role === 'guardia' ? guardiaNotifications
    : inquilinoNotifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Refrescar los tiempos relativos cada 30 s mientras el dropdown está abierto.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setTick(t => t + 1), INTERVALO_REFRESCO_MS);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Al abrir la campana se consulta la BD al instante (además del polling
  // periódico del DataContext) para que una notificación recién creada por un
  // trigger aparezca sin esperar al siguiente ciclo.
  useEffect(() => {
    if (!isOpen) return;
    void recargarNotificaciones();
  }, [isOpen, recargarNotificaciones]);

  return (
    <div className="notif-wrapper" ref={wrapperRef}>
      <button
        className="icon-btn"
        id="notifToggle"
        aria-label="Notificaciones"
        onClick={e => { e.stopPropagation(); setIsOpen(!isOpen); }}
      >
        <i className="fas fa-bell"></i>
        {unreadCount > 0 && <span className="badge-count" id="notifBadge">{unreadCount}</span>}
      </button>
      <div className={`notif-dropdown ${isOpen ? 'open' : ''}`} id="notifDropdown">
        <div className="notif-header">
          <h4>Notificaciones</h4>
          <button id="markAllRead"
            onClick={() => markAllRead(role)}>Marcar todas como leídas</button>
        </div>
        <div id="notifList">
          {notifications.length === 0 ? (
            <div style={{
              padding: 'var(--space-4)', textAlign: 'center',
              color: 'var(--text-muted)'
            }}>
              No hay notificaciones
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className="notif-item" onClick={() => { markAsRead(role, n.id); }}>
                <i className={`fas ${n.icon} notif-icon ${n.read ? '' : 'unread'}`}></i>
                <div className="notif-content">
                  <div className="notif-header-row">
                    <span className="notif-title">{n.title}</span>
                    <span className="notif-time">{getTimeAgo(n.timestamp)}</span>
                  </div>
                  <div className="notif-msg">{n.message}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

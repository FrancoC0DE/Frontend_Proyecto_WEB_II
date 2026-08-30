/**
 * ============================================================================
 * Archivo: Navbar.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Barra de navegación superior que muestra el título de la página actual,
 * un saludo al usuario, el dropdown de notificaciones y el avatar.
 *
 * Props que recibe
 * - pageTitle: string       → Título de la página actual
 * - breadcrumb: string      → Ruta de navegación (ej: "/ Dashboard")
 * - profile: ProfileData    → Datos del perfil del usuario
 * - onToggleSidebar: fn     → Abre/cierra el sidebar en móvil
 * - onAvatarClick: fn       → Abre el drawer de perfil
 * - role: UserRole          → Rol del usuario ('admin', 'guardia', 'inquilino')
 *
 * Quién lo utiliza
 * - AdminLayout, GuardiaLayout, InquilinoLayout
 *
 * Componentes que utiliza
 * - NotificationDropdown (para mostrar notificaciones)
 *
 * ============================================================================
 */

import NotificationDropdown from './NotificationDropdown';
import { getGreeting } from '../hooks/useLocalDate';
import type { ProfileData, UserRole } from '../types';

interface NavbarProps {
  pageTitle: string;
  breadcrumb: string;
  profile: ProfileData;
  onToggleSidebar: () => void;
  onAvatarClick: () => void;
  role: UserRole;
}

export default function Navbar({
  pageTitle, breadcrumb, profile, onToggleSidebar, onAvatarClick, role
}: NavbarProps) {
  const firstLetter = profile.nombre?.charAt(0)?.toUpperCase() || '?';

  return (
    <header className="navbar">
      <div className="navbar-left">
        <button className="icon-btn" id="menuToggle"
          aria-label="Abrir menú" onClick={onToggleSidebar}>
          <i className="fas fa-bars"></i>
        </button>
        <h2 id="pageTitle">{pageTitle}</h2>
        <span className="breadcrumb" id="breadcrumb">{breadcrumb}</span>
      </div>
      <div className="navbar-right">
        <span className="greeting" id="greetingMessage">
          {getGreeting()}, <span id="nombreSaludo">{profile.nombre}</span>
        </span>
        <NotificationDropdown role={role} />
        <div className="avatar-wrapper" id="avatarWrapper">
          <div className="avatar" id="avatarDisplay"
            onClick={onAvatarClick} style={{ cursor: 'pointer' }}>
            {profile.avatar ? (
              <img id="avatarImg" src={profile.avatar} alt="Foto de perfil" />
            ) : (
              <span id="avatarFallback">{firstLetter}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

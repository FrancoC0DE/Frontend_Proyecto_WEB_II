/**
 * ============================================================================
 * Archivo: Sidebar.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Barra lateral de navegación que contiene los enlaces a las diferentes
 * secciones del panel según el rol del usuario.
 *
 * Props que recibe
 * - role?: UserRole         → Rol del usuario (para mostrar opciones)
 * - currentPage: string     → Página actual (para resaltar el enlace activo)
 * - onNavigate: (page) => void → Función para cambiar de página
 * - brandIcon: string       → Icono de la marca (ej: 'fa-building')
 * - navGroups: NavGroup[]   → Grupos de navegación con sus items
 *
 * Quién lo utiliza
 * - AdminLayout, GuardiaLayout, InquilinoLayout
 *
 * Eventos que genera
 * - Al hacer clic en un enlace, navega a la página correspondiente
 * - En móvil, cierra el sidebar automáticamente
 * - El botón de cerrar sesión usa el modal global en App.tsx
 *
 * ============================================================================
 */

import type { UserRole } from '../types';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  page: string;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

interface SidebarProps {
  role?: UserRole;
  currentPage: string;
  onNavigate: (page: string) => void;
  brandIcon: string;
  navGroups: NavGroup[];
}

export default function Sidebar({ currentPage, onNavigate, brandIcon, navGroups }: SidebarProps) {
  const closeIfMobile = () => {
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebarOverlay')?.classList.remove('open');
    }
  };

  return (
    <>
      <div className="sidebar-overlay" id="sidebarOverlay" onClick={() => {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('open');
      }}></div>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon"><i className={`fas ${brandIcon}`}></i></div>
          <span>Condominium</span>
        </div>
        <nav className="sidebar-nav">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {group.items.map(item => (
                <a
                  key={item.page}
                  href={`#${item.page}`}
                  className={currentPage === item.page ? 'active' : ''}
                  data-page={item.page}
                  onClick={e => {
                    e.preventDefault();
                    onNavigate(item.page);
                    closeIfMobile();
                  }}
                >
                  <i className={`fas ${item.icon}`}></i> {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a href="#" id="logoutBtn" className="btn-logout">
            <i className="fas fa-sign-out-alt"></i> Cerrar sesión
          </a>
        </div>
      </aside>
    </>
  );
}

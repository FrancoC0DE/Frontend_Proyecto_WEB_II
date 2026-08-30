/**
 * ============================================================================
 * Archivo: AdminLayout.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Layout principal del panel de Administrador. Renderiza el sidebar con la
 * navegación, la barra superior (Navbar) y el contenido de la página activa.
 *
 * Componentes que utiliza
 * - Sidebar (navegación lateral con grupos: Gestión, Operación, Finanzas, Sistema)
 * - Navbar (barra superior con título, notificaciones y avatar)
 * - ProfileDrawer (editar perfil del usuario)
 * - useAuth (contexto de autenticación para perfil y cierre de sesión)
 *
 * Navegación
 * Las páginas se navegan mediante hash (#dashboard, #personal, #reservas, etc.)
 * El hash se lee desde window.location.hash y cambia mediante onNavigate().
 *
 * ============================================================================
 */

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import ProfileDrawer from '../../components/ProfileDrawer';

interface AdminLayoutProps {
  children?: ReactNode;
}

const navGroups = [
  { items: [{ href: '#dashboard', label: 'Dashboard', icon: 'fa-th-large', page: 'dashboard' }] },
  {
    label: 'Gestión',
    items: [
      { href: '#personal', label: 'Personal', icon: 'fa-users', page: 'personal' },
      { href: '#residentes', label: 'Residentes', icon: 'fa-user-friends', page: 'residentes' },
      { href: '#contratos', label: 'Contratos', icon: 'fa-file-signature', page: 'contratos' },
      { href: '#departamentos', label: 'Departamentos', icon: 'fa-door-open', page: 'departamentos' },
    ]
  },
  {
    label: 'Operación',
    items: [
      { href: '#reservas', label: 'Reservas', icon: 'fa-calendar-check', page: 'reservas' },
      { href: '#areas', label: 'Áreas comunes', icon: 'fa-umbrella-beach', page: 'areas' },
      { href: '#visitas-autorizadas', label: 'Visitas autorizadas', icon: 'fa-user-check', page: 'visitas-autorizadas' },
    ]
  },
  {
    label: 'Finanzas',
    items: [
      { href: '#pagos', label: 'Pagos', icon: 'fa-credit-card', page: 'pagos' },
      { href: '#reportes', label: 'Reportes', icon: 'fa-chart-bar', page: 'reportes' },
      { href: '#facturacion', label: 'Facturación Electrónica', icon: 'fa-file-invoice-dollar', page: 'facturacion' },
    ]
  },
  {
    // Módulo de auditoría: con título propio para separarlo del resto.
    label: 'Bitácora',
    items: [
      { href: '#bitacora', label: 'Bitácora', icon: 'fa-book', page: 'bitacora' },
    ]
  },
  {
    label: 'Sistema',
    items: [
      { href: '#configuracion', label: 'Configuración', icon: 'fa-cog', page: 'configuracion' },
    ]
  }
];

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  actividad: 'Actividad',
  personal: 'Personal',
  residentes: 'Residentes',
  areas: 'Áreas comunes',
  reservas: 'Reservas',
  'visitas-autorizadas': 'Visitas autorizadas',
  contratos: 'Contratos',
  departamentos: 'Departamentos',
  pagos: 'Pagos',
  reportes: 'Reportes',
  facturacion: 'Facturación Electrónica',
  bitacora: 'Bitácora',
  configuracion: 'Configuración'
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { profile, updateProfile, logout, usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);

  const currentHash = location.hash.replace('#', '') || 'dashboard';
  const pageTitle = pageTitles[currentHash] || 'Dashboard';

  const handleNavigate = useCallback((page: string) => {
    window.location.hash = page;
  }, []);

  // Wire up logout modal
  useEffect(() => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      const handleLogoutClick = (e: Event) => {
        e.preventDefault();
        const modalOverlay = document.getElementById('modalOverlay');
        if (modalOverlay) {
          const modalTitle = document.getElementById('modalTitle');
          const modalMessage = document.getElementById('modalMessage');
          const modalConfirmBtn = document.getElementById('modalConfirmBtn');
          if (modalTitle && modalMessage && modalConfirmBtn) {
            modalTitle.textContent = 'Cerrar sesión';
            modalMessage.textContent = '¿Estás seguro de que deseas cerrar sesión?';
            modalConfirmBtn.textContent = 'Cerrar sesión';
            modalConfirmBtn.className = 'btn-danger btn-logout';
            modalConfirmBtn.onclick = () => {
              modalOverlay.classList.remove('open');
              logout();
              navigate('/login');
            };
          }
          modalOverlay.classList.add('open');
        }
      };
      logoutBtn.addEventListener('click', handleLogoutClick);
      return () => logoutBtn.removeEventListener('click', handleLogoutClick);
    }
  }, [logout, navigate]);

  const toggleSidebar = () => {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebarOverlay')?.classList.toggle('open');
  };

  const handleAvatarUpdate = (src: string) => {
    updateProfile({ avatar: src });
  };

  return (
    <>
      <Sidebar
        currentPage={currentHash}
        onNavigate={handleNavigate}
        brandIcon="fa-building"
        navGroups={navGroups}
      />
      <main className="main-content">
        <Navbar
          pageTitle={pageTitle}
          breadcrumb={`/ ${pageTitle}`}
          profile={profile!}
          onToggleSidebar={toggleSidebar}
          onAvatarClick={() => setShowProfile(true)}
          role="admin"
        />
        {children}
      </main>
      {profile && (
        <ProfileDrawer
          isOpen={showProfile}
          onClose={() => setShowProfile(false)}
          profile={profile}
          onSave={updateProfile}
          onAvatarUpdate={handleAvatarUpdate}
          role={usuario?.rol}
        />
      )}
    </>
  );
}

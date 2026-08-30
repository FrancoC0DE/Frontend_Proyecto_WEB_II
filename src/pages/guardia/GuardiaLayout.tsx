/**
 * ============================================================================
 * Archivo: GuardiaLayout.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Layout principal del panel de Guardia. Renderiza el sidebar con
 * navegación (Dashboard, Visitas, Configuración), la barra superior
 * (Navbar) y el contenido de la página activa.
 *
 * Componentes que utiliza
 * - Sidebar (navegación lateral)
 * - Navbar (barra superior)
 * - ProfileDrawer (editar perfil)
 * - useAuth (contexto de autenticación)
 *
 * ============================================================================
 */

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import ProfileDrawer from '../../components/ProfileDrawer';

interface GuardiaLayoutProps {
  children?: ReactNode;
}

const navGroups = [
  { items: [{ href: '#dashboard', label: 'Dashboard', icon: 'fa-th-large', page: 'dashboard' }] },
  { items: [{ href: '#visitas', label: 'Visitas', icon: 'fa-users', page: 'visitas' }] },
  { items: [{ href: '#configuracion', label: 'Configuración', icon: 'fa-cog', page: 'configuracion' }] }
];

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  visitas: 'Visitas',
  configuracion: 'Configuración'
};

export default function GuardiaLayout({ children }: GuardiaLayoutProps) {
  const { profile, updateProfile, logout, usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);

  const currentHash = location.hash.replace('#', '') || 'dashboard';
  const pageTitle = pageTitles[currentHash] || 'Dashboard';

  const handleNavigate = useCallback((page: string) => {
    window.location.hash = page;
  }, []);

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
        brandIcon="fa-shield-alt"
        navGroups={navGroups}
      />
      <main className="main-content">
        <Navbar
          pageTitle={pageTitle}
          breadcrumb={`/ ${pageTitle}`}
          profile={profile!}
          onToggleSidebar={toggleSidebar}
          onAvatarClick={() => setShowProfile(true)}
          role="guardia"
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

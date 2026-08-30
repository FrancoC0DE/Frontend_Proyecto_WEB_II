/**
 * ============================================================================
 * Archivo: InquilinoLayout.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Layout principal del panel de Inquilino. Renderiza el sidebar con
 * navegación (Dashboard, Reservar Área, Mis Reservas, Registrar Visitante,
 * Mis Visitantes, Configuración), la barra superior y el contenido.
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

interface InquilinoLayoutProps {
  children?: ReactNode;
}

const navGroups = [
  { items: [{ href: '#dashboard', label: 'Dashboard', icon: 'fa-th-large', page: 'dashboard' }] },
  { items: [{ href: '#reservar-area', label: 'Reservar Área', icon: 'fa-plus-circle', page: 'reservar-area' }] },
  { items: [{ href: '#mis-reservas', label: 'Mis Reservas', icon: 'fa-calendar-alt', page: 'mis-reservas' }] },
  { items: [{ href: '#mis-contratos', label: 'Mis Contratos', icon: 'fa-file-signature', page: 'mis-contratos' }] },
  { items: [{ href: '#mis-facturas', label: 'Mis Facturas', icon: 'fa-file-invoice-dollar', page: 'mis-facturas' }] },
  { items: [{ href: '#registrar-visitante', label: 'Registrar Visitante', icon: 'fa-user-plus', page: 'registrar-visitante' }] },
  { items: [{ href: '#mis-visitantes', label: 'Mis Visitantes', icon: 'fa-users', page: 'mis-visitantes' }] },
  { items: [{ href: '#configuracion', label: 'Configuración', icon: 'fa-cog', page: 'configuracion' }] }
];

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  'reservar-area': 'Reservar Área',
  'nueva-reserva': 'Nueva Reserva',
  'mis-reservas': 'Mis Reservas',
  'mis-contratos': 'Mis Contratos',
  'mis-facturas': 'Mis Facturas',
  'registrar-visitante': 'Registrar Visitante',
  'mis-visitantes': 'Mis Visitantes',
  configuracion: 'Configuración'
};

export default function InquilinoLayout({ children }: InquilinoLayoutProps) {
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
        brandIcon="fa-home"
        navGroups={navGroups}
      />
      <main className="main-content">
        <Navbar
          pageTitle={pageTitle}
          breadcrumb={`/ ${pageTitle}`}
          profile={profile!}
          onToggleSidebar={toggleSidebar}
          onAvatarClick={() => setShowProfile(true)}
          role="inquilino"
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

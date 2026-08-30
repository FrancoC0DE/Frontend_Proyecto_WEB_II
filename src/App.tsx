/**
 * ============================================================================
 * Archivo: App.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Es el componente raíz de la aplicación. Configura:
 * - El enrutador (React Router) para la navegación
 * - Los proveedores de contexto global (tema, auth, datos, toasts)
 * - El ErrorBoundary para capturar errores de renderizado
 * - Los Routers internos para cada rol (Admin, Guardia, Inquilino)
 *
 * Estructura de Providers (orden importante):
 * BrowserRouter
 *   → ThemeProvider     (tema oscuro/claro)
 *     → AuthProvider    (estado de autenticación)
 *       → DataProvider  (datos de la aplicación)
 *         → ToastProvider (notificaciones toast)
 *           → ErrorBoundary (captura errores)
 *             → Routes (navegación)
 *
 * Rutas principales
 * - /login       → LoginPage
 * - /forgot      → ForgotPasswordPage
 * - /recuperar   → RecuperarPasswordPage (?token= del correo)
 * - /2fa         → TwoFactorPage
 * - /admin/*     → Panel Administrador (con hash routing interno)
 * - /guardia/*   → Panel Guardia (con hash routing interno)
 * - /inquilino/* → Panel Inquilino (con hash routing interno)
 * - *            → Redirecciona a /login
 *
 * Navegación interna (hash routing)
 * Cada panel (Admin, Guardia, Inquilino) usa hash-based routing
 * para cambiar entre sus páginas sin recargar:
 * Ej: /admin#dashboard, /admin#reservas, /inquilino#mis-reservas
 *
 * Cambios para Backend
 * Cuando exista el backend, las rutas podrían cambiar a:
 * - Protección de rutas según autenticación (PrivateRoute)
 * - Redirección si el token expiró
 * - Rutas dinámicas (ej: /admin/reservas/:id)
 *
 * ============================================================================
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';

import { DataProvider } from './context/DataContext';
import { PreferenciasProvider } from './context/PreferenciasContext';
import { ToastProvider } from './components/Toast';
import { AlertProvider } from './components/Alert';
import ErrorBoundary from './components/ErrorBoundary';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import RecuperarPasswordPage from './pages/auth/RecuperarPasswordPage';
import TwoFactorPage from './pages/auth/TwoFactorPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import ActividadPage from './pages/admin/ActividadPage';
import PersonalPage from './pages/admin/PersonalPage';
import ResidentesPage from './pages/admin/ResidentesPage';
import ContratosPage from './pages/admin/ContratosPage';
import ReservasPage from './pages/admin/ReservasPage';
import AreasPage from './pages/admin/AreasPage';
import DepartamentosPage from './pages/admin/DepartamentosPage';
import VisitasPage from './pages/admin/VisitasPage';
import PagosPage from './pages/admin/PagosPage';
import FacturacionPage from './pages/admin/FacturacionPage';
import ReportesPage from './pages/admin/ReportesPage';
import BitacoraPage from './pages/admin/BitacoraPage';
import ConfigPage from './pages/admin/ConfigPage';
import GuardiaLayout from './pages/guardia/GuardiaLayout';
import GuardiaDashboard from './pages/guardia/GuardiaDashboard';
import GuardiaVisitas from './pages/guardia/GuardiaVisitas';
import GuardiaConfig from './pages/guardia/GuardiaConfig';
import InquilinoLayout from './pages/inquilino/InquilinoLayout';
import InquilinoDashboard from './pages/inquilino/InquilinoDashboard';
import ReservarAreaPage from './pages/inquilino/ReservarAreaPage';
import NuevaReservaPage from './pages/inquilino/NuevaReservaPage';
import MisReservasPage from './pages/inquilino/MisReservasPage';
import MisContratosPage from './pages/inquilino/MisContratosPage';
import MisFacturasPage from './pages/inquilino/MisFacturasPage';
import RegistrarVisitantePage from './pages/inquilino/RegistrarVisitantePage';
import MisVisitantesPage from './pages/inquilino/MisVisitantesPage';
import InquilinoConfig from './pages/inquilino/InquilinoConfig';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <PreferenciasProvider>
            <ToastProvider>
              <AlertProvider>
                <ErrorBoundary>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/forgot" element={<ForgotPasswordPage />} />
                    <Route path="/recuperar" element={<RecuperarPasswordPage />} />
                    <Route path="/2fa" element={<TwoFactorPage />} />
                    <Route path="/admin/*" element={
                      <PrivateRoute roles={['Administrador']}><AdminRouter /></PrivateRoute>
                    } />
                    <Route path="/guardia/*" element={
                      <PrivateRoute roles={['Guarda']}><GuardiaRouter /></PrivateRoute>
                    } />
                    <Route path="/inquilino/*" element={
                      <PrivateRoute roles={['Inquilino']}><InquilinoRouter /></PrivateRoute>
                    } />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                  </Routes>
                </ErrorBoundary>
              </AlertProvider>
            </ToastProvider>
          </PreferenciasProvider>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function AdminRouter() {
  const [hash, setHash] = useState(() => window.location.hash.replace('#', '') || 'dashboard');
  const onNavigate = (page: string) => {
    window.location.hash = page;
  };

  useEffect(() => {
    const handler = () => setHash(window.location.hash.replace('#', '') || 'dashboard');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const renderPage = () => {
    switch (hash) {
      case 'dashboard': return <AdminDashboard onNavigate={onNavigate} />;
      case 'actividad': return <ActividadPage />;
      case 'personal': return <PersonalPage />;
      case 'residentes': return <ResidentesPage />;
      case 'contratos': return <ContratosPage />;
      case 'departamentos': return <DepartamentosPage />;
      case 'reservas': return <ReservasPage />;
      case 'areas': return <AreasPage />;
      case 'visitas-autorizadas': return <VisitasPage />;
      case 'pagos': return <PagosPage />;
      case 'facturacion': return <FacturacionPage />;
      case 'reportes': return <ReportesPage />;
      // Módulo de auditoría (Bitácora)
      case 'bitacora': return <BitacoraPage />;
      case 'configuracion': return <ConfigPage />;
      default: return <AdminDashboard onNavigate={onNavigate} />;
    }
  };

  return (
    <AdminLayout>
      <div className="page active">
        {renderPage()}
      </div>
      <GlobalModals />
    </AdminLayout>
  );
}

function GuardiaRouter() {
  const [hash, setHash] = useState(() => window.location.hash.replace('#', '') || 'dashboard');

  useEffect(() => {
    const handler = () => setHash(window.location.hash.replace('#', '') || 'dashboard');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const renderPage = () => {
    switch (hash) {
      case 'dashboard': return <GuardiaDashboard />;
      case 'visitas': return <GuardiaVisitas />;
      case 'configuracion': return <GuardiaConfig />;
      default: return <GuardiaDashboard />;
    }
  };

  return (
    <GuardiaLayout>
      <div className="page active">
        {renderPage()}
      </div>
      <GlobalModals />
    </GuardiaLayout>
  );
}

function InquilinoRouter() {
  const [hash, setHash] = useState(() => window.location.hash.replace('#', '') || 'dashboard');
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setHash(window.location.hash.replace('#', '') || 'dashboard');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const renderPage = () => {
    switch (hash) {
      case 'dashboard': return <InquilinoDashboard />;
      case 'reservar-area': return <ReservarAreaPage onSelectArea={(id) => { setSelectedAreaId(id); window.location.hash = 'nueva-reserva'; }} />;
      case 'nueva-reserva': return <NuevaReservaPage preselectedAreaId={selectedAreaId} />;
      case 'mis-reservas': return <MisReservasPage />;
      case 'mis-contratos': return <MisContratosPage />;
      case 'mis-facturas': return <MisFacturasPage />;
      case 'registrar-visitante': return <RegistrarVisitantePage />;
      case 'mis-visitantes': return <MisVisitantesPage />;
      case 'configuracion': return <InquilinoConfig />;
      default: return <InquilinoDashboard />;
    }
  };

  return (
    <InquilinoLayout>
      <div className="page active">
        {renderPage()}
      </div>
      <GlobalModals />
    </InquilinoLayout>
  );
}

function GlobalModals() {
  return (
    <div className="modal-overlay" id="modalOverlay" onClick={() => document.getElementById('modalOverlay')?.classList.remove('open')}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 id="modalTitle">¿Estás seguro?</h3>
        <p id="modalMessage">Esta acción no se puede deshacer.</p>
        <div className="actions">
          <button className="btn-secondary" onClick={() => document.getElementById('modalOverlay')?.classList.remove('open')}>Cancelar</button>
          <button className="btn-danger" id="modalConfirmBtn">Confirmar</button>
        </div>
      </div>
    </div>
  );
}

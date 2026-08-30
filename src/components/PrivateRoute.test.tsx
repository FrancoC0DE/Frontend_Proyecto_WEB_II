/**
 * Pruebas unitarias para el componente PrivateRoute.
 *
 * Verifica que:
 * - Sin sesión (sin token/usuario) → redirige a /login
 * - Con sesión pero sin verificación 2FA → redirige a /2fa
 * - Con sesión completa y 2FA → renderiza el contenido protegido
 * - Con rol no permitido → redirige al dashboard de su propio rol
 * - Mientras se restaura la sesión (isRestoring) → no redirige (renderiza nada)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Usuario, RolNombre } from '../types/auth';

// Se mockea el hook useAuth: no se depende del AuthProvider real
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../hooks/useAuth';
import PrivateRoute from './PrivateRoute';

const mockUseAuth = vi.mocked(useAuth);

// ============================================================
// Helpers
// ============================================================
const usuarioBase = (rol: RolNombre, idRol: number): Usuario => ({
  idUsuario: idRol,
  nombreCompleto: 'Usuario Demo',
  correo: 'demo@gmail.com',
  idRol,
  rol,
  activo: true,
});

/** Devuelve un objeto completo y tipado de contexto de autenticación */
function contextoAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}): ReturnType<typeof useAuth> {
  return {
    usuario: null,
    token: null,
    autenticado: false,
    verificacion2FA: false,
    isRestoring: false,
    guardarUsuarioParcial: vi.fn(),
    completar2FA: vi.fn(),
    cerrarSesion: vi.fn(),
    isAuthenticated: false,
    userRole: null,
    userName: '',
    profile: null,
    login: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAuth>;
}

/** Renderiza PrivateRoute dentro de un enrutador con rutas de destino */
function renderConRutas(children: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/protegido']}>
      <Routes>
        <Route path="/login" element={<div>PAGINA_LOGIN</div>} />
        <Route path="/2fa" element={<div>PAGINA_2FA</div>} />
        <Route path="/admin" element={<div>PANEL_ADMIN</div>} />
        <Route path="/guardia" element={<div>PANEL_GUARDIA</div>} />
        <Route path="/inquilino" element={<div>PANEL_INQUILINO</div>} />
        <Route path="/protegido" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockUseAuth.mockReset();
});

// ============================================================
// Pruebas
// ============================================================
describe('PrivateRoute', () => {
  it('debe redirigir a /login cuando no hay sesión (sin token/usuario)', () => {
    mockUseAuth.mockReturnValue(contextoAuth());

    renderConRutas(
      <PrivateRoute><div>CONTENIDO_PROTEGIDO</div></PrivateRoute>
    );

    expect(screen.getByText('PAGINA_LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('CONTENIDO_PROTEGIDO')).not.toBeInTheDocument();
  });

  it('debe redirigir a /2fa cuando hay sesión pero falta la verificación 2FA', () => {
    mockUseAuth.mockReturnValue(contextoAuth({
      usuario: usuarioBase('Inquilino', 3),
      token: 'jwt-real',
      autenticado: true,
      verificacion2FA: false,
    }));

    renderConRutas(
      <PrivateRoute><div>CONTENIDO_PROTEGIDO</div></PrivateRoute>
    );

    expect(screen.getByText('PAGINA_2FA')).toBeInTheDocument();
    expect(screen.queryByText('CONTENIDO_PROTEGIDO')).not.toBeInTheDocument();
  });

  it('debe renderizar el contenido cuando la sesión está completa y verificada', () => {
    mockUseAuth.mockReturnValue(contextoAuth({
      usuario: usuarioBase('Inquilino', 3),
      token: 'jwt-real',
      autenticado: true,
      verificacion2FA: true,
    }));

    renderConRutas(
      <PrivateRoute><div>CONTENIDO_PROTEGIDO</div></PrivateRoute>
    );

    expect(screen.getByText('CONTENIDO_PROTEGIDO')).toBeInTheDocument();
  });

  it('debe redirigir al dashboard de su rol cuando el rol no está permitido', () => {
    // Un inquilino intenta entrar a una ruta solo de Administrador
    mockUseAuth.mockReturnValue(contextoAuth({
      usuario: usuarioBase('Inquilino', 3),
      token: 'jwt-real',
      autenticado: true,
      verificacion2FA: true,
    }));

    renderConRutas(
      <PrivateRoute roles={['Administrador']}><div>CONTENIDO_ADMIN</div></PrivateRoute>
    );

    expect(screen.getByText('PANEL_INQUILINO')).toBeInTheDocument();
    expect(screen.queryByText('CONTENIDO_ADMIN')).not.toBeInTheDocument();
  });

  it('debe permitir el acceso cuando el rol está permitido', () => {
    mockUseAuth.mockReturnValue(contextoAuth({
      usuario: usuarioBase('Administrador', 1),
      token: 'jwt-real',
      autenticado: true,
      verificacion2FA: true,
    }));

    renderConRutas(
      <PrivateRoute roles={['Administrador']}><div>CONTENIDO_ADMIN</div></PrivateRoute>
    );

    expect(screen.getByText('CONTENIDO_ADMIN')).toBeInTheDocument();
  });

  it('no debe redirigir mientras se restaura la sesión (isRestoring)', () => {
    mockUseAuth.mockReturnValue(contextoAuth({ isRestoring: true }));

    renderConRutas(
      <PrivateRoute><div>CONTENIDO_PROTEGIDO</div></PrivateRoute>
    );

    // No debe mostrar ni el login ni el contenido (aún restaurando)
    expect(screen.queryByText('PAGINA_LOGIN')).not.toBeInTheDocument();
    expect(screen.queryByText('CONTENIDO_PROTEGIDO')).not.toBeInTheDocument();
  });
});

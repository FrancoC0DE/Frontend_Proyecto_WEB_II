/**
 * ============================================================================
 * Archivo: PrivateRoute.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Componente que protege las rutas del frontend según el estado de
 * autenticación:
 *   - Sin sesión activa (sin token/usuario) → redirige a /login
 *   - Sesión sin verificación 2FA            → redirige a /2fa
 *   - Rol no permitido (prop opcional roles) → redirige al dashboard de su rol
 *   - Sesión completa y con permiso          → renderiza el contenido
 *
 * Mientras se restaura la sesión desde localStorage (isRestoring) NO se hace
 * ninguna redirección, para evitar un "bote" a /login al recargar una URL
 * protegida con una sesión guardada.
 *
 * Uso:
 *   <Route path="/admin/*" element={
 *     <PrivateRoute roles={['Administrador']}><AdminRouter /></PrivateRoute>
 *   } />
 * ============================================================================
 */

import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { rutaPorRol } from '../services/apiClient';

interface PrivateRouteProps {
  children: ReactNode;
  /** Roles permitidos (nombre_rol: Administrador, Guarda, Inquilino).
   *  Si no se pasa, no hay restricción por rol. */
  roles?: string[];
}

export default function PrivateRoute({ children, roles }: PrivateRouteProps) {
  const { usuario, token, autenticado, verificacion2FA, isRestoring } = useAuth();

  // 1. Esperando restaurar la sesión guardada → aún no tomar una decisión
  if (isRestoring) {
    return null;
  }

  // 2. Sin sesión activa (token/usuario) → login
  if (!autenticado || !token || !usuario) {
    return <Navigate to="/login" replace />;
  }

  // 3. Sesión sin verificación 2FA completada → /2fa
  if (!verificacion2FA) {
    return <Navigate to="/2fa" replace />;
  }

  // 4. Restricción por rol → si no corresponde, a su propio dashboard
  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to={rutaPorRol(usuario.rol)} replace />;
  }

  return <>{children}</>;
}

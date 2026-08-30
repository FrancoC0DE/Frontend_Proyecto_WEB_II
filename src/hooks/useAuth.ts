/**
 * ============================================================================
 * Archivo: useAuth.ts
 * ============================================================================
 *
 * ¿Qué hace?
 * Define el contexto de autenticación (AuthContext), su tipo (AuthContextType)
 * y el hook useAuth. Vive en un archivo SIN componentes para cumplir la regla
 * react-refresh/only-export-components (un archivo que exporta componentes no
 * debe exportar hooks/contextos) y para que Fast Refresh funcione.
 *
 * Por qué aquí y no en context/AuthContext.ts:
 * En Windows (filesystem case-insensitive) el nombre authContext.ts colisiona
 * con AuthContext.tsx, por lo que el contexto se define en este archivo.
 *
 * Uso:
 *   const { usuario, token, profile, ... } = useAuth();
 *
 * ============================================================================
 */
import { createContext, useContext } from 'react';
import type { UserRole, ProfileData } from '../types';
import type { Usuario } from '../types/auth';

export interface AuthContextType {
  // --- Nueva API ---
  usuario: Usuario | null;
  token: string | null;
  autenticado: boolean;
  verificacion2FA: boolean;
  /** true mientras se restaura una sesión guardada desde localStorage */
  isRestoring: boolean;
  guardarUsuarioParcial: (usuario: Usuario, token?: string) => void;
  completar2FA: (token?: string) => void;
  cerrarSesion: () => void;

  // --- API anterior (compatibilidad con el resto de la app) ---
  isAuthenticated: boolean;
  userRole: UserRole | null;
  userName: string;
  profile: ProfileData | null;
  login: (role: UserRole, name?: string) => void;
  logout: () => void;
  updateProfile: (data: Partial<ProfileData>) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

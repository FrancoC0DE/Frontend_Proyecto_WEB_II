/**
 * ============================================================================
 * Archivo: auth.ts
 * ============================================================================
 *
 * ¿Qué contiene?
 * Las interfaces y tipos relacionados con la autenticación de usuarios.
 *
 * Responsabilidades
 * - Definir la estructura de un Usuario (id, nombre, rol, etc.)
 * - Definir la estructura de Credenciales (correo, contraseña)
 * - Definir la estructura de DatosRegistro (nombre completo, teléfono)
 *
 * Se comunica con
 * - authService.ts (usa estas interfaces para tipar sus funciones)
 * - AuthContext.tsx (usa Usuario para el estado global)
 * - LoginPage.tsx (usa Credenciales y DatosRegistro para formularios)
 *
 * Datos actuales
 * El usuario proviene del backend (POST /auth/login y /auth/register) vía
 * authService; la sesión se persiste en localStorage (token JWT + usuario).
 *
 * ============================================================================
 */

export type RolNombre = 'Administrador' | 'Guarda' | 'Inquilino';

export interface Usuario {
  idUsuario: number;
  nombreCompleto: string;
  correo: string;
  idRol: number;
  rol: RolNombre;
  activo: boolean;
  /** URL completa del avatar (se persiste localmente para el Navbar) */
  avatar?: string;
  telefono?: string;
}

export interface Credenciales {
  correo: string;
  contrasena: string;
}

export interface DatosRegistro extends Credenciales {
  nombreCompleto: string;
  telefono?: string;
  cedula?: string;
}

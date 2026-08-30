/**
 * ============================================================================
 * Archivo: authService.ts
 * ============================================================================
 * Servicio de autenticación REAL conectado al backend (Express + JWT).
 *
 * Métodos que expone
 * - iniciarSesion(credenciales) → POST /api/auth/login → { token TEMPORAL, usuario }
 * - registrarUsuario(datos)     → POST /api/auth/register (NO genera token)
 * - reenviarCodigo2FA(opciones) → POST /api/auth/2fa/send (genera/envía el código)
 * - verificarCodigo2FA(codigo)  → POST /api/auth/2fa/verify → { token DEFINITIVO }
 * - cerrarSesionBackend()       → POST /api/auth/logout + limpia localStorage
 * - me()                        → GET /api/auth/me (valida la sesión activa)
 * - solicitarRecuperacion(correo)     → POST /api/auth/recuperar-solicitar (público)
 * - restablecerContrasena(token, pass) → POST /api/auth/recuperar-restablecer (público)
 *
 * Flujo 2FA
 *   1. login devuelve un JWT TEMPORAL (2faVerified: false) → el usuario va a /2fa
 *   2. TwoFactorPage llama a reenviarCodigo2FA() al montar → llega el correo
 *   3. verificarCodigo2FA(codigo) valida; si es correcto, el backend devuelve el
 *      JWT DEFINITIVO (2faVerified: true) y se reemplaza el token guardado.
 *
 * Se comunica con
 * - LoginPage.tsx (iniciarSesion, registrarUsuario)
 * - TwoFactorPage.tsx (reenviarCodigo2FA, verificarCodigo2FA)
 * - AuthContext.tsx (cerrarSesionBackend, me)
 * ============================================================================
 */

import {
  api,
  TOKEN_KEY,
  USUARIO_KEY,
  type LoginResponse,
  type UsuarioAuth,
} from './apiClient';
import type { Credenciales, DatosRegistro, RolNombre, Usuario } from '../types/auth';

/** Mapeo del rol del backend (nombre_rol) al id_rol numérico que usa el frontend */
const ROL_A_ID: Record<string, number> = {
  Administrador: 1,
  Guarda: 2,
  Inquilino: 3,
};

/** Convierte el usuario devuelto por el backend al shape que usa el frontend */
const mapearUsuario = (u: UsuarioAuth): Usuario => ({
  idUsuario: u.id,
  nombreCompleto: u.nombre,
  correo: u.correo,
  idRol: ROL_A_ID[u.rol] ?? 3,
  rol: (u.rol as RolNombre) || 'Inquilino',
  activo: true,
});

export const authService = {
  /**
   * POST /api/auth/login
   * Devuelve el JWT TEMPORAL (2faVerified: false, expira en 8h) y el usuario
   * mapeado. El frontend debe redirigir a /2fa para completar la verificación.
   */
  async iniciarSesion(credenciales: Credenciales): Promise<{ token: string; usuario: Usuario }> {
    const data = await api.post<LoginResponse>('/auth/login', credenciales);
    const usuario = mapearUsuario(data.usuario);

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));

    return { token: data.token, usuario };
  },

  /**
   * POST /api/auth/register
   * Crea el inquilino (correo con dominio público). El backend NO devuelve
   * token, por lo que tras el registro el usuario debe iniciar sesión.
   */
  async registrarUsuario(datos: DatosRegistro): Promise<{ message: string; id_usuario: number | null }> {
    const { nombreCompleto, correo, contrasena, telefono, cedula } = datos;
    return api.post('/auth/register', { nombreCompleto, correo, contrasena, telefono, cedula });
  },

  /**
   * POST /api/auth/2fa/send
   * Genera un código de 6 dígitos, lo inserta en Codigo2FA (expira en 5 min)
   * y lo envía al correo del usuario. Se usa al cargar la página 2FA (auto) y
   * al presionar "Reenviar código" (el backend invalida los códigos anteriores
   * y reinicia el contador de intentos).
   *
   * REGLA DE REENVÍO (backend): mientras exista un código vigente y queden
   * intentos, NO se genera otro (responde ya_enviado: true con expira_en). Si
   * el usuario ya agotó los 3 intentos y la llamada es auto (recarga de /2fa),
   * responde 429 bloqueado.
   */
  async reenviarCodigo2FA(opciones?: { auto?: boolean }): Promise<{
    expira_en: number;
    ya_enviado?: boolean;
    intentos_restantes?: number;
  }> {
    // expira_en: segundos de validez del código (el backend decide; 5 min = 300)
    // intentos_restantes: solo viene en la respuesta "ya_enviado" (código ya
    // activo); sirve para sincronizar el contador local tras recargar /2fa.
    return api.post<{
      message: string;
      expira_en: number;
      ya_enviado?: boolean;
      intentos_restantes?: number;
    }>(
      '/auth/2fa/send',
      opciones?.auto === true ? { auto: true } : undefined,
    );
  },

  /**
   * POST /api/auth/2fa/verify
   * Valida el código de 6 dígitos. Si es correcto, el backend devuelve el JWT
   * DEFINITIVO (2faVerified: true), que reemplaza al token temporal guardado
   * en localStorage. Si falla, el backend responde 400/429 con el mensaje.
   */
  async verificarCodigo2FA(codigo: string): Promise<{ token: string }> {
    const data = await api.post<{ token: string; message: string }>('/auth/2fa/verify', { codigo });
    localStorage.setItem(TOKEN_KEY, data.token);
    return { token: data.token };
  },

  /**
   * POST /api/auth/logout
   * Cierra la sesión en la BD (estado CerradaManual) y limpia localStorage.
   * Si el backend falla, igualmente se limpia la sesión local.
   */
  async cerrarSesionBackend(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USUARIO_KEY);
    }
  },

  /**
   * GET /api/auth/me → usuario del token (para validar la sesión al recargar).
   * Incluye el flag 2faVerified: si es false, el frontend redirige a /2fa.
   */
  async me(): Promise<{
    user: {
      id_usuario: number;
      id_rol: number;
      nombre_rol: string;
      id_sesion: number;
      '2faVerified': boolean;
    };
  }> {
    return api.get('/auth/me');
  },

  /**
   * POST /api/auth/recuperar-solicitar (público)
   * Solicita el enlace de recuperación. El backend busca en `correo` y
   * `correo_contacto` y SIEMPRE responde lo mismo (genérico) para no revelar
   * si el correo existe: "Si el correo existe, recibirás instrucciones."
   */
  async solicitarRecuperacion(correo: string): Promise<{ mensaje: string }> {
    return api.post('/auth/recuperar-solicitar', { correo });
  },

  /**
   * POST /api/auth/recuperar-restablecer (público)
   * Valida el token del enlace y cambia la contraseña. El token es de uso
   * único y expira en 10 minutos (lo controla el backend).
   */
  async restablecerContrasena(token: string, nuevaContrasena: string): Promise<{ mensaje: string }> {
    return api.post('/auth/recuperar-restablecer', { token, nuevaContrasena });
  },
};

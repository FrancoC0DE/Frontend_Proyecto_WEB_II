/**
 * ============================================================================
 * Archivo: perfilService.ts
 * ============================================================================
 * Servicio del perfil de usuario conectado al backend real (Express + JWT).
 *
 * Métodos que expone
 * - obtenerPerfil()       → GET  /api/perfil
 * - actualizarPerfil(d)   → PUT  /api/perfil
 * - cambiarContrasena(a,n)→ PUT  /api/perfil/cambiar-contrasena
 * - uploadAvatar(file)    → POST /api/perfil/upload-avatar (multipart/form-data)
 * - buildAvatarUrl(ruta)  → Convierte /uploads/... en URL completa para <img>
 *
 * Se comunica con
 * - ProfileDrawer.tsx (único consumidor)
 *
 * Nota técnica sobre el upload
 * El apiClient adjunta siempre 'Content-Type: application/json', lo que rompería
 * el multipart (necesita el boundary generado por el navegador). Por eso
 * uploadAvatar usa fetch() crudo con FormData y solo el header Authorization.
 * ============================================================================
 */
import { api, ApiError, API_URL, TOKEN_KEY, USUARIO_KEY, buildStaticUrl } from './apiClient';

/** Perfil tal como lo devuelve GET /api/perfil (sp_ObtenerPerfil). */
export interface PerfilBackend {
  id_usuario: number;
  nombre_completo: string;
  correo: string;
  correo_contacto: string | null;
  telefono: string | null;
  foto_perfil: string | null;
  nombre_rol: string;
}

/** Payload aceptado por PUT /api/perfil. */
export interface ActualizarPerfilPayload {
  nombre_completo: string;
  telefono?: string | null;
  foto_perfil?: string | null;
  /** Solo Inquilino */
  correo?: string;
  /** Solo Administrador/Guarda */
  correo_contacto?: string;
}

export interface UploadAvatarResponse {
  message: string;
  foto_perfil: string;
}

/**
 * Convierte la ruta de foto_perfil en una URL utilizable en <img>.
 * - Si ya empieza con http:// o https:// → se usa tal cual (URL externa).
 * - Si es una ruta local (/uploads/...) → se antepone la URL base del servidor.
 */
export const buildAvatarUrl = buildStaticUrl;

export const perfilService = {
  /**
   * GET /api/perfil
   * Devuelve los datos reales del usuario autenticado (requiere JWT + 2FA).
   */
  async obtenerPerfil(): Promise<PerfilBackend> {
    return api.get<PerfilBackend>('/perfil');
  },

  /**
   * PUT /api/perfil
   * Actualiza nombre, teléfono, foto y el campo de correo correspondiente al
   * rol (el backend ignora/rechaza el campo ajeno).
   */
  async actualizarPerfil(data: ActualizarPerfilPayload): Promise<{ message: string }> {
    return api.put('/perfil', data);
  },

  /**
   * PUT /api/perfil/cambiar-contrasena
   * El backend verifica contrasenaActual con bcrypt antes de guardar la nueva.
   */
  async cambiarContrasena(
    contrasenaActual: string,
    nuevaContrasena: string,
  ): Promise<{ message: string }> {
    return api.put('/perfil/cambiar-contrasena', { contrasenaActual, nuevaContrasena });
  },

  /**
   * POST /api/perfil/upload-avatar
   * Sube el archivo con multipart/form-data. El backend lo guarda en
   * uploads/avatars/ y devuelve la ruta relativa en foto_perfil.
   */
  async uploadAvatar(file: File): Promise<UploadAvatarResponse> {
    const formData = new FormData();
    formData.append('foto', file);

    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_URL}/perfil/upload-avatar`, {
      method: 'POST',
      // NO se pone Content-Type: el navegador agrega el boundary del multipart
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    // Mismo comportamiento que el interceptor 401 del apiClient: si la sesión
    // expiró durante la subida, se limpia y se redirige a /login.
    if (res.status === 401 && token) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USUARIO_KEY);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new ApiError(401, 'Sesión expirada. Inicie sesión nuevamente.');
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new ApiError(res.status, data?.message ?? 'Error al subir la imagen', data ?? undefined);
    }

    return res.json() as Promise<UploadAvatarResponse>;
  },
};

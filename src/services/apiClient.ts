/**
 * ============================================================================
 * Archivo: apiClient.ts
 * ============================================================================
 * Cliente HTTP para consumir la API del backend.
 * - Adjunta automáticamente el token JWT en cada petición:
 *     Authorization: Bearer <token>
 * - Interceptor de 401: limpia el token y redirige a /login (token expirado,
 *   sesión cerrada o sesión expirada por inactividad).
 * - Errores tipados (ApiError) con el mensaje devuelto por el backend.
 *
 * Los métodos de autenticación (login/register/logout/me) viven en
 * authService.ts, que usa este cliente para comunicarse con /api/auth.
 *
 * Nota: no usa axios porque el proyecto no tiene esa dependencia.
 * ============================================================================
 */

// URL base del backend (cambiar por variable de entorno si se despliega)
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

// URL base del servidor SIN el sufijo /api (para construir URLs de archivos
// servidos por express.static, ej: http://localhost:4000/uploads/avatars/x.jpg)
export const BASE_URL: string = API_URL.replace(/\/api\/?$/, '');

/**
 * Convierte la ruta de un archivo servido por express.static (/uploads/...) en
 * una URL absoluta utilizable en <img>. Si ya empieza con http(s) se usa tal
 * cual (URL externa). Compartido por avatares de perfil y áreas comunes.
 */
export const buildStaticUrl = (ruta: string | null | undefined): string => {
  if (!ruta) return '';
  if (/^https?:\/\//i.test(ruta)) return ruta;
  return `${BASE_URL}${ruta}`;
};

// Claves de localStorage usadas por authService y AuthContext
export const TOKEN_KEY = 'token';
export const USUARIO_KEY = 'usuario';

/** Error HTTP con status, mensaje legible y cuerpo de la respuesta (si pudo leerse) */
export class ApiError extends Error {
  status: number;
  /** Cuerpo JSON del backend (p. ej. { intentos_restantes, expira_en }) */
  data?: Record<string, unknown>;

  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// ------------------------------------------------------------
// Utilidades de token
// ------------------------------------------------------------
const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

const clearSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USUARIO_KEY);
};

/**
 * Interceptor de 401:
 * Borra el token almacenado y redirige a /login (evita redirección en bucle
 * si ya estamos en la página de login).
 */
const handleUnauthorized = (): void => {
  clearSession();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
};

// ------------------------------------------------------------
// Núcleo del cliente
// ------------------------------------------------------------
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Token adjunto en cada petición a rutas protegidas
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // 401 en rutas PROTEGIDAS (las que enviaron token) → sesión expirada/inválida.
  // El login/register son públicos (no envían token): su 401/400 (ej: credenciales
  // inválidas) debe llegar con el mensaje real del backend, sin redirección.
  if (res.status === 401 && token) {
    handleUnauthorized();
    throw new ApiError(401, 'Sesión expirada. Inicie sesión nuevamente.');
  }

  // Otros errores → intenta leer el mensaje del backend (se conserva el cuerpo
  // en ApiError.data para que los handlers puedan usar campos como expira_en)
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, data?.message ?? 'Error en la solicitud', data ?? undefined);
  }

  return res.json() as Promise<T>;
}

/** API genérica (GET / POST / PUT / PATCH / DELETE) */
export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};

// ------------------------------------------------------------
// Tipos de respuesta del backend
// ------------------------------------------------------------
export interface UsuarioAuth {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}

export interface LoginResponse {
  token: string;
  /** true → el token es temporal: el usuario debe completar el 2FA antes de acceder */
  '2faRequired'?: boolean;
  usuario: UsuarioAuth;
}

/**
 * Redirección según el rol tras un login exitoso:
 *   Administrador → /admin
 *   Guarda        → /guardia
 *   Inquilino     → /inquilino
 */
export const rutaPorRol = (rol: string): string => {
  const rutas: Record<string, string> = {
    Administrador: '/admin',
    Guarda: '/guardia',
    Inquilino: '/inquilino',
  };
  return rutas[rol] ?? '/login';
};

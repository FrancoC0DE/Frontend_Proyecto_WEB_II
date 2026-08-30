/**
 * ============================================================================
 * Archivo: areaServices.ts
 * ============================================================================
 * Servicio del módulo de Áreas Comunes conectado al backend real (Express + JWT).
 *
 * Métodos que expone
 * - getAreas()             → GET  /api/areas
 * - createArea(datos)      → POST /api/areas  (JSON o FormData con el campo 'imagen')
 * - updateArea(id, datos)  → PUT  /api/areas/:id  (JSON o FormData con el campo 'imagen')
 * - toggleEstadoArea(id)   → PATCH /api/areas/:id/{activar|desactivar}
 * - buildAreaImageUrl(r)   → Convierte /uploads/... en URL completa para <img>
 *
 * Nota técnica sobre el upload
 * El apiClient adjunta siempre 'Content-Type: application/json', lo que rompería
 * el multipart (necesita el boundary generado por el navegador). Por eso el envío
 * de FormData usa fetch() crudo con solo el header Authorization.
 * ============================================================================
 */
import { api, ApiError, API_URL, TOKEN_KEY, USUARIO_KEY, buildStaticUrl } from './apiClient';

/** Ventana de mantenimiento de un área (hora inicio/fin + descripción opcional). */
export interface VentanaMantenimiento {
  hora_inicio: string;
  hora_fin: string;
  descripcion?: string | null;
}

export interface AreaComun {
  id_area?: number;
  nombre: string;
  capacidad_max: number;
  descripcion?: string | null;
  costo_por_hora: number;
  hora_apertura?: string;
  hora_cierre?: string;
  max_reservas_semana?: number;
  foto_principal?: string | null;
  estado?: string;
  /** Ventanas de mantenimiento del área (GET /api/areas las adjunta). */
  mantenimiento?: VentanaMantenimiento[];
}

/**
 * Convierte la ruta de foto_principal en una URL utilizable en <img>.
 * (Reutiliza buildStaticUrl: http(s) → tal cual; /uploads/... → URL base del backend.)
 */
export const buildAreaImageUrl = buildStaticUrl;

/**
 * Envía el FormData con fetch crudo (solo Authorization): el backend guarda el
 * archivo en uploads/areas/ y devuelve la ruta relativa en foto_principal.
 */
const enviarFormData = async (ruta: string, metodo: 'POST' | 'PUT', formData: FormData) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_URL}${ruta}`, {
    method: metodo,
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
    throw new ApiError(res.status, data?.message ?? 'Error en la solicitud', data ?? undefined);
  }

  return res.json();
};

export const getAreas = async (): Promise<AreaComun[]> => api.get<AreaComun[]>('/areas');

export const createArea = async (data: FormData | AreaComun) => {
  if (data instanceof FormData) return enviarFormData('/areas', 'POST', data);
  return api.post<{ message: string; id_area?: number | null }>('/areas', data);
};

export const updateArea = async (id: number, data: FormData | AreaComun) => {
  if (data instanceof FormData) return enviarFormData(`/areas/${id}`, 'PUT', data);
  return api.put<{ message: string }>(`/areas/${id}`, data);
};

export const toggleEstadoArea = async (id: number, activar: boolean) => {
  const endpoint = activar ? 'activar' : 'desactivar';
  return api.patch<{ message: string }>(`/areas/${id}/${endpoint}`);
};

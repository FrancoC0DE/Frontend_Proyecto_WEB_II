/**
 * ============================================================================
 * Archivo: reservasService.ts
 * ============================================================================
 * Servicio del módulo de Reservas (panel ADMIN). Consume la API real del
 * backend (GET /api/reservas/*) usando el cliente HTTP compartido (apiClient),
 * que adjunta el token JWT automáticamente.
 *
 * Endpoint que consume:
 *   GET /reservas/historial  → sp_ConsultarHistorial (historial paginado;
 *                              solo reservas de días ANTERIORES a hoy)
 *
 * El backend inyecta `id_usuario_actual` desde el JWT (req.user); aquí nunca
 * se envía desde el cliente.
 *
 * Filtros del historial (todos opcionales):
 *   residente, idArea, estado, fechaDesde, fechaHasta,
 *   pagina (def=1), limite (def=50)
 *
 * ============================================================================
 */

import { api } from './apiClient';

// ------------------------------------------------------------
// Tipos de respuesta del backend (snake_case = columnas de VW_Reservas)
// ------------------------------------------------------------

/** Fila del historial (sp_ConsultarHistorial → VW_Reservas). */
export interface ReservaHistorialRow {
  id_reserva?: number;
  id?: number;
  id_area?: number;
  id_usuario?: number;
  area?: string;
  nombre_area?: string;
  residente?: string;
  nombre_residente?: string;
  nombre_completo?: string;
  fecha?: string;
  fecha_reserva?: string;
  hora_inicio?: string;
  hora_fin?: string;
  estado?: string;
  cantidad_personas?: number;
  personas?: number;
  costo?: number;
  estado_pago?: string;
}

/** Respuesta paginada de GET /reservas/historial (mismo formato que /bitacora). */
export interface ReservasHistorialResponse {
  pagina: number;
  limite: number;
  totalRegistros: number;
  totalPaginas: number;
  datos: ReservaHistorialRow[];
}

/** Filtros del historial enviados como query params. */
export interface ReservasHistorialFiltros {
  residente?: string;
  idArea?: number;
  estado?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  pagina?: number;
  limite?: number;
}

// ------------------------------------------------------------
// Llamadas a la API
// ------------------------------------------------------------

export const reservasService = {
  /** Historial de reservas paginado con filtros (solo días pasados). */
  getHistorial: (filtros: ReservasHistorialFiltros = {}): Promise<ReservasHistorialResponse> => {
    const params = new URLSearchParams();
    if (filtros.residente?.trim()) params.set('residente', filtros.residente.trim());
    if (filtros.idArea) params.set('id_area', String(filtros.idArea));
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.fechaDesde) params.set('fecha_desde', filtros.fechaDesde);
    if (filtros.fechaHasta) params.set('fecha_hasta', filtros.fechaHasta);
    if (filtros.pagina) params.set('pageNumber', String(filtros.pagina));
    if (filtros.limite) params.set('pageSize', String(filtros.limite));

    const query = params.toString();
    return api.get<ReservasHistorialResponse>(`/reservas/historial${query ? `?${query}` : ''}`);
  },
};

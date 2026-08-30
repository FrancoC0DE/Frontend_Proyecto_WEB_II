/**
 * ============================================================================
 * Archivo: visitasService.ts
 * ============================================================================
 * Servicio del módulo de Visitas del panel ADMIN. Consume la API real del
 * backend (GET /api/visitas/*) usando el cliente HTTP compartido (apiClient),
 * que adjunta el token JWT automáticamente.
 *
 * Endpoints que consume (SPs de CondominioDB):
 *   GET /visitas/hoy          → sp_ListarVisitasDelDia (visitas de HOY en
 *                              cualquier estado: Pendiente/Autorizado/Rechazado)
 *   GET /visitas/historial    → sp_ListarHistorialVisitantes (paginado; el SP
 *                              no muestra HOY ni visitas futuras)
 *   GET /visitas/detalle/:id  → sp_ObtenerDetalleVisitante
 *
 * El backend inyecta `id_usuario_actual` desde el JWT (req.user); aquí nunca
 * se envía desde el cliente.
 *
 * Filtros del historial (todos opcionales):
 *   busqueda, estado (Pendiente|Autorizado|Rechazado), fechaInicio, fechaFin,
 *   pagina (def=1), limite (def=50)
 *
 * ============================================================================
 */

import { api } from './apiClient';

// ------------------------------------------------------------
// Tipos de respuesta del backend (snake_case = columnas de los SPs)
// ------------------------------------------------------------

/** Fila de la pestaña "Hoy" (sp_ListarVisitasDelDia). */
export interface VisitaDelDia {
  id_visitante: number;
  nombre_completo: string;
  documento_identidad: string | null;
  placa: string | null;
  /** Hora estimada de llegada, ya formateada "hh:mm tt". */
  hora_esperada: string | null;
  /** 'Pendiente' | 'Autorizado' | 'Rechazado'. */
  estado: string;
  /** Hora de la decisión "hh:mm tt" o NULL si sigue pendiente. */
  hora_decision: string | null;
  departamento: string | null;
  guarda_que_decidio: string | null;
  motivo_rechazo: string | null;
  inquilino_que_registro: string | null;
}

/** Fila del historial (sp_ListarHistorialVisitantes). */
export interface VisitaHistorialRow {
  id_visitante: number;
  nombre_completo: string;
  documento_identidad: string | null;
  placa: string | null;
  /** DATETIME2 sin formatear (la UI lo muestra en formato local). */
  fecha_hora_estimada: string;
  /** 'Pendiente' | 'Autorizado' | 'Rechazado'. */
  estado: string;
  /** DATETIME2 o NULL si la visita sigue pendiente. */
  fecha_decision: string | null;
  motivo_rechazo: string | null;
  inquilino_que_registro: string | null;
  departamento: string | null;
  guarda_que_decidio: string | null;
}

/** Detalle de una visita (sp_ObtenerDetalleVisitante) para el drawer. */
export interface VisitaDetalle {
  nombre_completo: string;
  documento_identidad: string | null;
  placa: string | null;
  hora_esperada: string | null;
  estado: string;
  hora_decision: string | null;
  motivo_rechazo: string | null;
  inquilino_que_registro: string | null;
  departamento: string | null;
  guarda_que_decidio: string | null;
}

/** Respuesta paginada de GET /visitas/historial (mismo formato que /bitacora). */
export interface VisitasHistorialResponse {
  pagina: number;
  limite: number;
  totalRegistros: number;
  totalPaginas: number;
  datos: VisitaHistorialRow[];
}

/** Filtros del historial enviados como query params. */
export interface VisitasHistorialFiltros {
  busqueda?: string;
  estado?: string;
  fechaInicio?: string;
  fechaFin?: string;
  pagina?: number;
  limite?: number;
}

// ------------------------------------------------------------
// Llamadas a la API
// ------------------------------------------------------------

export const visitasService = {
  /** Visitas decididas de HOY con filtros opcionales (busqueda, estado). */
  getVisitasHoy: (busqueda = '', estado = ''): Promise<VisitaDelDia[]> => {
    const params = new URLSearchParams();
    if (busqueda.trim()) params.set('busqueda', busqueda.trim());
    if (estado) params.set('estado', estado);
    const query = params.toString();
    return api.get<VisitaDelDia[]>(`/visitas/hoy${query ? `?${query}` : ''}`);
  },

  /** Historial completo paginado con filtros y paginación. */
  getHistorial: (filtros: VisitasHistorialFiltros = {}): Promise<VisitasHistorialResponse> => {
    const params = new URLSearchParams();
    if (filtros.busqueda?.trim()) params.set('busqueda', filtros.busqueda.trim());
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.fechaInicio) params.set('fechaInicio', filtros.fechaInicio);
    if (filtros.fechaFin) params.set('fechaFin', filtros.fechaFin);
    if (filtros.pagina) params.set('pageNumber', String(filtros.pagina));
    if (filtros.limite) params.set('pageSize', String(filtros.limite));

    const query = params.toString();
    return api.get<VisitasHistorialResponse>(`/visitas/historial${query ? `?${query}` : ''}`);
  },

  /** Detalle completo de una visita (drawer). */
  getDetalle: (idVisitante: number): Promise<VisitaDetalle> =>
    api.get<VisitaDetalle>(`/visitas/detalle/${idVisitante}`),
};

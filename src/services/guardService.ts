/**
 * ============================================================================
 * Archivo: guardService.ts
 * ============================================================================
 * Servicio del panel de Guardia. Consume la API real del backend
 * (/api/guard). El token JWT se adjunta automáticamente en cada petición
 * (apiClient), y el backend obtiene el id del guardia desde el token (req.user).
 *
 * Endpoints que consume:
 *   GET   /guard/dashboard/summary   → Resumen de tarjetas
 *   GET   /guard/dashboard/upcoming  → Próximas visitas
 *   GET   /guard/visits/pending      → Visitas esperadas
 *   GET   /guard/visits/history      → Historial del día
 *   GET   /guard/visits/:id          → Detalle de una visita
 *   PATCH /guard/visits/:id/status   → Autorizar / Rechazar
 * ============================================================================
 */

import { api } from './apiClient';

// ------------------------------------------------------------
// Tipos de respuesta del backend (snake_case = columnas de los SPs)
// ------------------------------------------------------------

export interface ResumenVisitasHoy {
  pendientes: number;
  autorizadas_hoy: number;
  rechazadas_hoy: number;
}

export interface VisitaProxima {
  nombre_completo: string;
  departamento: string | null;
  estado: string;
  hora_estimada: string; // ya formateada en 12h, ej. "02:30 PM"
}

export interface VisitaEsperada {
  id_visitante: number;
  nombre_completo: string;
  documento_identidad: string | null;
  placa: string | null;
  hora_esperada: string; // ya formateada en 12h
  estado: string;
  departamento: string | null;
}

export interface VisitaHistorial {
  id_visitante?: number;
  nombre_completo: string;
  documento_identidad: string | null;
  placa: string | null;
  hora_esperada: string;
  estado: string;
  hora_decision: string;
  departamento: string | null;
  guarda_que_decidio: string | null;
  /** Devueltos por sp_ListarHistorialVisitas_Del_Dia si se añaden; si no, el detalle usa la API */
  motivo_rechazo?: string | null;
  inquilino_que_registro?: string | null;
}

export interface DetalleVisita {
  id_visitante?: number;
  nombre_completo: string;
  documento_identidad: string | null;
  placa: string | null;
  hora_esperada: string;
  estado: string;
  hora_decision: string | null;
  motivo_rechazo: string | null;
  inquilino_que_registro: string | null;
  departamento: string | null;
  guarda_que_decidio: string | null;
}

export interface RespuestaRegistroIngreso {
  message: string;
  id_ingreso: number | null;
}

// ------------------------------------------------------------
// Llamadas a la API
// ------------------------------------------------------------

export const guardService = {
  /** Resumen de tarjetas: pendientes, autorizadas hoy, rechazadas hoy */
  getResumenVisitasHoy: (): Promise<ResumenVisitasHoy> =>
    api.get<ResumenVisitasHoy>('/guard/dashboard/summary'),

  /** Próximas visitas pendientes (widget lateral del dashboard) */
  getProximasVisitas: (): Promise<VisitaProxima[]> =>
    api.get<VisitaProxima[]>('/guard/dashboard/upcoming'),

  /** Visitas esperadas (Pendiente). search = nombre o documento (opcional) */
  getVisitasEsperadas: (search?: string): Promise<VisitaEsperada[]> => {
    const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return api.get<VisitaEsperada[]>(`/guard/visits/pending${query}`);
  },

  /** Historial del día. Filtros opcionales: search (nombre/documento) y status (Autorizado|Rechazado) */
  getHistorialVisitas: (search?: string, status?: string): Promise<VisitaHistorial[]> => {
    const params = new URLSearchParams();
    if (search?.trim()) params.set('search', search.trim());
    if (status && status !== 'all') params.set('status', status);
    const query = params.toString();
    return api.get<VisitaHistorial[]>(`/guard/visits/history${query ? `?${query}` : ''}`);
  },

  /** Detalle completo de una visita (modal) */
  getDetalleVisita: (idVisitante: number): Promise<DetalleVisita> =>
    api.get<DetalleVisita>(`/guard/visits/${idVisitante}`),

  /** Autoriza (true) o rechaza (false) una visita. El motivo es obligatorio al rechazar */
  registrarIngreso: (
    idVisitante: number,
    accesoPermitido: boolean,
    motivoRechazo?: string
  ): Promise<RespuestaRegistroIngreso> =>
    api.patch<RespuestaRegistroIngreso>(`/guard/visits/${idVisitante}/status`, {
      acceso_permitido: accesoPermitido,
      motivo_rechazo: accesoPermitido ? null : (motivoRechazo ?? ''),
    }),
};

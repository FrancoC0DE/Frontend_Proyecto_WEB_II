/**
 * ============================================================================
 * Archivo: inquilinoService.ts
 * ============================================================================
 *
 * ¿Qué hace?
 * Service layer del módulo Inquilino en el frontend. Centraliza todas las
 * llamadas HTTP a los endpoints del inquilino (áreas, reservas, visitantes):
 *
 *   Áreas:     obtenerAreasDisponibles, obtenerHorariosOcupados
 *   Reservas:  obtenerMisReservas, obtenerProximaReserva, crearReserva, cancelarReserva
 *   Visitantes: obtenerVisitantes, obtenerProximaVisita, registrarVisitante, cancelarVisitante
 *
 * Las respuestas crudas (Raw) se transforman a formato UI dentro de
 * DataContext.recargarReservasInquilino / recargarVisitantesInquilino.
 *
 * Se comunica con:
 *   - Backend: /api/inquilino/* (Inquilinoareacontroller, Inquilinoreservacontroller,
 *     Inquilinovisitantecontroller).
 *   - Consumido por: NuevaReservaPage, MisReservasPage, MisVisitantesPage,
 *     RegistrarVisitantePage, AdminDashboard (panel inquilino).
 *   - apiClient.ts (wrapper de fetch con JWT automático).
 *
 * ============================================================================
 */
import { api } from './apiClient';
import { toTimeOnly } from '../hooks/useLocalDate';

/**
 * NOTA (cambio): estas interfaces representan la forma CRUDA que devuelven
 * los stored procedures (sp_ListarMisReservas / sp_ListarMisVisitantes), NO
 * la forma que usa la UI (esa es `Reserva`/`Visitante` en types/index.ts).
 * Los nombres de columna y los tipos de fecha/hora (ISO de SQL Server) se
 * transforman a la forma UI dentro de DataContext.recargarReservasInquilino /
 * recargarVisitantesInquilino.
 */
export interface VisitanteInquilinoRaw {
  id_visitante: number;
  nombre_completo: string;
  documento_identidad: string;
  placa: string | null;
  /** ISO string (DATETIME) o null si aún no se definió hora esperada */
  hora_esperada: string | null;
  /** Alias que devuelve el SP en algunas versiones */
  fecha_hora_estimada?: string | null;
  fecha_autorizacion?: string | null;
  estado: string;
  motivo_rechazo?: string | null;
}

export interface ReservaInquilinoRaw {
  id_reserva: number;
  area: string;
  /** ISO string (SQL Server DATE), ej. "2026-08-15T00:00:00.000Z" */
  fecha: string;
  /** ISO string (SQL Server TIME), ej. "1970-01-01T13:00:00.000Z" */
  hora_inicio: string;
  hora_fin: string;
  cantidad_personas: number;
  estado: string;
  costo: number;
  estado_pago: string;
}

/** Respuesta de GET /api/inquilino/reservas/proxima (sp_ObtenerMiProximaReserva) */
export interface ProximaReservaRaw {
  id_reserva: number;
  area: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  cantidad_personas: number;
  costo: number;
  estado: string;
  estado_pago: string;
}

/** Respuesta de GET /api/inquilino/visitantes/proxima (sp_ObtenerMiProximaVisita) */
export interface ProximaVisitaRaw {
  id_visitante: number;
  nombre_completo: string;
  hora_esperada: string;
  estado: string;
}

/** Respuesta de GET /api/inquilino/areas (sp_ListarAreasDisponibles) */
export interface AreaInquilinoRaw {
  id_area: number;
  nombre: string;
  foto_principal: string | null;
  descripcion: string;
  capacidad_max: number;
  costo_por_hora: number;
  /** ISO string con fecha epoch (SQL Server TIME), ej. "1970-01-01T06:00:00.000Z" */
  hora_apertura: string;
  hora_cierre: string;
  /** 'Disponible' | cualquier otro valor = no disponible */
  estado: string;
}

/**
 * Intervalo ocupado devuelto por GET /inquilino/areas/:id/horarios
 * (sp_ListarHorariosDisponibles): una reserva ACTIVA de cualquier inquilino.
 * Las horas llegan normalizadas a 'HH:mm[:ss]' por toTimeOnly.
 */
export interface HorarioOcupado {
  id_reserva: number;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
}

/** Respuesta cruda de GET /inquilino/areas/:id/horarios (hora ISO de SQL Server). */
export interface HorariosOcupadosResponse {
  id_area: number;
  fecha: string;
  ocupados: {
    id_reserva: number;
    hora_inicio: string;
    hora_fin: string;
    estado: string;
  }[];
}

/** Payload esperado por POST /api/inquilino/reservas (Inquilinoreservacontroller.crearReserva) */
export interface CrearReservaInquilinoPayload {
  id_area: number;
  fecha: string;           // "YYYY-MM-DD"
  hora_inicio: string;     // "HH:mm"
  hora_fin: string;        // "HH:mm"
  cantidad_personas: number;
  metodo_pago: 'tarjeta' | 'efectivo' | 'sinpe';
}

export interface CrearReservaInquilinoResponse {
  message: string;
  id_reserva: number | null;
  /** Monto confirmado: lo calcula sp_CrearReservaPago (monto_pagado), no el cliente */
  monto: number;
}

export const inquilinoService = {
  // --- VISITANTES ---
  obtenerVisitantes: async (): Promise<VisitanteInquilinoRaw[]> => { return await api.get<VisitanteInquilinoRaw[]>('/inquilino/visitantes'); },
  obtenerProximaVisita: async (): Promise<ProximaVisitaRaw | null> => { return await api.get<ProximaVisitaRaw | null>('/inquilino/visitantes/proxima'); },
  registrarVisitante: async (data: { nombre_completo: string; documento_identidad: string; placa?: string; hora_esperada: string }): Promise<{ message: string; id_visitante?: number | null }> => { return await api.post('/inquilino/visitantes', data); },
  cancelarVisitante: async (id: number) => { return await api.patch(`/inquilino/visitantes/${id}`); },
  // --- ÁREAS ---
  obtenerAreasDisponibles: async (): Promise<AreaInquilinoRaw[]> => { return await api.get<AreaInquilinoRaw[]>('/inquilino/areas'); },
  // --- HORARIOS OCUPADOS (disponibilidad para Nueva Reserva) ---
  // GET /inquilino/areas/:id/horarios?fecha=YYYY-MM-DD → sp_ListarHorariosDisponibles.
  // Devuelve los intervalos OCUPADOS del día (TODAS las reservas activas de
  // cualquier inquilino); la UI arma los bloques libres a partir de ellos.
  obtenerHorariosOcupados: async (idArea: number, fecha: string): Promise<HorarioOcupado[]> => {
    const res = await api.get<HorariosOcupadosResponse>(`/inquilino/areas/${idArea}/horarios?fecha=${encodeURIComponent(fecha)}`);
    return (res.ocupados ?? []).map(o => ({
      id_reserva: o.id_reserva,
      hora_inicio: toTimeOnly(o.hora_inicio),
      hora_fin: toTimeOnly(o.hora_fin),
      estado: o.estado,
    }));
  },
  // --- RESERVAS ---
  obtenerMisReservas: async (): Promise<ReservaInquilinoRaw[]> => { return await api.get<ReservaInquilinoRaw[]>('/inquilino/reservas'); },
  obtenerProximaReserva: async (): Promise<ProximaReservaRaw | null> => { return await api.get<ProximaReservaRaw | null>('/inquilino/reservas/proxima'); },
  crearReserva: async (data: CrearReservaInquilinoPayload): Promise<CrearReservaInquilinoResponse> => { return await api.post<CrearReservaInquilinoResponse>('/inquilino/reservas', data); },
  // NOTA (cambio - fix ruta): Inquilinoreservaroute.ts define
  // `PATCH /api/inquilino/reservas/:id` (sin sufijo /cancelar); antes esta
  // función apuntaba a `/inquilino/reservas/${id}/cancelar`, que no existe
  // como ruta -> hubiera fallado (404) en cuanto se usara.
  cancelarReserva: async (id: number) => { return await api.patch(`/inquilino/reservas/${id}`); }
};
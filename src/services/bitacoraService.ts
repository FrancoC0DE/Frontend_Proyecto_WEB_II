/**
 * ============================================================================
 * Archivo: bitacoraService.ts
 * ============================================================================
 * Servicio del módulo de Bitácora (auditoría). Consume la API real del backend
 * (GET /api/bitacora) usando el cliente HTTP compartido (apiClient), que adjunta
 * el token JWT automáticamente.
 *
 * El backend valida que el usuario autenticado tenga rol `Administrador` y
 * devuelve la respuesta paginada:
 *   { pagina, limite, totalRegistros, totalPaginas, datos: BitacoraRegistro[] }
 *
 * Filtros admitidos (todos opcionales):
 *   fechaInicio, fechaFin, tabla, operacion, busqueda, pagina, limite
 *
 * NOTA: el filtro por ID de usuario se eliminó de la interfaz (y del endpoint)
 * porque el admin no puede conocer el id de cada usuario. El SP
 * sp_ObtenerBitacora sigue aceptando @IdUsuario por si se rehabilita algún día.
 *
 * ============================================================================
 */

import { api } from './apiClient';
import type { BitacoraResponse } from '../types';

/** Filtros y paginación enviados como query params a GET /api/bitacora. */
export interface BitacoraFiltros {
  fechaInicio?: string;
  fechaFin?: string;
  tabla?: string;
  operacion?: string;
  /** Búsqueda libre en descripción o en los JSON. */
  busqueda?: string;
  pagina?: number;
  limite?: number;
}

export const bitacoraService = {
  /** Consulta la bitácora con filtros y paginación. */
  getBitacora: (filtros: BitacoraFiltros = {}): Promise<BitacoraResponse> => {
    const params = new URLSearchParams();
    if (filtros.fechaInicio) params.set('fechaInicio', filtros.fechaInicio);
    if (filtros.fechaFin) params.set('fechaFin', filtros.fechaFin);
    if (filtros.tabla) params.set('tabla', filtros.tabla);
    if (filtros.operacion) params.set('operacion', filtros.operacion);
    if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
    if (filtros.pagina) params.set('pagina', String(filtros.pagina));
    if (filtros.limite) params.set('limite', String(filtros.limite));

    const query = params.toString();
    return api.get<BitacoraResponse>(`/bitacora${query ? `?${query}` : ''}`);
  },
};

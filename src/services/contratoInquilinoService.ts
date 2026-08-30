/**
 * ============================================================================
 * Archivo: contratoInquilinoService.ts
 * ============================================================================
 * Servicio del módulo "Mis Contratos" (panel Inquilino). Consume /api/contratos
 * vía el cliente compartido `api` (adjunta el JWT automáticamente):
 *
 *   GET /contratos/mis-contratos → contratos del inquilino autenticado
 *   GET /contratos/:id/pagos     → historial de pagos de un contrato
 *
 * ============================================================================
 */
import { api } from './apiClient';

/**
 * Contrato del inquilino (filas de sp_Contrato_Listar filtradas por usuario).
 * `fecha_inicio`/`fecha_fin` llegan como ISO strings de SQL Server
 * (ej. "2026-01-01T00:00:00.000Z"); la UI los recorta a "YYYY-MM-DD".
 */
export interface ContratoInquilino {
  id_contrato: number;
  id_usuario: number;
  residente: string;
  id_departamento: number;
  /** Número del departamento (ej. "3B"). */
  departamento: string;
  fecha_inicio: string;
  fecha_fin: string;
  monto_mensual: number;
  monto_deposito: number;
  /** 'Activo' | 'Finalizado' */
  estado: string;
}

/** Historial de pagos de un contrato (tabla Pago, id_contrato). */
export interface PagoContrato {
  id_pago: number;
  residente: string;
  concepto: string;
  monto: number;
  /** ISO string (DATETIME2). */
  fecha_pago: string;
  metodo_pago: string;
  /** Siempre 'Pagado' en la BD (los pagos registrados no cambian de estado). */
  estado: string;
}

export const contratoInquilinoService = {
  /** GET /contratos/mis-contratos */
  obtenerMisContratos: async (): Promise<ContratoInquilino[]> => {
    return await api.get<ContratoInquilino[]>('/contratos/mis-contratos');
  },

  /** GET /contratos/:id/pagos */
  obtenerPagosContrato: async (idContrato: number): Promise<PagoContrato[]> => {
    return await api.get<PagoContrato[]>(`/contratos/${idContrato}/pagos`);
  },
};

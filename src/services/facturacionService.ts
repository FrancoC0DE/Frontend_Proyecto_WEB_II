/**
 * ============================================================================
 * Archivo: facturacionService.ts
 * ============================================================================
 * Servicio del módulo de Facturación Electrónica. Consume /api/facturacion
 * vía el cliente compartido `api` (adjunta el JWT automáticamente).
 *
 *   GET  /facturacion/pendientes  → facturas sin firmar (Administrador)
 *   GET  /facturacion              → historial completo (Administrador)
 *   POST /facturacion/:id/firmar  → envía el resultado de la firma de HSM
 *                                    Sign CR y dispara el envío a Mini
 *                                    Tributación (Administrador)
 *   GET  /facturacion/mis-facturas → facturas propias (Inquilino)
 * ============================================================================
 */
import { api, API_URL, TOKEN_KEY } from './apiClient';

export interface FacturaPendiente {
  id: number;
  id_pago: number;
  cliente_nombre: string;
  monto: number;
  estado: string;
  fecha_generacion: string;
  /** XML SIN firmar — se manda al popup de HSM Sign CR para firmarlo. */
  xml_original: string;
}

export interface FacturaHistorial {
  id: number;
  id_pago: number;
  cliente_nombre: string;
  monto: number;
  estado: string;
  numero_acuse: string | null;
  motivo_rechazo: string | null;
  firmado_por: string | null;
  fecha_generacion: string;
  fecha_envio: string | null;
  fecha_respuesta: string | null;
  tiene_comprobante: boolean;
  bk_error: string | null;
}

export interface FacturaPropia {
  id: number;
  monto: number;
  estado: string;
  numero_acuse: string | null;
  motivo_rechazo: string | null;
  fecha_generacion: string;
  fecha_respuesta: string | null;
}

export interface RespuestaFirmarEnviar {
  message: string;
  estado: 'aceptada' | 'rechazada';
  numeroAcuse: string | number | null;
  motivo?: string | null;
  /** true si Billing Kilometer emitió el PDF del comprobante (independiente de DGTD). */
  comprobanteBK?: boolean;
}

export const facturacionService = {
  /** GET /facturacion/pendientes — facturas sin firmar (Administrador). */
  obtenerPendientes: async (): Promise<FacturaPendiente[]> => {
    return await api.get<FacturaPendiente[]>('/facturacion/pendientes');
  },

  /** GET /facturacion — historial completo (Administrador). */
  obtenerHistorial: async (): Promise<FacturaHistorial[]> => {
    return await api.get<FacturaHistorial[]>('/facturacion');
  },

  /**
   * POST /facturacion/:id/firmar — envía el resultado de la firma
   * (obtenido del popup de HSM Sign CR) para que el backend la valide y la
   * envíe a Mini Tributación (Administrador).
   */
  firmarYEnviar: async (
    id: number,
    datos: { xmlFirmado: string; hashDocumento?: string; serialCertificado?: string }
  ): Promise<RespuestaFirmarEnviar> => {
    return await api.post<RespuestaFirmarEnviar>(`/facturacion/${id}/firmar`, datos);
  },

  /** GET /facturacion/mis-facturas — facturas propias (Inquilino). */
  obtenerMisFacturas: async (): Promise<FacturaPropia[]> => {
    return await api.get<FacturaPropia[]>('/facturacion/mis-facturas');
  },

  /**
   * POST /facturacion/:id/reintentar-comprobante — reintenta SOLO el paso de
   * Billing Kilometer para una factura ya aceptada por Mini Tributación cuyo
   * comprobante falló (Administrador). No vuelve a firmar ni a re-enviar a DGTD.
   */
  reintentarComprobante: async (id: number): Promise<{ message: string; comprobanteBK: boolean }> => {
    return await api.post<{ message: string; comprobanteBK: boolean }>(`/facturacion/${id}/reintentar-comprobante`);
  },

  /**
   * Abre en una pestaña nueva el PDF de Billing Kilometer de una factura
   * (dueño o Administrador). fetch + token + blob, igual que pagosService.
   */
  verComprobante: async (id: number): Promise<void> => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_URL}/facturacion/${id}/comprobante`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(data?.message || 'No se pudo obtener el comprobante.');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

/**
 * ============================================================================
 * Archivo: pagosService.ts
 * ============================================================================
 * Servicio del módulo de Pagos. Consume /api/pagos vía el cliente compartido
 * `api` (adjunta el JWT automáticamente). Endpoints:
 *
 *   GET  /pagos          → listado unificado paginado (admin)
 *   GET  /pagos/metricas → tarjetas resumen (admin)
 *   POST /pagos/manual   → registrar pago administrativo (admin)
 *   POST /pagos/contrato → pagar mensualidad de un contrato (inquilino)
 *   GET  /pagos/reporte  → PDF exportable (admin) — se descarga con token
 *
 * ============================================================================
 */
import { api, API_URL, TOKEN_KEY } from './apiClient';

/** Fila del listado unificado (equivalente a VW_AdministracionPagos + categoría). */
export interface PagoAdmin {
  id_pago: number;
  residente: string;
  concepto: string;
  /** Número (la UI lo formatea con formatearMoneda). */
  monto: number;
  /** ISO string (DATETIME2 de SQL Server). */
  fecha_pago: string;
  metodo_pago: string;
  estado: string;
  id_reserva: number | null;
  id_contrato: number | null;
  /** 'Reserva' | 'Contrato' | 'Administrativo' — calculada en el backend. */
  categoria: 'Reserva' | 'Contrato' | 'Administrativo';
}

/** Respuesta paginada de GET /pagos (mismo formato que /api/bitacora). */
export interface PagosResponse {
  pagina: number;
  limite: number;
  totalRegistros: number;
  totalPaginas: number;
  datos: PagoAdmin[];
}

/** Tarjetas resumen (sp_ObtenerMetricasPagos). */
export interface MetricasPagos {
  total_recaudado: number;
  pendientes: number;
  pagados_hoy: number;
}

/** Filtros del listado de pagos (admin). */
export interface FiltrosPagos {
  busqueda?: string;
  estado?: string;
  fechaInicio?: string; // YYYY-MM-DD
  fechaFin?: string;    // YYYY-MM-DD
  pageNumber?: number;
  pageSize?: number;
}

/** Payload de POST /pagos/manual (pago administrativo). */
export interface PagoManualPayload {
  residente: string;
  concepto: string;
  monto: number;
  tipo_pago: string;
  estado_pago?: string;
}

/** Payload de POST /pagos/contrato (pago de mensualidad del inquilino). */
export interface PagoContratoPayload {
  id_contrato: number;
  monto: number;
  tipo_pago: string;
  concepto?: string;
}

export const pagosService = {
  /** GET /pagos — listado paginado con filtros (Administrador). */
  listarPagos: async (filtros: FiltrosPagos = {}): Promise<PagosResponse> => {
    const params = new URLSearchParams();
    if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.fechaInicio) params.set('fecha_inicio', filtros.fechaInicio);
    if (filtros.fechaFin) params.set('fecha_fin', filtros.fechaFin);
    params.set('pageNumber', String(filtros.pageNumber ?? 1));
    params.set('pageSize', String(filtros.pageSize ?? 50));

    const qs = params.toString();
    return await api.get<PagosResponse>(`/pagos${qs ? `?${qs}` : ''}`);
  },

  /** GET /pagos/metricas — tarjetas resumen (Administrador). */
  obtenerMetricas: async (): Promise<MetricasPagos> => {
    return await api.get<MetricasPagos>('/pagos/metricas');
  },

  /** POST /pagos/manual — registrar pago administrativo (Administrador). */
  registrarPagoManual: async (payload: PagoManualPayload): Promise<{ message?: string; id_pago?: number | null }> => {
    return await api.post<{ message?: string; id_pago?: number | null }>('/pagos/manual', payload);
  },

  /** POST /pagos/contrato — pagar la mensualidad de un contrato (Inquilino). */
  registrarPagoContrato: async (payload: PagoContratoPayload): Promise<{ message?: string; id_contrato?: number }> => {
    return await api.post<{ message?: string; id_contrato?: number }>('/pagos/contrato', payload);
  },

  /**
   * GET /pagos/reporte — descarga el PDF de pagos con los filtros de fecha.
   * Se usa fetch directo (no `api.get`) porque la respuesta es un blob PDF y
   * hay que adjuntar el token manualmente.
   */
  descargarReportePdf: async (fechaInicio?: string, fechaFin?: string): Promise<void> => {
    const params = new URLSearchParams();
    if (fechaInicio) params.set('fecha_inicio', fechaInicio);
    if (fechaFin) params.set('fecha_fin', fechaFin);
    const qs = params.toString();

    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_URL}/pagos/reporte${qs ? `?${qs}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(data?.message || 'Error al generar el reporte de pagos.');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `Reporte_Pagos_${fechaInicio || 'Inicio'}_a_${fechaFin || 'Fin'}.pdf`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
  },

  /**
   * Abre en una pestaña nueva el comprobante de pago (PDF, solo lectura) de
   * un pago puntual (mensualidad de contrato) o de una reserva. Usa fetch +
   * token (igual que descargarReportePdf) porque la respuesta es un blob PDF;
   * a diferencia del reporte, este se ABRE para verlo (no se fuerza descarga)
   * ya que es un comprobante individual, no un archivo para archivar.
   */
  verReciboPago: async (idPago: number): Promise<void> => {
    await abrirReciboPdf(`/pagos/${idPago}/recibo`);
  },

  /** Mismo comprobante, pero buscado por id_reserva (MisReservasPage no trae id_pago). */
  verReciboReserva: async (idReserva: number): Promise<void> => {
    await abrirReciboPdf(`/pagos/reserva/${idReserva}/recibo`);
  },
};

/** Descarga el PDF del comprobante y lo abre en una pestaña nueva (blob URL). */
const abrirReciboPdf = async (rutaRelativa: string): Promise<void> => {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_URL}${rutaRelativa}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(data?.message || 'No se pudo obtener el comprobante de pago.');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Se revoca después de dar tiempo a que la pestaña nueva termine de cargar
  // el blob; revocarlo de inmediato invalidaría la URL antes de que se pinte.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

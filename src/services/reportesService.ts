/**
 * ============================================================================
 * Archivo: reportesService.ts
 * ============================================================================
 * Servicio de descarga de los reportes del módulo de Reportes que exigen
 * token JWT. Los endpoints de contratos/reservas/visitas ya NO son públicos
 * (antes se abrían con window.open); ahora se descargan con fetch +
 * Authorization: Bearer + blob. Endpoints:
 *
 *   GET /reportes/contratos/pdf → sp_ObtenerReporteContratos + PDF
 *   GET /reportes/reservas/pdf  → sp_ObtenerReporteReservas  + PDF
 *   GET /reportes/visitas/pdf   → sp_ReporteVisitas          + PDF
 *
 * (El de pagos vive en pagosService.descargarReportePdf.)
 *
 * ============================================================================
 */
import { API_URL, TOKEN_KEY } from './apiClient';

/** Descarga un PDF protegido (fetch con token + blob → descarga). */
const descargarPdf = async (
  rutaRelativa: string,
  nombreBase: string,
  fechaInicio?: string,
  fechaFin?: string,
): Promise<void> => {
  const params = new URLSearchParams();
  if (fechaInicio) params.set('fecha_inicio', fechaInicio);
  if (fechaFin) params.set('fecha_fin', fechaFin);
  const qs = params.toString();

  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_URL}${rutaRelativa}${qs ? `?${qs}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(data?.message || 'Error al generar el reporte.');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${nombreBase}_${fechaInicio || 'Inicio'}_a_${fechaFin || 'Fin'}.pdf`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
};

export const reportesService = {
  /** GET /reportes/visitas/pdf — reporte de visitas autorizadas. */
  descargarVisitasPdf: (fechaInicio?: string, fechaFin?: string): Promise<void> =>
    descargarPdf('/reportes/visitas/pdf', 'Reporte_Visitas', fechaInicio, fechaFin),

  /** GET /reportes/contratos/pdf — reporte de contratos. */
  descargarContratosPdf: (fechaInicio?: string, fechaFin?: string): Promise<void> =>
    descargarPdf('/reportes/contratos/pdf', 'Reporte_Contratos', fechaInicio, fechaFin),

  /** GET /reportes/reservas/pdf — reporte de reservas. */
  descargarReservasPdf: (fechaInicio?: string, fechaFin?: string): Promise<void> =>
    descargarPdf('/reportes/reservas/pdf', 'Reporte_Reservas', fechaInicio, fechaFin),
};

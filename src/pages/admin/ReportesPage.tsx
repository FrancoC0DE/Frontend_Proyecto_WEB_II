/**
 * ============================================================================
 * Archivo: ReportesPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla de reportes administrativos. Genera reportes reales en PDF
 * conectados a la base de datos para contratos y reservas.
 *
 * Componentes que utiliza
 * - PageHeader (título)
 * - Drawer (selector de fechas y descarga del reporte)
 *
 * ============================================================================
 */

import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import { useAlert } from '../../components/Alert';
import { pagosService } from '../../services/pagosService';
import { reportesService } from '../../services/reportesService';

export default function ReportesPage() {
  const { showAlert } = useAlert();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerBody, setDrawerBody] = useState<React.ReactNode>(null);
  const [drawerFooter, setDrawerFooter] = useState<React.ReactNode>(null);

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // 🚀 Función para descargar el PDF real desde Node.js.
  // Los 4 reportes exigen token JWT (los endpoints ya NO son públicos): se
  // descargan vía servicio (fetch con Authorization + blob), respetando el
  // rango de fechas. Antes contratos/reservas se abrían con window.open a un
  // endpoint público.
  const descargadores: Record<string, (fi?: string, ff?: string) => Promise<void>> = {
    pagos: (fi, ff) => pagosService.descargarReportePdf(fi, ff),
    visitas: (fi, ff) => reportesService.descargarVisitasPdf(fi, ff),
    contratos: (fi, ff) => reportesService.descargarContratosPdf(fi, ff),
    reservas: (fi, ff) => reportesService.descargarReservasPdf(fi, ff),
  };

  const ejecutarDescargaPDF = async (tipo: string, fechaInicio: string, fechaFin: string) => {
    const descargar = descargadores[tipo];
    if (!descargar) {
      showAlert(`El reporte de ${tipo} estará disponible próximamente.`);
      return;
    }
    try {
      await descargar(fechaInicio || undefined, fechaFin || undefined);
      showAlert(`Reporte de ${tipo} generado correctamente.`, { titulo: 'Éxito', tipo: 'success' });
    } catch (err: unknown) {
      const e = err as Error;
      showAlert(e.message || 'No se pudo generar el reporte.', { titulo: 'Error', tipo: 'error' });
    }
    setDrawerOpen(false);
  };

  const generarReporte = (tipo: string) => {
    setDrawerTitle(`Reporte de ${capitalize(tipo)}`);
    setDrawerBody(
      <div className="form-section">
        <h4>Rango de fechas</h4>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="reporteFechaInicio">Fecha inicio</label>
            <input type="date" id="reporteFechaInicio" />
          </div>
          <div className="form-group">
            <label htmlFor="reporteFechaFin">Fecha fin</label>
            <input type="date" id="reporteFechaFin" />
          </div>
        </div>
      </div>
    );
    setDrawerFooter(
      <button 
        className="btn-primary" 
        style={{ width: '100%', justifyContent: 'center' }} 
        onClick={() => confirmarRango(tipo)}
      >
        <i className="fas fa-file-export"></i> Generar reporte
      </button>
    );
    setDrawerOpen(true);
  };

  const confirmarRango = (tipo: string) => {
    const fechaInicio = (document.getElementById('reporteFechaInicio') as HTMLInputElement)?.value;
    const fechaFin = (document.getElementById('reporteFechaFin') as HTMLInputElement)?.value;

    if (!fechaInicio || !fechaFin) {
      showAlert('Selecciona la fecha de inicio y la fecha de fin para el reporte.');
      return;
    }
    if (fechaInicio > fechaFin) {
      showAlert('La fecha de inicio no puede ser posterior a la fecha de fin.');
      return;
    }

    const rangoTexto = `${fechaInicio} al ${fechaFin}`;
    setDrawerTitle(`Reporte de ${capitalize(tipo)}`);
    setDrawerBody(
      <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
        <i className="fas fa-file-pdf" style={{ fontSize: '4rem', color: 'var(--accent)', marginBottom: 'var(--space-3)' }}></i>
        <h3>Reporte listo para descargar</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 'var(--space-3) 0' }}>
          El informe se generó correctamente para el rango <strong>{rangoTexto}</strong>.
        </p>
      </div>
    );

    setDrawerFooter(
      <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', justifyContent: 'center' }}>
        <button 
          className="btn-primary" 
          onClick={() => ejecutarDescargaPDF(tipo, fechaInicio, fechaFin)}
        >
          <i className="fas fa-download"></i> Abrir PDF
        </button>
        <button className="btn-secondary" onClick={() => setDrawerOpen(false)}>
          Cerrar
        </button>
      </div>
    );
  };

  const reportes = [
    { tipo: 'reservas', titulo: 'Reporte de Reservas', desc: 'Informe detallado de todas las reservas.' },
    { tipo: 'pagos', titulo: 'Reporte de Pagos', desc: 'Resumen de pagos y morosidad.' },
    { tipo: 'contratos', titulo: 'Reporte de Contratos', desc: 'Listado de contratos activos y vencidos.' },
    { tipo: 'visitas', titulo: 'Reporte de Visitas', desc: 'Registro de accesos autorizados con filtros.' },
    //{ tipo: 'bitacora', titulo:'Reporte de bitácora', desc: 'Informe de bitácora'}
  ];

  return (
    <>
      <PageHeader title="Reportes" />

      <div className="reports-grid">
        {reportes.map(r => (
          <div key={r.tipo} className="report-card">
            <div className="report-card-header">
              <h4>{r.titulo}</h4>
              <span className="badge">PDF</span>
            </div>
            <p>{r.desc}</p>
            <button className="btn-primary report-btn-full" onClick={() => generarReporte(r.tipo)}>
              Generar
            </button>
          </div>
        ))}
      </div>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerTitle}
        size="md"
        footer={drawerFooter}
      >
        {drawerBody}
      </Drawer>
    </>
  );
}
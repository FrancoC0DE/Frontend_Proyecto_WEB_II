/**
 * ============================================================================
 * Archivo: AdminDashboard.tsx
 * ============================================================================
 */

import { useEffect } from 'react';
import { useData } from '../../context/DataContext';

interface AdminDashboardProps {
  onNavigate: (page: string) => void;
}

interface ReservaDashboard {
  id_reserva: number;
  hora: string;
  area_comun: string;
  residente: string;
}

interface AlertaDashboard {
  mensaje: string;
  prioridad: 'Alta' | 'Media' | 'Baja';
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { dashboardData, activityLog, recargarDashboard } = useData();

  // Máx. de registros visibles en la tarjeta de Actividad reciente; "Ver todas"
  // lleva a la pantalla completa (ActividadPage) con el resto y el botón Volver.
  const ACTIVIDAD_VISIBLE_MAX = 6;

  // Auto-refresh cada 30s + al volver a enfocar la ventana
  useEffect(() => {
    const timer = setInterval(() => {
      void recargarDashboard();
    }, 30_000);

    const onFocus = () => {
      void recargarDashboard();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [recargarDashboard]);

  if (!dashboardData) {
    return <p style={{ color: 'var(--text-muted)', padding: 'var(--space-4)' }}>Cargando dashboard...</p>;
  }

  const kpis = dashboardData.kpis ?? {
    reservas_hoy: 0, 
    visitas_registradas: 0, 
    contratos_activos: 0, 
    areas_ocupadas: 0, 
    ingresos_del_dia: 0
  };

  // Soporte defensivo para 'ingresos_dia' o 'ingresos_del_dia'
  const ingresos = kpis.ingresos_del_dia ?? (kpis as { ingresos_dia?: number }).ingresos_dia ?? 0;

  const proximasReservas = (dashboardData.proximasReservas ?? []) as ReservaDashboard[];
  const alertas = (dashboardData.alertas ?? []) as AlertaDashboard[];
  // Actividad reciente: seguimiento LOCAL del admin (localStorage), no de la BD.
  const actividadReciente = activityLog;

  return (
    <>
      <h2 style={{ marginBottom: 'var(--space-4)' }}>Dashboard</h2>

      {/* KPI GRID */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => onNavigate('reservas')} tabIndex={0} role="button">
          <div className="kpi-icon"><i className="fas fa-calendar-day"></i></div>
          <div className="kpi-label">Reservas hoy</div>
          <div className="kpi-value" id="kpiReservasHoy">{kpis.reservas_hoy}</div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate('visitas-autorizadas')} tabIndex={0} role="button">
          <div className="kpi-icon"><i className="fas fa-user-check"></i></div>
          <div className="kpi-label">Visitas registradas</div>
          <div className="kpi-value">{kpis.visitas_registradas}</div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate('contratos')} tabIndex={0} role="button">
          <div className="kpi-icon"><i className="fas fa-file-contract"></i></div>
          <div className="kpi-label">Contratos activos</div>
          <div className="kpi-value">{kpis.contratos_activos}</div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate('areas')} tabIndex={0} role="button">
          <div className="kpi-icon"><i className="fas fa-people-arrows"></i></div>
          <div className="kpi-label">Áreas ocupadas</div>
          <div className="kpi-value">{kpis.areas_ocupadas}</div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate('pagos')} tabIndex={0} role="button">
          <div className="kpi-icon"><i className="fas fa-coins"></i></div>
          <div className="kpi-label">Ingresos del día</div>
          <div className="kpi-value">₡{ingresos.toLocaleString('es-CR')}</div>
        </div>
      </div>

      {/* SECCIONES SECUNDARIAS */}
      <div className="dashboard-grid">
        {/* PRÓXIMAS RESERVAS */}
        <div className="card">
          <div className="card-header">
            <h3>Próximas reservas</h3>
            <a href="#reservas" onClick={e => { e.preventDefault(); onNavigate('reservas'); }}>Ver todas</a>
          </div>
          {proximasReservas.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: 'var(--space-2) 0' }}>No hay reservas programadas.</p>
          ) : (
            proximasReservas.map(reserva => (
              <div key={reserva.id_reserva} className="next-reservation-item">
                <span className="reservation-time">{reserva.hora}</span>
                <span className="reservation-info">
                  <strong>{reserva.area_comun}</strong> · {reserva.residente}
                </span>
              </div>
            ))
          )}
        </div>

        {/* ALERTAS ADMINISTRATIVAS */}
        <div className="card">
          <div className="card-header"><h3>Alertas administrativas</h3></div>
          <div id="alertasContainer">
            {alertas.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', padding: 'var(--space-2) 0' }}>No hay alertas.</p>
            ) : (
              alertas.map((alerta, index) => (
                <div key={index} className="alert-item">
                  <span className="alert-text">{alerta.mensaje}</span>
                  <span className="alert-badge">
                    <span className={`badge ${
                      alerta.prioridad === 'Alta'
                        ? 'badge-priority-high'
                        : alerta.prioridad === 'Media'
                        ? 'badge-priority-medium'
                        : 'badge-priority-low'
                    }`}>
                      {alerta.prioridad}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ACTIVIDAD RECIENTE */}
        <div className="card">
          <div className="card-header">
            <h3>Actividad reciente</h3>
            <a href="#actividad" onClick={e => { e.preventDefault(); onNavigate('actividad'); }}>Ver todas</a>
          </div>
          <div id="actividadContainer">
            {actividadReciente.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', padding: 'var(--space-2) 0' }}>No hay actividad reciente.</p>
            ) : (
              actividadReciente.slice(0, ACTIVIDAD_VISIBLE_MAX).map((item, index) => (
                <div key={item.id ?? index} className="activity-item">
                  <span
                    className="activity-dot"
                    style={{ background: item.color || 'var(--primary-color, #007bff)' }}
                  ></span>
                  <span className="activity-text" dangerouslySetInnerHTML={{ __html: item.descripcion }}></span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
/**
 * ============================================================================
 * Archivo: ActividadPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Muestra el registro completo de actividad reciente del sistema.
 * Es la versión detallada del widget de actividad del Dashboard.
 *
 * Componentes que utiliza
 * - useData (contexto: activityLog)
 * - useLocalDate (formato de tiempo relativo)
 *
 * ============================================================================
 */

import { useData } from '../../context/DataContext';
import { getTimeAgo } from '../../hooks/useLocalDate';

export default function ActividadPage() {
  const { activityLog } = useData();

  return (
    <>
      <div className="page-header">
        <h2>Actividad reciente</h2>
        <button className="btn-secondary" onClick={() => { window.location.hash = 'dashboard'; }}>
          <i className="fas fa-arrow-left"></i> Volver
        </button>
      </div>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', border: '1px solid var(--border-color)' }} id="actividadDetalleContainer">
        {activityLog.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: 'var(--space-2) 0' }}>No hay actividad reciente.</p>
        ) : (
          activityLog.map(item => (
            <div key={item.id} className="activity-item">
              <span className="activity-dot" style={{ background: item.color }}></span>
              <span className="activity-text" dangerouslySetInnerHTML={{ __html: item.descripcion }}></span>
              <span className="activity-time">{getTimeAgo(item.timestamp)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

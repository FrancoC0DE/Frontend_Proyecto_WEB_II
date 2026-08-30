/**
 * ============================================================================
 * Archivo: GuardiaDashboard.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla principal del panel de Guardia. Muestra KPIs de visitas:
 * pendientes, autorizadas hoy y rechazadas hoy. También lista las
 * próximas visitas pendientes.
 *
 * Los contadores y la lista de próximas visitas se cargan desde la API del
 * backend (guardService → /api/guard/dashboard/*), con el token JWT del guardia.
 *
 * ============================================================================
 */

import { useEffect, useState, useCallback } from 'react';
import { guardService, type ResumenVisitasHoy, type VisitaProxima } from '../../services/guardService';

// Cada cuánto se recargan los KPIs y las próximas visitas desde la BD, para
// que las nuevas solicitudes de visitantes aparezcan sin recargar la página.
const INTERVALO_REFRESCO_GUARDIA_MS = 30_000;

export default function GuardiaDashboard() {
  const [resumen, setResumen] = useState<ResumenVisitasHoy | null>(null);
  const [proximas, setProximas] = useState<VisitaProxima[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = useCallback(async (silencioso = false) => {
    // silencioso=true (polling/foco): no activa el indicador de carga ni pisa
    // el error, para que el panel no parpadee "Cargando…" cada 30 s.
    if (!silencioso) setLoading(true);
    if (!silencioso) setError(null);
    try {
      // Se ejecutan en paralelo: resumen de tarjetas + próximas visitas
      const [resumenData, proximasData] = await Promise.all([
        guardService.getResumenVisitasHoy(),
        guardService.getProximasVisitas(),
      ]);
      setResumen(resumenData);
      setProximas(Array.isArray(proximasData) ? proximasData : []);
    } catch (err) {
      console.error('Error al cargar el dashboard del guardia:', err);
      if (!silencioso) setError('No se pudieron cargar los datos. Verifica la conexión con el servidor.');
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial del dashboard al montar: cargarDatos activa el indicador
    // de carga (setLoading(true)) al arrancar el fetch y actualiza el resto
    // del estado en continuaciones asíncronas (después del await). El patrón
    // de fetch al montar es intencional; la regla
    // react-hooks/set-state-in-effect lo marca por ser una llamada desde un
    // efecto, por lo que se suprime con justificación.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, [cargarDatos]);

  // Refresco automático: cada 30 s y al volver a enfocar la ventana, para
  // ver las nuevas solicitudes de visitantes y las próximas visitas sin
  // recargar. Los setState ocurren dentro de los callbacks diferidos
  // (interval/focus), no de forma síncrona en el efecto.
  useEffect(() => {
    const timer = setInterval(() => {
      void cargarDatos(true);
    }, INTERVALO_REFRESCO_GUARDIA_MS);
    const onFocus = () => {
      void cargarDatos(true);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [cargarDatos]);

  const badgeClass = (estado: string) =>
    estado === 'Autorizado' ? 'badge-success' : estado === 'Rechazado' ? 'badge-error' : 'badge-warning';

  return (
    <>
      <h2 style={{ marginBottom: 'var(--space-4)' }}>Dashboard</h2>

      {error && (
        <div className="alert" style={{ background: 'rgba(255,82,82,.1)', border: '1px solid var(--error)', color: 'var(--error)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
          <i className="fas fa-exclamation-triangle"></i> {error}
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon"><i className="fas fa-hourglass-half"></i></div>
          <div className="kpi-label">Visitas Pendientes</div>
          <div className="kpi-value" id="pendientesCount">{loading ? '—' : (resumen?.pendientes ?? 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><i className="fas fa-check-circle"></i></div>
          <div className="kpi-label">Autorizadas Hoy</div>
          <div className="kpi-value" id="autorizadasHoyCount">{loading ? '—' : (resumen?.autorizadas_hoy ?? 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><i className="fas fa-times-circle"></i></div>
          <div className="kpi-label">Rechazadas Hoy</div>
          <div className="kpi-value" id="rechazadasHoyCount">{loading ? '—' : (resumen?.rechazadas_hoy ?? 0)}</div>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>Próximas visitas</h3>
            <a href="#visitas" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 500 }}>Ver todas</a>
          </div>
          <div id="ultimasVisitasContainer">
            {loading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-2)' }}>Cargando visitas…</p>
            ) : proximas.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-2)' }}>No hay visitas pendientes</p>
            ) : (
              proximas.slice(0, 6).map((v, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{v.nombre_completo}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: 'var(--space-2)' }}>{v.departamento || ''}</span>
                  </div>
                  <div>
                    <span className={`badge ${badgeClass(v.estado)}`}>{v.estado}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: 'var(--space-2)' }}>{v.hora_estimada || '--:--'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

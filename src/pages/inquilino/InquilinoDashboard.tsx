/**
 * ============================================================================
 * Archivo: InquilinoDashboard.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla principal del panel de Inquilino. Muestra la próxima reserva,
 * la próxima visita y accesos rápidos a las funciones principales.
 *
 * Componentes que utiliza
 * - inquilinoService (obtenerProximaReserva / obtenerProximaVisita)
 * - useLocalDate (formato de fecha/hora)
 *
 * NOTA (cambio): antes se pedían TODAS las reservas/visitantes
 * (obtenerMisReservas/obtenerVisitantes) y se elegía la "próxima" con
 * `.find()` sobre el array, que viene ordenado como lo devuelva
 * sp_ListarMisReservas/sp_ListarMisVisitantes (por id, no por fecha) — por
 * eso mostraba la última creada en vez de la más próxima en el tiempo.
 * Ahora se usan directamente los endpoints /proxima
 * (sp_ObtenerMiProximaReserva / sp_ObtenerMiProximaVisita), que ya filtran
 * por fecha futura y ordenan por fecha/hora en el propio SP.
 * ============================================================================
 */
import { useState, useEffect } from 'react';
import { toDateOnly, toTimeOnly, formatHoraAMPM } from '../../hooks/useLocalDate';
import { inquilinoService, type ProximaReservaRaw, type ProximaVisitaRaw } from '../../services/inquilinoService';
import { useToast } from '../../components/Toast';

export default function InquilinoDashboard() {
  const [proximaReserva, setProximaReserva] = useState<ProximaReservaRaw | null>(null);
  const [proximaVisita, setProximaVisita] = useState<ProximaVisitaRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const cargarDatosDashboard = async () => {
      try {
        setLoading(true);

        // Se piden directamente la próxima reserva y la próxima visita (ya
        // filtradas/ordenadas por fecha en el SP), no las listas completas.
        const [reserva, visita] = await Promise.all([
          inquilinoService.obtenerProximaReserva(),
          inquilinoService.obtenerProximaVisita(),
        ]);

        setProximaReserva(reserva);
        setProximaVisita(visita);
      } catch (error: unknown) {
        const err = error as Error;
        showToast(err.message || 'Error al cargar los datos del dashboard', 'error');
      } finally {
        setLoading(false);
      }
    };

    cargarDatosDashboard();
  }, []);

  const goTo = (page: string) => {
    window.location.hash = page;
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Cargando información del dashboard...</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>Bienvenido nuevamente.</p>
      </div>

      <div className="dashboard-grid-inquilino">
        {/* Tarjeta de Próxima Reserva */}
        <div className="card">
          <div className="card-header">
            <h3>Mi próxima reserva</h3>
          </div>
          <div className="card-body">
            {!proximaReserva ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No tienes reservas activas próximamente.</p>
            ) : (
              <div className="next-event-item">
                <div className="event-icon"><i className="fas fa-calendar-alt"></i></div>
                <div className="event-info">
                  <div className="title">{proximaReserva.area}</div>
                  <div className="subtitle">
                    {toDateOnly(proximaReserva.fecha)} · {formatHoraAMPM(toTimeOnly(proximaReserva.hora_inicio))} - {formatHoraAMPM(toTimeOnly(proximaReserva.hora_fin))}
                  </div>
                </div>
                <button className="btn-sm btn-outline event-action" onClick={() => goTo('mis-reservas')}>Ver reserva</button>
              </div>
            )}
          </div>
        </div>

        {/* Tarjeta de Próxima Visita */}
        <div className="card">
          <div className="card-header">
            <h3>Mi próxima visita</h3>
          </div>
          <div className="card-body">
            {!proximaVisita ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No hay visitas pendientes registradas.</p>
            ) : (
              <div className="next-event-item">
                <div className="event-icon event-icon-visita"><i className="fas fa-user"></i></div>
                <div className="event-info">
                  <div className="title">{proximaVisita.nombre_completo}</div>
                  <div className="subtitle">
                    Hoy · {proximaVisita.hora_esperada ? formatHoraAMPM(toTimeOnly(proximaVisita.hora_esperada)) : '--:--'}
                  </div>
                  <span className={`badge ${proximaVisita.estado === 'Autorizado' ? 'badge-success' : 'badge-warning'}`}>
                    {proximaVisita.estado}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div className="card-header"><h3>Accesos rápidos</h3></div>
        <div className="quick-actions">
          <a className="quick-action-btn" onClick={() => goTo('registrar-visitante')}><i className="fas fa-user-plus"></i> Registrar visitante</a>
          <a className="quick-action-btn" onClick={() => goTo('reservar-area')}><i className="fas fa-plus-circle"></i> Reservar área</a>
          <a className="quick-action-btn" onClick={() => goTo('mis-reservas')}><i className="fas fa-calendar-alt"></i> Mis reservas</a>
          <a className="quick-action-btn" onClick={() => goTo('mis-visitantes')}><i className="fas fa-users"></i> Mis visitantes</a>
        </div>
      </div>
    </>
  );
}
/**
 * ============================================================================
 * Archivo: MisReservasPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla donde el inquilino ve todas sus reservas. Puede ver detalle
 * de cada reserva y cancelarla (con o sin reembolso según la anticipación).
 *
 * Componentes que utiliza
 * - useData (contexto: inquilinoReservasData, recargarReservasInquilino)
 * - inquilinoService (cancelarReserva → PATCH /inquilino/reservas/:id)
 * - useToast (notificaciones)
 * - useAlert (modal de confirmación — mismo componente que usa
 *   MisVisitantesPage.tsx para "Cancelar visita")
 * - useLocalDate (formato de hora)
 *
 * Flujo
 * 1. Inquilino ve lista de sus reservas ordenadas por fecha
 * 2. Puede ver detalle en un modal
 * 3. Puede cancelar: confirma con el modal de useAlert, luego se persiste
 *    en la BD. El mensaje de reembolso (según anticipación) es informativo
 *    en el frontend; sp_CancelarReserva es quien decide el estado real de
 *    pago en la BD.
 *
 * NOTA (cambio): antes cancelarReserva solo hacía setInquilinoReservas(prev =>
 * ...) — mutaba el estado local en memoria y nunca llamaba al backend, y
 * cancelaba sin ninguna confirmación. Ahora:
 * 1. Usa el mismo modal de confirmación (useAlert().confirmar) que ya
 *    tienes en MisVisitantesPage.tsx, en vez de un modal casero.
 * 2. Llama a inquilinoService.cancelarReserva(id) (PATCH
 *    /api/inquilino/reservas/:id, que ejecuta sp_CancelarReserva) y, si el
 *    backend confirma, recarga la lista real con recargarReservasInquilino().
 * 3. El backend devuelve el estado cancelado como 'Cancelado' (no
 *    'Cancelada' como el resto de la UI) — se filtra ambos para que el
 *    botón "Cancelar" desaparezca igual que en las demás filas ya canceladas.
 *
 * NOTA (cambio - filtro de fecha): la tabla ahora solo muestra reservas de
 * hoy en adelante (filter con `hoy`), ordenadas ascendente (la más próxima
 * primero). Las reservas pasadas ya no aparecen en esta vista.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/Toast';
import { useAlert } from '../../components/Alert';
import { formatHoraAMPM, getLocalDateString } from '../../hooks/useLocalDate';
import { formatearMoneda } from '../../utils/formatters';
import { inquilinoService } from '../../services/inquilinoService';
import { pagosService } from '../../services/pagosService';

export default function MisReservasPage() {
  const { inquilinoReservasData, recargarReservasInquilino, addNotification } = useData();
  const { showToast } = useToast();
  const { confirmar } = useAlert();
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);

  // Auto-refresh cada 30s + al volver a enfocar la ventana
  useEffect(() => {
    const timer = setInterval(() => {
      void recargarReservasInquilino();
    }, 30_000);

    const onFocus = () => {
      void recargarReservasInquilino();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [recargarReservasInquilino]);

  // Fecha actual local en "YYYY-MM-DD" (getLocalDateString). Comparar por
  // string evita el bug de zona horaria: `new Date("YYYY-MM-DD")` se interpreta
  // como medianoche UTC, que en zonas al oeste de UTC (ej. Costa Rica, UTC-6)
  // cae en el DÍA ANTERIOR local y descartaba las reservas de HOY.
  // (Mismo patrón que ReservasPage.tsx, pestaña Hoy/Historial.)
  const hoyFechaStr = getLocalDateString();

  const reservasVisibles = [...inquilinoReservasData]
    .filter(r => r.fecha >= hoyFechaStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // ¿El botón "Cancelar" debe mostrarse para esta reserva?
  // - No si ya está cancelada o finalizada (SP auto-finaliza al pasar hora_fin).
  // - No si la fecha ya pasó.
  // - La hora de inicio NO se compara en el frontend: al llegar el inicio, el
  //   backend marca la reserva como 'Finalizada' (auto-finalización lazy en
  //   cada listado) y el botón desaparece. Si el usuario intenta cancelarla
  //   justo en ese momento, el guard de cancelarReserva muestra el error.
  const puedeCancelar = (r: (typeof inquilinoReservasData)[number]) =>
    r.estado !== 'Cancelada' &&
    r.estado !== 'Cancelado' &&
    r.estado !== 'Finalizada' &&
    r.fecha >= hoyFechaStr;

  const verDetalleReserva = (id: number) => {
    const reserva = inquilinoReservasData.find(r => r.id === id);
    if (!reserva) return;
    const modal = document.getElementById('detalleReservaModal');
    const body = document.getElementById('detalleReservaBody');
    const titulo = document.getElementById('detalleReservaTitulo');
    if (!modal || !body || !titulo) return;

    titulo.textContent = 'Detalle de reserva';
    const estadoBadge = reserva.estado === 'Confirmada' ? 'badge-success' : reserva.estado === 'Pendiente' ? 'badge-warning' : reserva.estado === 'Finalizada' ? 'badge-info' : (reserva.estado === 'Cancelada' || reserva.estado === 'Cancelado') ? 'badge-error' : 'badge-info';
    const pagoBadge = reserva.pago_estado === 'Pagado' ? 'badge-success' : reserva.pago_estado === 'Reembolsado' ? 'badge-info' : reserva.pago_estado === 'SinReembolso' ? 'badge-warning' : 'badge-warning';
    body.innerHTML = `
      <div class="detail-row"><span class="detail-label">Área</span><span class="detail-value">${reserva.area}</span></div>
      <div class="detail-row"><span class="detail-label">Fecha</span><span class="detail-value">${reserva.fecha}</span></div>
      <div class="detail-row"><span class="detail-label">Horario</span><span class="detail-value">${formatHoraAMPM(reserva.hora_inicio)} - ${formatHoraAMPM(reserva.hora_fin)}</span></div>
      <div class="detail-row"><span class="detail-label">Personas</span><span class="detail-value">${reserva.personas}</span></div>
      <div class="detail-row"><span class="detail-label">Costo</span><span class="detail-value">${formatearMoneda(reserva.costo)}</span></div>
      <div class="detail-row"><span class="detail-label">Estado</span><span class="detail-value"><span class="badge ${estadoBadge}">${reserva.estado}</span></span></div>
      <div class="detail-row"><span class="detail-label">Pago</span><span class="detail-value"><span class="badge ${pagoBadge}">${reserva.pago_estado}</span></span></div>
    `;
    modal.classList.add('open');
  };

  const closeDetalleReserva = () => {
    document.getElementById('detalleReservaModal')?.classList.remove('open');
  };

  /** Abre el comprobante de pago (PDF, solo lectura) en una pestaña nueva. */
  const verRecibo = async (idReserva: number) => {
    try {
      await pagosService.verReciboReserva(idReserva);
    } catch (error: unknown) {
      const err = error as Error;
      showToast(err.message || 'No se pudo abrir el comprobante.', 'error');
    }
  };

  const cancelarReserva = async (id: number) => {
    const reserva = inquilinoReservasData.find(r => r.id === id);
    if (!reserva) return;
    if (reserva.estado === 'Cancelada' || reserva.estado === 'Cancelado') {
      showToast('Esta reserva ya está cancelada.', 'error');
      return;
    }
    const ahora = new Date();
    const fechaReserva = new Date(reserva.fecha + 'T' + reserva.hora_inicio);
    if (ahora >= fechaReserva) {
      showToast('No se puede cancelar una reserva que está en curso.', 'error');
      return;
    }

    const confirmado = await confirmar(
      `¿Cancelar tu reserva de ${reserva.area} del ${reserva.fecha}?`,
      { titulo: 'Cancelar reserva', confirmarTexto: 'Sí, cancelar' }
    );
    if (!confirmado) return;

    const diffHoras = (fechaReserva.getTime() - ahora.getTime()) / (1000 * 60 * 60);
    const horasAnticipacion = reserva.horas_anticipacion_cancelacion || 1;
    const tieneReembolso = diffHoras >= horasAnticipacion;

    setCancelandoId(id);
    try {
      await inquilinoService.cancelarReserva(id);
      await recargarReservasInquilino();

      const mensaje = tieneReembolso ? 'El monto será reembolsado completamente.' : 'No aplica reembolso por cancelación con poca anticipación.';
      addNotification('inquilino', 'Reserva cancelada', `Cancelaste la reserva de ${reserva.area}. ${mensaje}`, 'fa-calendar-times', reserva.id);
      showToast(`Reserva de ${reserva.area} cancelada. ${mensaje}`, tieneReembolso ? 'success' : 'error');
    } catch (error: unknown) {
      const err = error as Error;
      showToast(err.message || 'No se pudo cancelar la reserva.', 'error');
    } finally {
      setCancelandoId(null);
    }
  };

  return (
    <>
      <div className="page-header"><h2>Mis Reservas</h2></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table-modern" id="misReservasTable">
          <thead>
            <tr><th>Área</th><th>Fecha</th><th>Horario</th><th>Personas</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr>
          </thead>
          <tbody id="misReservasBody">
            {reservasVisibles.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-muted)' }}>No tienes reservas registradas.</td></tr>
            ) : (
              reservasVisibles.map(r => {
                const estadoBadge = r.estado === 'Confirmada' ? 'badge-success' : r.estado === 'Pendiente' ? 'badge-warning' : (r.estado === 'Reservado' || r.estado === 'Finalizada') ? 'badge-info' : 'badge-error';
                const pagoBadge = r.pago_estado === 'Pagado' ? 'badge-success' : r.pago_estado === 'Reembolsado' ? 'badge-info' : r.pago_estado === 'SinReembolso' ? 'badge-warning' : 'badge-warning';
                return (
                  <tr key={r.id}>
                    <td data-label="Área">{r.area}</td>
                    <td data-label="Fecha">{r.fecha}</td>
                    <td data-label="Horario">{formatHoraAMPM(r.hora_inicio)} - {formatHoraAMPM(r.hora_fin)}</td>
                    <td data-label="Personas">{r.personas}</td>
                    <td data-label="Estado"><span className={`badge ${estadoBadge}`}>{r.estado}</span></td>
                    <td data-label="Pago"><span className={`badge ${pagoBadge}`}>{r.pago_estado}</span></td>
                    <td data-label="Acciones">
                      <div className="action-cell">
                        <button className="btn-sm btn-info" onClick={() => verDetalleReserva(r.id)}><i className="fas fa-eye"></i> Ver</button>
                        {r.pago_estado === 'Pagado' && (
                          <button className="btn-sm btn-outline" onClick={() => void verRecibo(r.id)}>
                            <i className="fas fa-file-invoice"></i> Recibo
                          </button>
                        )}
                        {puedeCancelar(r) && (
                          <button className="btn-sm btn-danger-sm" onClick={() => cancelarReserva(r.id)} disabled={cancelandoId === r.id}>
                            <i className="fas fa-times"></i> {cancelandoId === r.id ? 'Cancelando...' : 'Cancelar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      <div className="modal-overlay" id="detalleReservaModal" onClick={closeDetalleReserva}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3 id="detalleReservaTitulo">Detalle de reserva</h3>
          <div id="detalleReservaBody"></div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={closeDetalleReserva}>Cerrar</button>
          </div>
        </div>
      </div>
    </>
  );
}
/**
 * ============================================================================
 * Archivo: MisVisitantesPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla donde el inquilino ve todos sus visitantes registrados. Puede
 * ver detalle de cada visitante y cancelar visitas pendientes.
 *
 * Componentes que utiliza
 * - useData (contexto: inquilinoVisitantesData, recargarVisitantesInquilino)
 * - inquilinoService (cancelarVisitante → PATCH /inquilino/visitantes/:id)
 * - useToast (notificaciones)
 * - useAlert (modal de confirmación "Cancelar visita")
 * - useLocalDate (formato de hora)
 *
 * NOTA (cambio): igual que pasó en MisReservasPage.tsx, cancelarVisitante
 * solo hacía setInquilinoVisitantes(prev => ...) — mutaba el estado local
 * en memoria y nunca llamaba al backend, así que "cancelaba" visualmente
 * pero no se persistía en la BD (al recargar la página volvía a aparecer
 * pendiente). Ahora llama a inquilinoService.cancelarVisitante(id) (PATCH
 * /api/inquilino/visitantes/:id, que ejecuta sp_CancelarVisitante) y, si el
 * backend confirma, recarga la lista real con recargarVisitantesInquilino().
 * El modal de confirmación (useAlert().confirmar) se mantiene igual.
 *
 * También se agregó 'Cancelado' además de 'Cancelada' al chequear el badge
 * de estado: el backend guarda el estado cancelado en masculino ('Cancelado')
 * mientras el resto de la UI usa 'Cancelada' — por consistencia se contempla
 * el mismo caso aquí para que el badge no caiga en el 'badge-error' genérico
 * si sp_CancelarVisitante hace lo mismo.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/Toast';
import { useAlert } from '../../components/Alert';
import { formatHoraAMPM } from '../../hooks/useLocalDate';
import { inquilinoService } from '../../services/inquilinoService';

/** Cada cuánto se refresca la lista (mismo intervalo que el resto de módulos). */
const INTERVALO_REFRESCO_MS = 30_000;

export default function MisVisitantesPage() {
  const { inquilinoVisitantesData, recargarVisitantesInquilino, addNotification } = useData();
  const { showToast } = useToast();
  const { confirmar } = useAlert();
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);

  // Refresco automático: cada 30 s y al volver a enfocar la ventana, en modo
  // silencioso (recargarVisitantesInquilino no activa indicadores de carga),
  // para que las decisiones del guardia (Autorizado/Rechazado) y las nuevas
  // solicitudes aparezcan sin recargar la página.
  useEffect(() => {
    const timer = setInterval(() => {
      void recargarVisitantesInquilino();
    }, INTERVALO_REFRESCO_MS);

    const onFocus = () => {
      void recargarVisitantesInquilino();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [recargarVisitantesInquilino]);

  const verDetalleVisitante = (id: number) => {
    const visitante = inquilinoVisitantesData.find(v => v.id === id);
    if (!visitante) return;
    const modal = document.getElementById('detalleVisitanteModal');
    const body = document.getElementById('detalleVisitanteBody');
    const titulo = document.getElementById('detalleVisitanteTitulo');
    if (!modal || !body || !titulo) return;

    titulo.textContent = `Detalle de ${visitante.nombre}`;
    const estadoBadge = visitante.estado === 'Pendiente' ? 'badge-warning' : visitante.estado === 'Autorizado' ? 'badge-success' : 'badge-error';

    let estadoLine = '';
    if (visitante.estado === 'Autorizado') {
      estadoLine = `<div style="margin-top:var(--space-3);padding-top:var(--space-2);border-top:1px solid var(--border-color);color:var(--text-muted);font-size:0.8rem;">✅ Autorizado el ${new Date().toLocaleDateString('es-ES')}</div>`;
    } else if (visitante.estado === 'Pendiente') {
      estadoLine = `<div style="margin-top:var(--space-3);padding-top:var(--space-2);border-top:1px solid var(--border-color);color:var(--warning);font-size:0.8rem;">⏳ Pendiente de autorización por el guardia.</div>`;
    } else if (visitante.estado === 'Rechazado') {
      estadoLine = `<div style="margin-top:var(--space-3);padding-top:var(--space-2);border-top:1px solid var(--border-color);color:var(--error);font-size:0.8rem;">❌ Visita rechazada.</div>`;
    } else if (visitante.estado === 'Cancelada' || visitante.estado === 'Cancelado') {
      estadoLine = `<div style="margin-top:var(--space-3);padding-top:var(--space-2);border-top:1px solid var(--border-color);color:var(--text-muted);font-size:0.8rem;">🚫 Visita cancelada por el residente.</div>`;
    }

    body.innerHTML = `
      <div class="detail-row"><span class="detail-label">Nombre</span><span class="detail-value">${visitante.nombre}</span></div>
      <div class="detail-row"><span class="detail-label">Cédula</span><span class="detail-value">${visitante.documento}</span></div>
      <div class="detail-row"><span class="detail-label">Placa</span><span class="detail-value">${visitante.placa || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Hora esperada</span><span class="detail-value">${visitante.hora_esperada && visitante.hora_esperada !== '--:--' ? formatHoraAMPM(visitante.hora_esperada) : '--:--'}</span></div>
      <div class="detail-row"><span class="detail-label">Estado</span><span class="detail-value"><span class="badge ${estadoBadge}">${visitante.estado}</span></span></div>
      ${visitante.estado === 'Rechazado' ? `<div class="detail-row"><span class="detail-label">Motivo de rechazo</span><span class="detail-value">${visitante.motivo_rechazo || '—'}</span></div>` : ''}
      ${estadoLine}
    `;
    modal.classList.add('open');
  };

  const closeDetalleVisitante = () => {
    document.getElementById('detalleVisitanteModal')?.classList.remove('open');
  };

  const cancelarVisitante = async (id: number) => {
    const visitante = inquilinoVisitantesData.find(v => v.id === id);
    if (!visitante) return;
    if (visitante.estado !== 'Pendiente') {
      showToast('Este visitante ya no está pendiente.', 'error');
      return;
    }
    const confirmado = await confirmar(
      `¿Cancelar la visita de ${visitante.nombre}?`,
      { titulo: 'Cancelar visita', confirmarTexto: 'Sí, cancelar' }
    );
    if (!confirmado) return;

    setCancelandoId(id);
    try {
      await inquilinoService.cancelarVisitante(id);
      await recargarVisitantesInquilino();

      showToast('Visita cancelada correctamente.', 'success');
      addNotification('inquilino', 'Visita cancelada', `Cancelaste la visita de ${visitante.nombre}.`, 'fa-ban', visitante.id);
    } catch (error: unknown) {
      const err = error as Error;
      showToast(err.message || 'No se pudo cancelar la visita.', 'error');
    } finally {
      setCancelandoId(null);
    }
  };

  return (
    <>
      <div className="page-header"><h2>Mis Visitantes</h2></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table-modern" id="misVisitantesTable">
          <thead>
            <tr><th>Visitante</th><th>Cédula</th><th>Hora esperada</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody id="misVisitantesBody">
            {inquilinoVisitantesData.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-muted)' }}>No tienes visitantes registrados.</td></tr>
            ) : (
              inquilinoVisitantesData.map(v => {
                const estadoBadge = v.estado === 'Pendiente' ? 'badge-warning' : v.estado === 'Autorizado' ? 'badge-success' : (v.estado === 'Cancelada' || v.estado === 'Cancelado') ? 'badge' : 'badge-error';
                return (
                  <tr key={v.id}>
                    <td data-label="Visitante">{v.nombre}</td>
                    <td data-label="Cédula">{v.documento}</td>
                    <td data-label="Hora esperada">{v.hora_esperada && v.hora_esperada !== '--:--' ? formatHoraAMPM(v.hora_esperada) : '--:--'}</td>
                    <td data-label="Estado"><span className={`badge ${estadoBadge}`}>{v.estado}</span></td>
                    <td data-label="Acciones">
                      <div className="action-cell">
                        <button className="btn-sm btn-info" onClick={() => verDetalleVisitante(v.id)}><i className="fas fa-eye"></i> Ver</button>
                        {v.estado === 'Pendiente' && (
                          <button className="btn-sm btn-danger-sm" onClick={() => cancelarVisitante(v.id)} disabled={cancelandoId === v.id}>
                            <i className="fas fa-times"></i> {cancelandoId === v.id ? 'Cancelando...' : 'Cancelar'}
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
      <div className="modal-overlay" id="detalleVisitanteModal" onClick={closeDetalleVisitante}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3 id="detalleVisitanteTitulo">Detalle del visitante</h3>
          <div id="detalleVisitanteBody"></div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={closeDetalleVisitante}>Cerrar</button>
          </div>
        </div>
      </div>
    </>
  );
}
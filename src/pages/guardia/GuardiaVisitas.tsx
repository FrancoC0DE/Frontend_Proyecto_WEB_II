/**
 * ============================================================================
 * Archivo: GuardiaVisitas.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla principal del Guardia para el control de visitas. Permite ver
 * las visitas esperadas, autorizarlas o rechazarlas con un motivo, y
 * consultar el historial del día.
 *
 * Todo se carga desde la API del backend (guardService → /api/guard/visits/*):
 *   - "Visitas esperadas"   → GET /visits/pending (búsqueda en servidor)
 *   - "Historial del día"   → GET /visits/history (búsqueda + estado)
 *   - Autorizar / Rechazar  → PATCH /visits/:id/status
 *   - Detalle (modal)       → GET /visits/:id
 *
 * Estructura (cambio): cada pestaña vive en su PROPIO contenedor
 * `.tab-content` (CSS display:none / .active display:block). Así las dos
 * tablas son independientes y nunca se mezclan al cambiar de pestaña.
 *
 * ============================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/Toast';
import { useAlert } from '../../components/Alert';
import { ApiError } from '../../services/apiClient';
import { guardService, type VisitaEsperada, type VisitaHistorial, type DetalleVisita } from '../../services/guardService';

// Cada cuánto se recarga la tabla activa desde la BD, para que las nuevas
// solicitudes de visitantes aparezcan sin recargar la página.
const INTERVALO_REFRESCO_VISITAS_MS = 30_000;

type Tab = 'esperadas' | 'historial';

export default function GuardiaVisitas() {
  const { addNotification } = useData();
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const [currentTab, setCurrentTab] = useState<Tab>('esperadas');
  const [search, setSearch] = useState('');
  // Debounce: evita disparar una petición al backend por cada tecla
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');

  // Datos desde el backend (un estado por pestaña, con su propio loading)
  const [esperadas, setEsperadas] = useState<VisitaEsperada[]>([]);
  const [historial, setHistorial] = useState<VisitaHistorial[]>([]);
  const [loadingEsperadas, setLoadingEsperadas] = useState(false);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal de rechazo
  const [rechazoId, setRechazoId] = useState<number | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  // Modal de detalle: el id se guarda aparte; si no hay id (historial sin
  // id_visitante) el modal se abre igualmente con los datos de la fila.
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [detalleVisita, setDetalleVisita] = useState<DetalleVisita | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Id en proceso (deshabilita botones mientras se autoriza/rechaza)
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  // Token de petición del detalle: invalida respuestas obsoletas si el usuario
  // cierra el modal o abre otro detalle mientras una petición está en vuelo.
  const detalleRequestRef = useRef(0);

  const cargarEsperadas = useCallback(async (query?: string, silencioso = false) => {
    // silencioso=true (polling/foco): no activa el indicador de carga ni pisa
    // el error, para que la tabla no parpadee "Cargando…" cada 30 s.
    if (!silencioso) setLoadingEsperadas(true);
    if (!silencioso) setError(null);
    try {
      const data = await guardService.getVisitasEsperadas(query);
      setEsperadas(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar visitas esperadas:', err);
      if (!silencioso) setError('No se pudieron cargar las visitas esperadas.');
    } finally {
      if (!silencioso) setLoadingEsperadas(false);
    }
  }, []);

  const cargarHistorial = useCallback(async (query?: string, estado?: string, silencioso = false) => {
    if (!silencioso) setLoadingHistorial(true);
    if (!silencioso) setError(null);
    try {
      const data = await guardService.getHistorialVisitas(query, estado);
      setHistorial(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar el historial:', err);
      if (!silencioso) setError('No se pudieron cargar las visitas del historial.');
    } finally {
      if (!silencioso) setLoadingHistorial(false);
    }
  }, []);

  // Debounce de la búsqueda (350 ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Carga inicial de la pestaña activa + cada vez que cambian los filtros
  useEffect(() => {
    // Los cargar* activan su indicador de carga (setLoadingX(true)) al
    // arrancar el fetch y actualizan el resto del estado en continuaciones
    // asíncronas (después del await). El patrón de carga al montar/cambiar
    // filtros es intencional; la regla react-hooks/set-state-in-effect lo
    // marca por ser una llamada desde un efecto, por lo que se suprime con
    // justificación.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (currentTab === 'esperadas') {
      cargarEsperadas(debouncedSearch);
    } else {
      cargarHistorial(debouncedSearch, filterEstado);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [currentTab, debouncedSearch, filterEstado, cargarEsperadas, cargarHistorial]);

  // Refresco automático de la pestaña activa: cada 30 s y al volver a enfocar
  // la ventana, para ver las nuevas solicitudes de visitantes sin recargar.
  // Los setState ocurren dentro de los callbacks diferidos (interval/focus),
  // no de forma síncrona en el efecto.
  useEffect(() => {
    const refrescar = () => {
      if (currentTab === 'esperadas') {
        void cargarEsperadas(debouncedSearch, true);
      } else {
        void cargarHistorial(debouncedSearch, filterEstado, true);
      }
    };
    const timer = setInterval(refrescar, INTERVALO_REFRESCO_VISITAS_MS);
    const onFocus = () => refrescar();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentTab, debouncedSearch, filterEstado, cargarEsperadas, cargarHistorial]);

  // Refresca solo la lista de la pestaña activa tras autorizar/rechazar
  const refrescarListaActual = async () => {
    if (currentTab === 'esperadas') {
      await cargarEsperadas(debouncedSearch);
    } else {
      await cargarHistorial(debouncedSearch, filterEstado);
    }
  };

  const autorizarVisita = async (id: number) => {
    setProcesandoId(id);
    try {
      const res = await guardService.registrarIngreso(id, true);
      const visita = esperadas.find(v => v.id_visitante === id);
      addNotification('guardia', 'Visita autorizada', `Se autorizó la visita de ${visita?.nombre_completo ?? 'visitante'}`, 'fa-check-circle', id);
      showToast(res.message ?? `Visita de ${visita?.nombre_completo} autorizada correctamente.`, 'success');
      await refrescarListaActual();
    } catch (err) {
      console.error('Error al autorizar visita:', err);
      // Muestra el mensaje real del backend (ej. RAISERROR "El visitante no existe o ya fue procesado")
      showToast(err instanceof ApiError ? err.message : 'No se pudo autorizar la visita.', 'error');
    } finally {
      setProcesandoId(null);
    }
  };

  const rechazarVisita = async (id: number, motivo: string) => {
    setProcesandoId(id);
    try {
      const res = await guardService.registrarIngreso(id, false, motivo);
      const visita = esperadas.find(v => v.id_visitante === id);
      addNotification('guardia', 'Visita rechazada', `Se rechazó la visita de ${visita?.nombre_completo ?? 'visitante'}`, 'fa-times-circle', id);
      showToast(res.message ?? `Visita de ${visita?.nombre_completo} rechazada.`, 'error');
      setRechazoId(null);
      setMotivoRechazo('');
      await refrescarListaActual();
    } catch (err) {
      console.error('Error al rechazar visita:', err);
      showToast(err instanceof ApiError ? err.message : 'No se pudo rechazar la visita.', 'error');
    } finally {
      setProcesandoId(null);
    }
  };

  /**
   * Abre el modal de detalle. Si hay id, intenta la API; si no hay id o la API
   * falla, usa los datos de la fila local (fallback) para mostrar el modal.
   */
  const verDetalle = async (id?: number, fallback?: DetalleVisita) => {
    const requestId = ++detalleRequestRef.current;
    setDetalleId(id ?? null);
    setDetalleVisita(null);
    setLoadingDetalle(true);

    if (id !== undefined) {
      try {
        const detalle = await guardService.getDetalleVisita(id);
        // Respuesta obsoleta (el modal se cerró o cambió de visita): se ignora
        if (detalleRequestRef.current !== requestId) return;
        setDetalleVisita(detalle);
        setLoadingDetalle(false);
        return;
      } catch (err) {
        if (detalleRequestRef.current !== requestId) return;
        console.error('Error al obtener detalle de visita:', err);
      }
    }

    if (detalleRequestRef.current !== requestId) return;

    // Fallback: usa los datos de la fila local (esperadas o historial)
    if (fallback) {
      setDetalleVisita(fallback);
    } else {
      const local = esperadas.find(v => v.id_visitante === id);
      if (local) {
        setDetalleVisita({
          id_visitante: local.id_visitante,
          nombre_completo: local.nombre_completo,
          documento_identidad: local.documento_identidad,
          placa: local.placa,
          hora_esperada: local.hora_esperada,
          estado: local.estado,
          departamento: local.departamento,
          hora_decision: null,
          motivo_rechazo: null,
          inquilino_que_registro: null,
          guarda_que_decidio: null,
        });
      } else {
        setDetalleId(null);
        showToast('No se pudo cargar el detalle de la visita.', 'error');
      }
    }
    setLoadingDetalle(false);
  };

  const verDetalleHistorial = (v: VisitaHistorial) => {
    // Si el SP del historial devuelve id_visitante, se usa la API de detalle
    // (sp_ObtenerDetalleVisitante) con todos los campos. Si no lo devuelve,
    // el fallback usa lo que el SP sí traiga (incluye motivo e inquilino si
    // se agregaron al SELECT del SP).
    verDetalle(v.id_visitante, {
      id_visitante: v.id_visitante,
      nombre_completo: v.nombre_completo,
      documento_identidad: v.documento_identidad,
      placa: v.placa,
      hora_esperada: v.hora_esperada,
      estado: v.estado,
      hora_decision: v.hora_decision,
      departamento: v.departamento,
      guarda_que_decidio: v.guarda_que_decidio,
      motivo_rechazo: v.motivo_rechazo ?? null,
      inquilino_que_registro: v.inquilino_que_registro ?? null,
    });
  };

  const cerrarDetalle = () => {
    // Invalida cualquier petición de detalle en vuelo para que no reabra el modal
    detalleRequestRef.current++;
    setDetalleVisita(null);
    setDetalleId(null);
  };

  const limpiarFiltros = () => {
    setSearch('');
    setFilterEstado('all');
  };

  const badgeClass = (estado: string) =>
    estado === 'Autorizado' ? 'badge-success' : estado === 'Rechazado' ? 'badge-error' : 'badge-warning';

  const esperadasTable = (
    <div style={{ overflowX: 'auto' }}>
      <table className="table-modern">
        <thead>
          <tr>
            <th>Visitante</th><th>Cédula</th><th>Placa</th><th>Hora Esperada</th><th>Estado</th><th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {loadingEsperadas ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-muted)' }}>Cargando visitas…</td></tr>
          ) : esperadas.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-muted)' }}>No se encontraron visitas esperadas</td></tr>
          ) : (
            esperadas.map(v => (
              <tr key={v.id_visitante}>
                <td data-label="Visitante" className="nombre-visitante">{v.nombre_completo}</td>
                <td data-label="Cédula">{v.documento_identidad || '—'}</td>
                <td data-label="Placa">{v.placa || '—'}</td>
                <td data-label="Hora Esperada">{v.hora_esperada || '--:--'}</td>
                <td data-label="Estado">
                  <span className={`badge ${badgeClass(v.estado)}`}>{v.estado}</span>
                </td>
                <td data-label="Acción">
                  <div className="action-cell">
                    <button
                      className="btn-sm btn-success"
                      onClick={() => autorizarVisita(v.id_visitante)}
                      disabled={procesandoId === v.id_visitante}
                    >
                      <i className="fas fa-check"></i> Autorizar
                    </button>
                    <button
                      className="btn-sm btn-danger-sm"
                      onClick={() => setRechazoId(v.id_visitante)}
                      disabled={procesandoId === v.id_visitante}
                    >
                      <i className="fas fa-times"></i> Rechazar
                    </button>
                    <button className="btn-sm btn-info" onClick={() => verDetalle(v.id_visitante)}>
                      <i className="fas fa-eye"></i> Ver
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const historialTable = (
    <div style={{ overflowX: 'auto' }}>
      <table className="table-modern">
        <thead>
          <tr>
            <th>Visitante</th><th>Cédula</th><th>Placa</th><th>Hora Esperada</th><th>Estado</th><th>Hora decisión</th><th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {loadingHistorial ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-muted)' }}>Cargando visitas…</td></tr>
          ) : historial.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-muted)' }}>No se encontraron visitas procesadas hoy</td></tr>
          ) : (
            historial.map((v, idx) => (
              <tr key={v.id_visitante ?? idx}>
                <td data-label="Visitante" className="nombre-visitante">{v.nombre_completo}</td>
                <td data-label="Cédula">{v.documento_identidad || '—'}</td>
                <td data-label="Placa">{v.placa || '—'}</td>
                <td data-label="Hora Esperada">{v.hora_esperada || '--:--'}</td>
                <td data-label="Estado">
                  <span className={`badge ${badgeClass(v.estado)}`}>{v.estado}</span>
                </td>
                <td data-label="Hora decisión">{v.hora_decision || '--:--'}</td>
                <td data-label="Acción">
                  <div className="action-cell">
                    {/* Siempre disponible: si hay id usa la API, si no, muestra los datos de la fila */}
                    <button className="btn-sm btn-info" onClick={() => verDetalleHistorial(v)}>
                      <i className="fas fa-eye"></i> Ver
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <h2 style={{ fontWeight: 600, fontSize: '1.4rem' }}>Control de Visitas</h2>
      </div>

      <div className="visitas-header">
        <h3>{currentTab === 'esperadas' ? 'Visitas Esperadas' : 'Historial del día'}</h3>
        <div className="fecha-actual" id="fechaActual">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div className="tabs-container" id="visitasTabs">
        <button className={`tab-btn ${currentTab === 'esperadas' ? 'active' : ''}`} data-tab="esperadas" onClick={() => setCurrentTab('esperadas')}>
          Visitas esperadas
          <span className="tab-indicator"></span>
        </button>
        <button className={`tab-btn ${currentTab === 'historial' ? 'active' : ''}`} data-tab="historial" onClick={() => setCurrentTab('historial')}>
          Historial del día
          <span className="tab-indicator"></span>
        </button>
      </div>

      <div className="filters-bar">
        <div className="filter-group" style={{ flex: 1 }}>
          <label htmlFor="searchInput">Buscar</label>
          <input
            type="text"
            id="searchInput"
            placeholder="Buscar por nombre o documento"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group" id="filterEstadoGroup" style={{ display: currentTab === 'historial' ? 'flex' : 'none' }}>
          <label htmlFor="filterEstado">Estado</label>
          <select id="filterEstado" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
            <option value="all">Todos</option>
            {currentTab === 'historial' && (
              <>
                <option value="Autorizado">Autorizado</option>
                <option value="Rechazado">Rechazado</option>
              </>
            )}
          </select>
        </div>
        <button className="btn-secondary" onClick={limpiarFiltros} style={{ padding: 'var(--space-1) var(--space-3)' }}>Limpiar</button>
      </div>

      {error && (
        <div className="alert" style={{ background: 'rgba(255,82,82,.1)', border: '1px solid var(--error)', color: 'var(--error)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
          <i className="fas fa-exclamation-triangle"></i> {error}
        </div>
      )}

      {/* Pestaña: Visitas Esperadas (contenedor independiente) */}
      <div className={`tab-content ${currentTab === 'esperadas' ? 'active' : ''}`} id="tabVisitasEsperadas">
        {esperadasTable}
      </div>

      {/* Pestaña: Historial del día (contenedor independiente) */}
      <div className={`tab-content ${currentTab === 'historial' ? 'active' : ''}`} id="tabVisitasHistorial">
        {historialTable}
      </div>

      {/* Modal Rechazo */}
      <div className={`modal-overlay ${rechazoId !== null ? 'open' : ''}`} id="motivoRechazoOverlay" onClick={() => setRechazoId(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3>Motivo de rechazo</h3>
          <p>Indica el motivo por el cual se rechaza esta visita.</p>
          <div className="form-group" style={{ marginBottom: 'var(--space-2)' }}>
            <label htmlFor="motivoRechazoInput">Motivo</label>
            <textarea id="motivoRechazoInput" rows={4} placeholder="Ej: El visitante no presentó identificación válida" value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)}></textarea>
          </div>
          <div className="actions">
            <button className="btn-secondary" onClick={() => setRechazoId(null)}>Cancelar</button>
            <button
              className="btn-danger btn-reject"
              id="confirmarRechazoBtn"
              disabled={procesandoId === rechazoId}
              onClick={() => {
                if (motivoRechazo.trim()) {
                  rechazarVisita(rechazoId!, motivoRechazo);
                } else {
                  showAlert('Por favor ingresa un motivo de rechazo.', { titulo: 'Motivo requerido', tipo: 'warning' });
                }
              }}
            >
              {procesandoId === rechazoId ? 'Procesando…' : 'Rechazar visita'}
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <div className={`modal-overlay ${detalleId !== null || detalleVisita !== null ? 'open' : ''}`} id="detailModalOverlay" onClick={cerrarDetalle}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3 id="detailModalTitle">Detalle del visitante</h3>
          <div id="detailModalBody">
            {loadingDetalle ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-3)' }}>Cargando detalle…</p>
            ) : detalleVisita ? (
              <>
                <div className="detail-row"><span className="detail-label">Visitante</span><span className="detail-value">{detalleVisita.nombre_completo}</span></div>
                <div className="detail-row"><span className="detail-label">Cédula</span><span className="detail-value">{detalleVisita.documento_identidad || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Placa</span><span className="detail-value">{detalleVisita.placa || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Departamento</span><span className="detail-value">{detalleVisita.departamento || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Hora esperada</span><span className="detail-value">{detalleVisita.hora_esperada || '--:--'}</span></div>
                <div className="detail-row"><span className="detail-label">Inquilino que registró</span><span className="detail-value">{detalleVisita.inquilino_que_registro || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Guarda que decidió</span><span className="detail-value">{detalleVisita.guarda_que_decidio || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Hora de decisión</span><span className="detail-value">{detalleVisita.hora_decision || '—'}</span></div>
                <div className="detail-row">
                  <span className="detail-label">Estado</span>
                  <span className="detail-value">
                    <span className={`badge ${badgeClass(detalleVisita.estado)}`}>{detalleVisita.estado}</span>
                  </span>
                </div>
                {detalleVisita.estado === 'Rechazado' && (
                  <div className="detail-row">
                    <span className="detail-label">Motivo de rechazo</span>
                    <span className="detail-value" style={{ color: 'var(--error)' }}>{detalleVisita.motivo_rechazo || '—'}</span>
                  </div>
                )}
              </>
            ) : null}
          </div>
          <div className="modal-actions" id="detailModalActions">
            {detalleVisita && detalleVisita.estado === 'Pendiente' && detalleId !== null && (
              <>
                <button className="btn-sm btn-success" onClick={() => { const id = detalleId; cerrarDetalle(); autorizarVisita(id); }}>
                  <i className="fas fa-check"></i> Autorizar
                </button>
                <button className="btn-sm btn-danger-sm" onClick={() => { const id = detalleId; cerrarDetalle(); setRechazoId(id); }}>
                  <i className="fas fa-times"></i> Rechazar
                </button>
              </>
            )}
            <button className="btn-secondary" onClick={cerrarDetalle}>Cerrar</button>
          </div>
        </div>
      </div>
    </>
  );
}

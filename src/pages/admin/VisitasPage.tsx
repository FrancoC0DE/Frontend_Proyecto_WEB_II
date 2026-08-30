/**
 * ============================================================================
 * Archivo: VisitasPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Módulo de control de visitas del panel de Administrador, conectado a la API
 * real (visitasService → GET /api/visitas/*). Presenta dos pestañas:
 *
 *   - "Hoy"       → sp_ListarVisitasDelDia (SP dedicado): TODAS las visitas
 *                   del día actual en cualquier estado
 *                   (Pendiente | Autorizado | Rechazado). Filtros: búsqueda
 *                   (nombre/cédula/placa) y estado. Sin paginación.
 *   - "Historial" → sp_ListarHistorialVisitantes (historial paginado; el SP
 *                   no muestra HOY ni visitas futuras, solo días pasados).
 *                   Filtros: búsqueda, estado
 *                   (Pendiente/Autorizado/Rechazado) y rango de fechas
 *                   (el selector no permite elegir hoy ni fechas futuras).
 *
 * "Ver detalle" → sp_ObtenerDetalleVisitante y se muestra en un Drawer.
 *
 * Componentes que utiliza
 * - PageHeader (título)
 * - Drawer (detalle de la visita)
 * - visitasService (consumo de la API)
 *
 * Patrones
 * - Misma estructura de filtros/paginación que BitacoraPage (debounce de
 *   búsqueda, contador de peticiones para evitar respuestas cruzadas, y
 *   clases .bitacora-pagination* reutilizadas para los controles).
 *
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import { visitasService } from '../../services/visitasService';
import type { VisitaDelDia, VisitaDetalle, VisitaHistorialRow } from '../../services/visitasService';
import { getLocalDateString } from '../../hooks/useLocalDate';

// ------------------------------------------------------------
// Constantes del módulo
// ------------------------------------------------------------

/** Opciones del filtro de estado (iguales en ambas pestañas). */
const ESTADOS_VISITAS = ['Pendiente', 'Autorizado', 'Rechazado'];

/** Cada cuánto se refresca la pestaña "Hoy" (mismo intervalo que el resto). */
const INTERVALO_REFRESCO_MS = 30_000;

/** Clase CSS del badge por estado (mismas clases que el resto de módulos). */
const claseBadge = (estado: string): string => {
  if (estado === 'Autorizado') return 'badge-success';
  if (estado === 'Rechazado') return 'badge-error';
  return 'badge-warning';
};

/**
 * Formatea un DATETIME2 devuelto por SQL Server a "dd/mm/aaaa hh:mm" local.
 *
 * ¿Por qué se reconstruye manualmente?
 * El driver mssql serializa la columna como ISO con sufijo 'Z'; si se hiciera
 * `new Date(valor)`, el navegador desplazaría la hora a su zona horaria y
 * mostraría 6 horas menos (misma razón documentada en BitacoraPage).
 */
function formatFechaHora(valor: string | null): string {
  if (!valor) return '—';
  const partes = valor.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (partes) {
    const [, anio, mes, dia, hora, minuto] = partes;
    return `${dia}/${mes}/${anio} ${hora}:${minuto}`;
  }
  return valor;
}

/** Texto legible para "—" cuando el valor es NULL. */
const oGuion = (valor: string | null | undefined): string => valor?.trim() ? valor : '—';

// ------------------------------------------------------------
// Página principal
// ------------------------------------------------------------

export default function VisitasPage() {
  // --- Pestaña activa ---
  const [activeTab, setActiveTab] = useState<'hoy' | 'historial'>('hoy');

  // El Historial solo cubre días ANTERIORES a hoy: el selector de fechas no
  // permite elegir hoy ni fechas futuras (el backend también lo acota).
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = getLocalDateString(ayer);

  // Contadores de refresco: al volver a entrar a una pestaña se recarga su
  // contenido (evita que los datos del "Hoy" queden desactualizados).
  const [refreshHoy, setRefreshHoy] = useState(0);
  const [refreshHistorial, setRefreshHistorial] = useState(0);

  // --- Pestaña "Hoy" ---
  const [visitasHoy, setVisitasHoy] = useState<VisitaDelDia[]>([]);
  const [busquedaHoyInput, setBusquedaHoyInput] = useState('');
  const [busquedaHoy, setBusquedaHoy] = useState('');
  const [estadoHoy, setEstadoHoy] = useState('');
  const [cargandoHoy, setCargandoHoy] = useState(true);
  const [errorHoy, setErrorHoy] = useState('');

  // --- Pestaña "Historial" ---
  const [historial, setHistorial] = useState<VisitaHistorialRow[]>([]);
  const [busquedaHistInput, setBusquedaHistInput] = useState('');
  const [busquedaHist, setBusquedaHist] = useState('');
  const [estadoHist, setEstadoHist] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(50);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [errorHistorial, setErrorHistorial] = useState('');

  // --- Detalle (Drawer) ---
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detalle, setDetalle] = useState<VisitaDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');

  // Contador de peticiones: evita que una respuesta vieja (filtros anteriores)
  // pise a una más reciente cuando se disparan varias cargas seguidas.
  const peticionHoyRef = useRef(0);
  const peticionHistRef = useRef(0);
  const peticionDetalleRef = useRef(0);

  // ------------------------------------------------------------
  // Cambio de pestaña: recarga el contenido de la pestaña activa
  // ------------------------------------------------------------
  const cambiarTab = (tab: 'hoy' | 'historial') => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (tab === 'hoy') {
      setCargandoHoy(true);
      setRefreshHoy(r => r + 1);
    } else {
      setCargandoHistorial(true);
      setRefreshHistorial(r => r + 1);
    }
  };

  // ------------------------------------------------------------
  // Carga de la pestaña "Hoy"
  // ------------------------------------------------------------
  const cargarHoy = useCallback(() => {
    const idPeticion = ++peticionHoyRef.current;

    visitasService
      .getVisitasHoy(busquedaHoy, estadoHoy)
      .then(data => {
        if (idPeticion !== peticionHoyRef.current) return;
        setVisitasHoy(data);
        setErrorHoy('');
        setCargandoHoy(false);
      })
      .catch((err: Error) => {
        if (idPeticion !== peticionHoyRef.current) return;
        setErrorHoy(err.message || 'No se pudieron cargar las visitas del día.');
        setVisitasHoy([]);
        setCargandoHoy(false);
      });
  }, [busquedaHoy, estadoHoy]);

  useEffect(() => {
    if (activeTab !== 'hoy') return;
    cargarHoy();
  }, [activeTab, refreshHoy, cargarHoy]);

  // Refresco automático de la pestaña "Hoy": cada 30 s y al volver a enfocar
  // la ventana, en modo silencioso (cargarHoy no activa el indicador de carga),
  // para que las decisiones del guardia aparezcan sin recargar. Respeta la
  // búsqueda y el filtro de estado vigentes.
  useEffect(() => {
    if (activeTab !== 'hoy') return;
    const timer = setInterval(() => {
      cargarHoy();
    }, INTERVALO_REFRESCO_MS);
    const onFocus = () => cargarHoy();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [activeTab, cargarHoy]);

  // Debounce de la búsqueda de la pestaña "Hoy"
  useEffect(() => {
    const timer = setTimeout(() => {
      const valor = busquedaHoyInput.trim();
      if (valor !== busquedaHoy) {
        setCargandoHoy(true);
        setBusquedaHoy(valor);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [busquedaHoyInput, busquedaHoy]);

  // ------------------------------------------------------------
  // Carga de la pestaña "Historial" (paginada)
  // ------------------------------------------------------------
  const cargarHistorial = useCallback(() => {
    const idPeticion = ++peticionHistRef.current;

    visitasService
      .getHistorial({
        busqueda: busquedaHist,
        estado: estadoHist,
        fechaInicio: fechaDesde,
        fechaFin: fechaHasta,
        pagina,
        limite,
      })
      .then(resp => {
        if (idPeticion !== peticionHistRef.current) return;
        setHistorial(resp.datos);
        setTotalRegistros(resp.totalRegistros);
        setTotalPaginas(Math.max(1, resp.totalPaginas));
        setErrorHistorial('');
        setCargandoHistorial(false);
      })
      .catch((err: Error) => {
        if (idPeticion !== peticionHistRef.current) return;
        setErrorHistorial(err.message || 'No se pudo consultar el historial de visitas.');
        setHistorial([]);
        setTotalRegistros(0);
        setTotalPaginas(1);
        setCargandoHistorial(false);
      });
  }, [busquedaHist, estadoHist, fechaDesde, fechaHasta, pagina, limite]);

  useEffect(() => {
    if (activeTab !== 'historial') return;
    cargarHistorial();
  }, [activeTab, refreshHistorial, cargarHistorial]);

  // Debounce de la búsqueda del historial (al escribir se vuelve a la página 1)
  useEffect(() => {
    const timer = setTimeout(() => {
      const valor = busquedaHistInput.trim();
      if (valor !== busquedaHist) {
        setCargandoHistorial(true);
        setPagina(1);
        setBusquedaHist(valor);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [busquedaHistInput, busquedaHist]);

  // Cambiar un filtro discreto del historial (estado, fechas) → página 1
  const cambiarFiltroHistorial = (campo: 'estado' | 'fechaDesde' | 'fechaHasta', valor: string) => {
    setCargandoHistorial(true);
    setPagina(1);
    if (campo === 'estado') setEstadoHist(valor);
    else if (campo === 'fechaDesde') setFechaDesde(valor);
    else setFechaHasta(valor);
  };

  const irAPagina = (n: number) => {
    if (n < 1 || n > totalPaginas || n === pagina) return;
    setCargandoHistorial(true);
    setPagina(n);
  };

  const cambiarLimite = (n: number) => {
    setCargandoHistorial(true);
    setLimite(n);
    setPagina(1);
  };

  // Limpiar todos los filtros y recargar la pestaña activa
  const limpiarFiltros = () => {
    setBusquedaHoyInput('');
    setBusquedaHoy('');
    setEstadoHoy('');
    setBusquedaHistInput('');
    setBusquedaHist('');
    setEstadoHist('');
    setFechaDesde('');
    setFechaHasta('');
    setCargandoHoy(true);
    setCargandoHistorial(true);
    setPagina(1);
    setRefreshHoy(r => r + 1);
    setRefreshHistorial(r => r + 1);
  };

  // Páginas a mostrar en el controlador (ventana alrededor de la actual)
  const paginasVisibles = useMemo<(number | string)[]>(() => {
    const total = totalPaginas;
    const actual = pagina;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const rango: (number | string)[] = [1];
    const inicio = Math.max(2, actual - 1);
    const fin = Math.min(total - 1, actual + 1);
    if (inicio > 2) rango.push('…');
    for (let i = inicio; i <= fin; i += 1) rango.push(i);
    if (fin < total - 1) rango.push('…');
    rango.push(total);
    return rango;
  }, [totalPaginas, pagina]);

  const inicioRegistros = totalRegistros === 0 ? 0 : (pagina - 1) * limite + 1;
  const finRegistros = Math.min(pagina * limite, totalRegistros);

  // ------------------------------------------------------------
  // Detalle (Drawer)
  // ------------------------------------------------------------
  const abrirDetalle = async (idVisitante: number) => {
    // Mismo guard de peticiones que las listas: descarta respuestas viejas si
    // el usuario hace clic rápido en varias filas (Ver detalle).
    const idPeticion = ++peticionDetalleRef.current;
    setDetalle(null);
    setErrorDetalle('');
    setCargandoDetalle(true);
    setDrawerOpen(true);
    try {
      const d = await visitasService.getDetalle(idVisitante);
      if (idPeticion !== peticionDetalleRef.current) return;
      setDetalle(d);
    } catch (err) {
      if (idPeticion !== peticionDetalleRef.current) return;
      setErrorDetalle((err as Error).message || 'No se pudo cargar el detalle de la visita.');
    } finally {
      if (idPeticion === peticionDetalleRef.current) setCargandoDetalle(false);
    }
  };

  const cerrarDetalle = () => {
    // Invalida cualquier detalle en vuelo al cerrar el drawer.
    peticionDetalleRef.current += 1;
    setDrawerOpen(false);
    setDetalle(null);
    setErrorDetalle('');
  };

  const badgeEstado = (estado: string) => (
    <span className={`badge ${claseBadge(estado)}`}>{estado}</span>
  );

  const renderDetalleDrawer = () => {
    if (cargandoDetalle) {
      return (
        <div className="bitacora-loading">
          <i className="fas fa-spinner fa-spin"></i> Cargando detalle...
        </div>
      );
    }
    if (errorDetalle) {
      return (
        <div className="bitacora-error">
          <i className="fas fa-exclamation-triangle"></i> {errorDetalle}
        </div>
      );
    }
    if (!detalle) return null;

    return (
      <div className="detail-card">
        <div className="detail-row">
          <span className="detail-label">Visitante</span>
          <span className="detail-value">{detalle.nombre_completo || '—'}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Cédula</span>
          <span className="detail-value">{oGuion(detalle.documento_identidad)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Placa</span>
          <span className="detail-value">{oGuion(detalle.placa)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Hora esperada</span>
          <span className="detail-value">{oGuion(detalle.hora_esperada)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Departamento</span>
          <span className="detail-value">{oGuion(detalle.departamento)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Inquilino que registró</span>
          <span className="detail-value">{oGuion(detalle.inquilino_que_registro)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Guarda que decidió</span>
          <span className="detail-value">{oGuion(detalle.guarda_que_decidio)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Hora de decisión</span>
          <span className="detail-value">{oGuion(detalle.hora_decision)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Estado</span>
          <span className="detail-value">{badgeEstado(detalle.estado)}</span>
        </div>
        {detalle.motivo_rechazo && (
          <div className="detail-row">
            <span className="detail-label">Motivo de rechazo</span>
            <span className="detail-value" style={{ color: 'var(--error)' }}>{detalle.motivo_rechazo}</span>
          </div>
        )}
      </div>
    );
  };

  const estadoActivo = activeTab === 'hoy' ? estadoHoy : estadoHist;
  const opcionesEstado = ESTADOS_VISITAS;

  return (
    <>
      <PageHeader title="Visitas" />

      {/* Pestañas Hoy / Historial */}
      <div className="visitas-tabs" id="visitasTabs">
        <button
          className={`tab-btn ${activeTab === 'hoy' ? 'active' : ''}`}
          data-tab="hoy"
          onClick={() => cambiarTab('hoy')}
        >
          Hoy
          <span className="tab-indicator"></span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'historial' ? 'active' : ''}`}
          data-tab="historial"
          onClick={() => cambiarTab('historial')}
        >
          Historial
          <span className="tab-indicator"></span>
        </button>
      </div>

      {/* Encabezado solo en pestaña Hoy */}
      {activeTab === 'hoy' && (
        <div className="visitas-header">
          <h3>Visitas de hoy</h3>
          <div className="visitas-fecha" id="visitasFechaActual">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      )}

      {/* Barra de filtros (comparte los estilos de .history-filters) */}
      <div className="visitas-filters" id="visitasFiltros">
        <div className="filter-group">
          <label htmlFor="visitasSearch">Buscar</label>
          <input
            type="text"
            id="visitasSearch"
            placeholder="Nombre, cédula, placa..."
            value={activeTab === 'hoy' ? busquedaHoyInput : busquedaHistInput}
            onChange={e => (activeTab === 'hoy'
              ? setBusquedaHoyInput(e.target.value)
              : setBusquedaHistInput(e.target.value)
            )}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="visitasEstadoFiltro">Estado</label>
          <select
            id="visitasEstadoFiltro"
            value={estadoActivo}
            onChange={e => {
              if (activeTab === 'hoy') {
                setEstadoHoy(e.target.value);
                setCargandoHoy(true);
              } else {
                cambiarFiltroHistorial('estado', e.target.value);
              }
            }}
          >
            <option value="">Todos</option>
            {opcionesEstado.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </div>
        <div className="filter-group" id="visitasFechaDesdeGroup" style={{ display: activeTab === 'historial' ? 'flex' : 'none' }}>
          <label htmlFor="visitasFechaDesde">Fecha desde</label>
          <input
            type="date"
            id="visitasFechaDesde"
            value={fechaDesde}
            max={fechaHasta || ayerStr}
            onChange={e => cambiarFiltroHistorial('fechaDesde', e.target.value)}
          />
        </div>
        <div className="filter-group" id="visitasFechaHastaGroup" style={{ display: activeTab === 'historial' ? 'flex' : 'none' }}>
          <label htmlFor="visitasFechaHasta">Fecha hasta</label>
          <input
            type="date"
            id="visitasFechaHasta"
            value={fechaHasta}
            min={fechaDesde || undefined}
            max={ayerStr}
            onChange={e => cambiarFiltroHistorial('fechaHasta', e.target.value)}
          />
        </div>
        <button className="btn-secondary" onClick={limpiarFiltros}>
          <i className="fas fa-undo"></i> Limpiar
        </button>
      </div>

      {/* ============ PESTAÑA: HOY ============ */}
      {activeTab === 'hoy' && (
        <>
          {cargandoHoy && (
            <div className="bitacora-loading">
              <i className="fas fa-spinner fa-spin"></i> Cargando visitas de hoy...
            </div>
          )}

          {!cargandoHoy && errorHoy && (
            <div className="bitacora-error">
              <i className="fas fa-exclamation-triangle"></i> {errorHoy}
            </div>
          )}

          {!cargandoHoy && !errorHoy && visitasHoy.length === 0 && (
            <div className="bitacora-empty">
              <i className="fas fa-user-friends"></i>
              <p>No hay visitas para hoy con los filtros seleccionados.</p>
            </div>
          )}

          {!cargandoHoy && !errorHoy && visitasHoy.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="table-modern" id="visitasTable">
                <thead>
                  <tr>
                    <th>Visitante</th>
                    <th>Cédula</th>
                    <th>Placa</th>
                    <th>Hora esperada</th>
                    <th>Estado</th>
                    <th>Guarda que decidió</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody id="visitasBody">
                  {visitasHoy.map(v => (
                    <tr key={v.id_visitante}>
                      <td data-label="Visitante">{v.nombre_completo || '—'}</td>
                      <td data-label="Cédula">{oGuion(v.documento_identidad)}</td>
                      <td data-label="Placa">{oGuion(v.placa)}</td>
                      <td data-label="Hora esperada">{oGuion(v.hora_esperada)}</td>
                      <td data-label="Estado">{badgeEstado(v.estado)}</td>
                      <td data-label="Guarda que decidió">{oGuion(v.guarda_que_decidio)}</td>
                      <td data-label="Acciones" className="action-icons">
                        <a onClick={() => abrirDetalle(v.id_visitante)} aria-label="Ver detalle" style={{ cursor: 'pointer' }}>
                          <i className="fas fa-eye"></i>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ============ PESTAÑA: HISTORIAL ============ */}
      {activeTab === 'historial' && (
        <>
          {cargandoHistorial && (
            <div className="bitacora-loading">
              <i className="fas fa-spinner fa-spin"></i> Cargando historial...
            </div>
          )}

          {!cargandoHistorial && errorHistorial && (
            <div className="bitacora-error">
              <i className="fas fa-exclamation-triangle"></i> {errorHistorial}
            </div>
          )}

          {!cargandoHistorial && !errorHistorial && historial.length === 0 && (
            <div className="bitacora-empty">
              <i className="fas fa-book-open"></i>
              <p>No hay visitas registradas para los filtros seleccionados.</p>
            </div>
          )}

          {!cargandoHistorial && !errorHistorial && historial.length > 0 && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table-modern" id="visitasTable">
                  <thead>
                    <tr>
                      <th>Visitante</th>
                      <th>Cédula</th>
                      <th>Placa</th>
                      <th>Fecha / Hora estimada</th>
                      <th>Estado</th>
                      <th>Guarda que decidió</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="visitasBody">
                    {historial.map(v => (
                      <tr key={v.id_visitante}>
                        <td data-label="Visitante">{v.nombre_completo || '—'}</td>
                        <td data-label="Cédula">{oGuion(v.documento_identidad)}</td>
                        <td data-label="Placa">{oGuion(v.placa)}</td>
                        <td data-label="Fecha / Hora estimada">{formatFechaHora(v.fecha_hora_estimada)}</td>
                        <td data-label="Estado">{badgeEstado(v.estado)}</td>
                        <td data-label="Guarda que decidió">{oGuion(v.guarda_que_decidio)}</td>
                        <td data-label="Acciones" className="action-icons">
                          <a onClick={() => abrirDetalle(v.id_visitante)} aria-label="Ver detalle" style={{ cursor: 'pointer' }}>
                            <i className="fas fa-eye"></i>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación (reutiliza los estilos de Bitácora) */}
              <div className="bitacora-pagination">
                <div className="bitacora-pagination-info">
                  <span>
                    Mostrando <strong>{inicioRegistros}–{finRegistros}</strong> de{' '}
                    <strong>{totalRegistros}</strong> registros
                  </span>
                  <label>
                    Registros por página:
                    <select value={limite} onChange={e => cambiarLimite(Number(e.target.value))}>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                </div>
                <div className="bitacora-pagination-controls">
                  <button
                    className="btn-secondary"
                    disabled={pagina <= 1}
                    onClick={() => irAPagina(pagina - 1)}
                  >
                    <i className="fas fa-chevron-left"></i> Anterior
                  </button>
                  {paginasVisibles.map((n, i) =>
                    n === '…' ? (
                      <span key={`ellipsis-${i}`} className="bitacora-page-ellipsis">…</span>
                    ) : (
                      <button
                        key={n}
                        className={`bitacora-page-btn ${n === pagina ? 'active' : ''}`}
                        onClick={() => irAPagina(n as number)}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    className="btn-secondary"
                    disabled={pagina >= totalPaginas}
                    onClick={() => irAPagina(pagina + 1)}
                  >
                    Siguiente <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Drawer de detalle */}
      <Drawer
        isOpen={drawerOpen}
        onClose={cerrarDetalle}
        title="Detalle de la visita"
        size="md"
      >
        {renderDetalleDrawer()}
      </Drawer>
    </>
  );
}

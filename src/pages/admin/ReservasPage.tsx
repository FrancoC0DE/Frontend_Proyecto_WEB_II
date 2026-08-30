/**
 * ============================================================================
 * Archivo: ReservasPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Módulo de reservas del panel de Administrador. Dos pestañas:
 *
 *   - "Hoy"       → reservas del día actual, cargadas por DataContext
 *                   (GET /api/reservas) y filtradas EN EL CLIENTE. Refresco
 *                   automático cada 30 s + al volver a enfocar la ventana.
 *   - "Historial" → reservas de días ANTERIORES a hoy, paginadas EN EL
 *                   SERVIDOR vía GET /api/reservas/historial
 *                   (sp_ConsultarHistorial con @solo_historial = 1 y
 *                   @page_number/@page_size). Mismo formato y controles que
 *                   el historial de Visitas: { pagina, limite,
 *                   totalRegistros, totalPaginas, datos }.
 *
 * "Ver detalle" → Drawer con los datos de la reserva.
 *
 * Componentes que utiliza
 * - PageHeader (título)
 * - Drawer (detalle de la reserva)
 * - reservasService (historial paginado)
 * - useData (reservasData para la pestaña "Hoy")
 *
 * Patrones
 * - La pestaña "Historial" replica la estructura de VisitasPage/BitacoraPage:
 *   debounce de búsqueda, contador de peticiones (evita respuestas cruzadas),
 *   paginación con clases .bitacora-pagination*.
 *
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import { useData } from '../../context/DataContext';
import { getLocalDateString, toDateOnly, toTimeOnly } from '../../hooks/useLocalDate';
import { getAreas, type AreaComun } from '../../services/areaServices';
import { reservasService, type ReservaHistorialRow } from '../../services/reservasService';
import type { Reserva } from '../../types';

// Cada cuánto se recarga la lista "Hoy" desde la BD (para que un cambio hecho
// por el inquilino —cancelación, nueva reserva— aparezca sin recargar la página).
const INTERVALO_REFRESCO_RESERVAS_MS = 30_000;

/** Opciones del filtro de estado (iguales en ambas pestañas). */
const ESTADOS_RESERVA = ['Reservado', 'Confirmada', 'Completado', 'Cancelado', 'Finalizada'];

// Tipo para la UI: relaja a opcionales los campos que en la forma transformada
// del DataContext (o en la vista/detalle) pueden faltar. Se usa Omit + intersección
// en vez de `extends` porque redeclarar una propiedad requerida como opcional no
// es válido al extender una interfaz.
type ReservaUI = Omit<Reserva, 'id' | 'hora_inicio' | 'hora_fin' | 'personas'> & {
  id?: number;
  id_reserva?: number;
  id_area?: number;
  hora?: string;
  hora_inicio?: string;
  hora_fin?: string;
  personas?: number;
  cantidad_personas?: number;
};

export default function ReservasPage() {
  const { reservasData, recargarReservas } = useData();

  const [activeTab, setActiveTab] = useState<'hoy' | 'historial'>('hoy');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReservaUI | null>(null);

  // Áreas reales registradas en Áreas Comunes (sp_ListarAreasComunes) para el
  // filtro: antes este select tenía opciones hardcodeadas (Piscina/Ranchos
  // BBQ/Gimnasio) que no reflejaban las áreas creadas en el módulo.
  const [areas, setAreas] = useState<AreaComun[]>([]);

  useEffect(() => {
    let activo = true;
    getAreas()
      .then(data => { if (activo) setAreas(Array.isArray(data) ? data : []); })
      .catch(err => console.error('Error al cargar áreas para el filtro:', err));
    return () => { activo = false; };
  }, []);

  // ------------------------------------------------------------
  // Pestaña "Hoy": filtros EN EL CLIENTE sobre reservasData
  // ------------------------------------------------------------
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [buscarResidente, setBuscarResidente] = useState('');

  // Fecha actual local (getLocalDateString evita el desfase de toISOString,
  // que usa UTC y rompía el filtro "Hoy" alrededor de la medianoche).
  const hoyFechaStr = getLocalDateString();

  const reservas = (reservasData || []) as ReservaUI[];

  const reservasHoy = reservas.filter((r: ReservaUI) => {
    if (r.fecha !== hoyFechaStr) return false;
    if (filtroArea && r.id_area !== Number(filtroArea)) return false;
    if (filtroEstado && r.estado !== filtroEstado) return false;
    if (buscarResidente && !r.residente?.toLowerCase().includes(buscarResidente.toLowerCase())) return false;
    return true;
  });

  // Refresco automático de la pestaña "Hoy": cada 30 s y al volver a enfocar
  // la ventana. Los setState ocurren dentro de los callbacks diferidos
  // (interval/focus), no de forma síncrona en el efecto.
  useEffect(() => {
    const timer = setInterval(() => {
      void recargarReservas();
    }, INTERVALO_REFRESCO_RESERVAS_MS);
    const onFocus = () => { void recargarReservas(); };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [recargarReservas]);

  // ------------------------------------------------------------
  // Pestaña "Historial": paginada EN EL SERVIDOR
  // ------------------------------------------------------------
  const [historial, setHistorial] = useState<ReservaHistorialRow[]>([]);
  const [buscarResidenteHistInput, setBuscarResidenteHistInput] = useState('');
  const [buscarResidenteHist, setBuscarResidenteHist] = useState('');
  const [filtroAreaHist, setFiltroAreaHist] = useState('');
  const [filtroEstadoHist, setFiltroEstadoHist] = useState('');
  const [fechaDesdeHist, setFechaDesdeHist] = useState('');
  const [fechaHastaHist, setFechaHastaHist] = useState('');
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(50);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState('');

  // Contador de peticiones: descarta respuestas viejas cuando se disparan
  // varias cargas seguidas (cambio rápido de filtros/páginas).
  const peticionHistRef = useRef(0);

  const cargarHistorial = useCallback(() => {
    const idPeticion = ++peticionHistRef.current;

    reservasService
      .getHistorial({
        residente: buscarResidenteHist,
        idArea: filtroAreaHist ? Number(filtroAreaHist) : undefined,
        estado: filtroEstadoHist,
        fechaDesde: fechaDesdeHist,
        fechaHasta: fechaHastaHist,
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
        setErrorHistorial(err.message || 'No se pudo consultar el historial de reservas.');
        setHistorial([]);
        setTotalRegistros(0);
        setTotalPaginas(1);
        setCargandoHistorial(false);
      });
  }, [buscarResidenteHist, filtroAreaHist, filtroEstadoHist, fechaDesdeHist, fechaHastaHist, pagina, limite]);

  // Cambio de pestaña: al entrar a "Historial" se carga su contenido.
  const cambiarTab = (tab: 'hoy' | 'historial') => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (tab === 'historial') {
      setCargandoHistorial(true);
    }
  };

  useEffect(() => {
    if (activeTab !== 'historial') return;
    cargarHistorial();
  }, [activeTab, cargarHistorial]);

  // Debounce de la búsqueda del historial (al escribir se vuelve a la página 1)
  useEffect(() => {
    const timer = setTimeout(() => {
      const valor = buscarResidenteHistInput.trim();
      if (valor !== buscarResidenteHist) {
        setCargandoHistorial(true);
        setPagina(1);
        setBuscarResidenteHist(valor);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [buscarResidenteHistInput, buscarResidenteHist]);

  // Cambiar un filtro discreto del historial (área, estado, fechas) → página 1
  const cambiarFiltroHistorial = (campo: 'area' | 'estado' | 'fechaDesde' | 'fechaHasta', valor: string) => {
    setCargandoHistorial(true);
    setPagina(1);
    if (campo === 'area') setFiltroAreaHist(valor);
    else if (campo === 'estado') setFiltroEstadoHist(valor);
    else if (campo === 'fechaDesde') setFechaDesdeHist(valor);
    else setFechaHastaHist(valor);
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

  const resetFilters = () => {
    setFiltroArea('');
    setFiltroEstado('');
    setBuscarResidente('');
    setBuscarResidenteHistInput('');
    setBuscarResidenteHist('');
    setFiltroAreaHist('');
    setFiltroEstadoHist('');
    setFechaDesdeHist('');
    setFechaHastaHist('');
    setPagina(1);
    if (activeTab === 'historial') setCargandoHistorial(true);
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
  const openDrawer = (item: ReservaUI) => {
    setSelectedItem(item);
    setDrawerOpen(true);
  };

  const renderDrawerContent = () => {
    if (!selectedItem) return null;

    const item = selectedItem;
    const horario = item.hora || (item.hora_inicio && item.hora_fin ? `${item.hora_inicio} - ${item.hora_fin}` : '-');
    const numPersonas = item.personas ?? item.cantidad_personas ?? '-';

    return (
      <div className="detail-card">
        <div className="detail-row">
          <span className="detail-label">Residente</span>
          <span className="detail-value">{item.residente || '-'}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Área</span>
          <span className="detail-value">{item.area || '-'}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Fecha</span>
          <span className="detail-value">{toDateOnly(item.fecha || '')}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Horario</span>
          <span className="detail-value">{horario}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Personas</span>
          <span className="detail-value">{numPersonas}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Estado</span>
          <span className="detail-value">
            <span className={`badge ${item.estado === 'Reservado' || item.estado === 'Confirmada' ? 'badge-success' : item.estado === 'Finalizada' || item.estado === 'Completado' ? 'badge-info' : 'badge-warning'}`}>
              {item.estado}
            </span>
          </span>
        </div>
      </div>
    );
  };

  /** Formatea la fecha de VW_Reservas (DATE → "dd/mm/aaaa") para la tabla. */
  const formatFecha = (raw: string | undefined): string => {
    const fecha = toDateOnly(raw || '');
    if (!fecha) return '-';
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  };

  /** Formatea la hora de VW_Reservas (TIME → "HH:mm"). */
  const formatHora = (raw: string | undefined): string => {
    if (!raw) return '--:--';
    return toTimeOnly(raw).slice(0, 5);
  };

  const badgeEstado = (estado: string) => (
    <span className={`badge ${estado === 'Reservado' || estado === 'Confirmada' ? 'badge-success' : estado === 'Finalizada' || estado === 'Completado' ? 'badge-info' : 'badge-warning'}`}>
      {estado}
    </span>
  );

  return (
    <>
      <PageHeader title="Reservas" />

      {/* Pestañas Hoy / Historial */}
      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === 'hoy' ? 'active' : ''}`}
          onClick={() => cambiarTab('hoy')}
        >
          Hoy
        </button>
        <button
          className={`tab-btn ${activeTab === 'historial' ? 'active' : ''}`}
          onClick={() => cambiarTab('historial')}
        >
          Historial
        </button>
      </div>

      {/* Encabezado solo en pestaña Hoy */}
      {activeTab === 'hoy' && (
        <div className="visitas-header">
          <h3>Reservas de hoy</h3>
          <div className="visitas-fecha">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      )}

      {/* Barra de filtros (comparte los estilos de .visitas-filters) */}
      <div className="visitas-filters">
        <div className="filter-group">
          <label>Residente</label>
          {activeTab === 'hoy' ? (
            <input
              type="text"
              placeholder="Residente..."
              value={buscarResidente}
              onChange={e => setBuscarResidente(e.target.value)}
            />
          ) : (
            <input
              type="text"
              placeholder="Residente..."
              value={buscarResidenteHistInput}
              onChange={e => setBuscarResidenteHistInput(e.target.value)}
            />
          )}
        </div>
        <div className="filter-group">
          <label>Área</label>
          <select
            value={activeTab === 'hoy' ? filtroArea : filtroAreaHist}
            onChange={e => {
              if (activeTab === 'hoy') setFiltroArea(e.target.value);
              else cambiarFiltroHistorial('area', e.target.value);
            }}
          >
            <option value="">Todas</option>
            {areas.map(a => (
              <option key={a.id_area ?? a.nombre} value={a.id_area ?? ''}>{a.nombre}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Estado</label>
          <select
            value={activeTab === 'hoy' ? filtroEstado : filtroEstadoHist}
            onChange={e => {
              if (activeTab === 'hoy') setFiltroEstado(e.target.value);
              else cambiarFiltroHistorial('estado', e.target.value);
            }}
          >
            <option value="">Todos</option>
            {ESTADOS_RESERVA.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </div>
        {activeTab === 'historial' && (
          <>
            <div className="filter-group">
              <label>Fecha desde</label>
              <input
                type="date"
                value={fechaDesdeHist}
                max={fechaHastaHist || hoyFechaStr}
                onChange={e => cambiarFiltroHistorial('fechaDesde', e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>Fecha hasta</label>
              <input
                type="date"
                value={fechaHastaHist}
                min={fechaDesdeHist || undefined}
                max={hoyFechaStr}
                onChange={e => cambiarFiltroHistorial('fechaHasta', e.target.value)}
              />
            </div>
          </>
        )}
        <button className="btn-secondary" onClick={resetFilters}>
          <i className="fas fa-undo"></i> Limpiar
        </button>
      </div>

      {/* ============ PESTAÑA: HOY ============ */}
      {activeTab === 'hoy' && (
        <>
          {reservasHoy.length === 0 ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '3rem' }}>
              <i className="fas fa-calendar-times" style={{ fontSize: '3rem', opacity: 0.5 }}></i>
              <p style={{ marginTop: '1rem' }}>No hay reservas para mostrar hoy</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Residente</th>
                    <th>Área</th>
                    <th>Fecha</th>
                    <th>Horario</th>
                    <th>Personas</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reservasHoy.map((r: ReservaUI) => {
                    const resId = r.id ?? r.id_reserva ?? 0;
                    const horario = r.hora || (r.hora_inicio && r.hora_fin ? `${r.hora_inicio} - ${r.hora_fin}` : '-');
                    const numPersonas = r.personas ?? r.cantidad_personas ?? '-';

                    return (
                      <tr key={resId}>
                        <td data-label="Residente">{r.residente || '-'}</td>
                        <td data-label="Área">{r.area || '-'}</td>
                        <td data-label="Fecha">{formatFecha(r.fecha)}</td>
                        <td data-label="Horario">{horario}</td>
                        <td data-label="Personas">{numPersonas}</td>
                        <td data-label="Estado">{badgeEstado(r.estado || '')}</td>
                        <td data-label="Acciones" className="action-icons">
                          <a onClick={() => openDrawer(r)} aria-label="Ver" title="Ver detalle" style={{ cursor: 'pointer' }}>
                            <i className="fas fa-eye"></i>
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ============ PESTAÑA: HISTORIAL (paginado en servidor) ============ */}
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
              <p>No hay reservas registradas para los filtros seleccionados.</p>
            </div>
          )}

          {!cargandoHistorial && !errorHistorial && historial.length > 0 && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Residente</th>
                      <th>Área</th>
                      <th>Fecha</th>
                      <th>Horario</th>
                      <th>Personas</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((r: ReservaHistorialRow) => {
                      const resId = r.id_reserva ?? r.id ?? 0;
                      const hInicio = formatHora(r.hora_inicio);
                      const hFin = formatHora(r.hora_fin);
                      const horario = hInicio !== '--:--' || hFin !== '--:--' ? `${hInicio} - ${hFin}` : '-';
                      const numPersonas = r.cantidad_personas ?? r.personas ?? '-';

                      return (
                        <tr key={resId}>
                          <td data-label="Residente">{r.residente || r.nombre_residente || r.nombre_completo || '-'}</td>
                          <td data-label="Área">{r.area || r.nombre_area || '-'}</td>
                          <td data-label="Fecha">{formatFecha(r.fecha ?? r.fecha_reserva)}</td>
                          <td data-label="Horario">{horario}</td>
                          <td data-label="Personas">{numPersonas}</td>
                          <td data-label="Estado">{badgeEstado(r.estado || '')}</td>
                          <td data-label="Acciones" className="action-icons">
                            <a onClick={() => openDrawer(r as ReservaUI)} aria-label="Ver" title="Ver detalle" style={{ cursor: 'pointer' }}>
                              <i className="fas fa-eye"></i>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación (reutiliza los estilos de Bitácora/Visitas) */}
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

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Ver reserva"
        size="md"
      >
        {renderDrawerContent()}
      </Drawer>
    </>
  );
}

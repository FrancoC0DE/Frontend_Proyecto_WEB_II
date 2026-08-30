/**
 * ============================================================================
 * Archivo: BitacoraPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Módulo de Bitácora (auditoría) del panel de Administrador. Permite consultar
 * los eventos registrados en la tabla `Bitacora` (INSERT, UPDATE, DELETE,
 * LOGIN, LOGOUT, EXPIRADA) con:
 *   - Filtros opcionales (rango de fechas, tabla, operación y búsqueda por
 *     texto en descripción/JSON). NOTA: el filtro por ID de usuario se eliminó
 *     porque el admin no puede conocer los ids; el modal de detalle sí muestra
 *     el id de cada usuario.
 *   - Paginación configurable (25/50/100 por página) con controles de
 *     navegación e indicador de total de registros.
 *   - Modal de detalle que muestra los JSON de `dato_anterior` y `dato_nuevo`
 *     con el visor @uiw/react-json-view.
 *
 * Componentes que utiliza
 * - PageHeader (título del módulo)
 * - bitacoraService (consumo de GET /api/bitacora)
 * - usePreferencias (tema del visor JSON según claro/oscuro)
 *
 * ============================================================================
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import JsonView from '@uiw/react-json-view';
import { darkTheme } from '@uiw/react-json-view/dark';
import { lightTheme } from '@uiw/react-json-view/light';
import PageHeader from '../../components/PageHeader';
import { bitacoraService } from '../../services/bitacoraService';
import { usePreferencias } from '../../context/PreferenciasContext';
import type { BitacoraRegistro } from '../../types';

// ------------------------------------------------------------
// Constantes del módulo
// ------------------------------------------------------------

/**
 * Nombres legibles por tabla afectada.
 * El catálogo usa EXACTAMENTE los nombres de las tablas de CondominioDB
 * (una sola clave por tabla) para que el select del filtro no repita
 * etiquetas (antes había claves duplicadas tipo 'Reserva' y 'Reservas'
 * que mostraban el mismo nombre dos veces).
 */
const TABLAS_LEGIBLES: Record<string, string> = {
  Rol: 'Roles',
  Usuario: 'Usuarios',
  PreferenciaUsuario: 'Preferencias de usuario',
  Codigo2FA: 'Código 2FA',
  TokenRecuperacion: 'Tokens de recuperación',
  Sesion: 'Sesiones',
  Departamento: 'Departamentos',
  Contrato: 'Contratos',
  AreaComun: 'Áreas comunes',
  AreaMantenimiento: 'Mantenimiento de áreas',
  Reserva: 'Reservas',
  Pago: 'Pagos',
  Visitante: 'Visitantes',
  RegistroIngreso: 'Registros de ingreso',
  Notificacion: 'Notificaciones',
  // Se conserva el nombre legible por si algún registro la referencia,
  // pero NO se ofrece como opción de filtro (no tiene sentido filtrar la
  // bitácora por sí misma).
  Bitacora: 'Bitácora'
};

/** Tablas ofrecidas en el filtro (todas menos Bitacora). */
const TABLAS_FIJAS = Object.keys(TABLAS_LEGIBLES).filter(t => t !== 'Bitacora');

/** Operaciones posibles registradas en la bitácora. */
const OPERACIONES = ['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPIRADA'] as const;

const OPERACION_LABELS: Record<string, string> = {
  INSERT: 'Inserción',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  EXPIRADA: 'Sesión expirada'
};

/** Clase CSS de color por operación (definidas en admin.css). */
const OPERACION_CLASSES: Record<string, string> = {
  INSERT: 'bitacora-op-insert',
  UPDATE: 'bitacora-op-update',
  DELETE: 'bitacora-op-delete',
  LOGIN: 'bitacora-op-login',
  LOGOUT: 'bitacora-op-logout',
  EXPIRADA: 'bitacora-op-expirada'
};

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

const nombreTabla = (tabla: string | null | undefined): string =>
  (tabla && TABLAS_LEGIBLES[tabla]) || tabla || '—';

/**
 * Formatea la fecha/hora en formato local (es-CR).
 *
 * ¿Por qué se reconstruye manualmente?
 * SQL Server guarda la columna DATETIME2 como HORA LOCAL (sin zona horaria,
 * ej: 2026-08-04 10:04:55). El driver mssql la interpreta como UTC y la
 * serializa con sufijo 'Z' (2026-08-04T10:04:55.767Z). Si se hiciera
 * `new Date(valor)`, el navegador la desplazaría a su zona horaria y
 * mostraría 6 horas menos (10:04 → 04:04 en Costa Rica).
 * Se extraen los componentes del string tal como vienen y se construye una
 * fecha local con ellos, para mostrar la hora real sin desfase.
 */
function formatFecha(valor: string): string {
  if (!valor) return '—';

  const partes = valor.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (partes) {
    const [, anio, mes, dia, hora, minuto, segundo] = partes;
    const fecha = new Date(
      Number(anio),
      Number(mes) - 1,
      Number(dia),
      Number(hora),
      Number(minuto),
      Number(segundo)
    );
    if (!Number.isNaN(fecha.getTime())) {
      return fecha.toLocaleString('es-CR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  }

  // Formato inesperado: se muestra tal cual.
  return valor;
}

/** Intenta parsear el JSON en texto; si falla, devuelve el texto crudo. */
function parseJSON(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Panel de JSON reutilizable (dato anterior / dato nuevo). */
function JsonPanel({
  titulo,
  raw,
  theme
}: {
  titulo: string;
  raw: string | null;
  theme: 'dark' | 'light';
}) {
  const parsed = parseJSON(raw);
  const mostrarVisor = typeof parsed === 'object' && parsed !== null;

  return (
    <div className="bitacora-json-panel">
      <div className="bitacora-json-title">
        <i className="fas fa-database"></i> {titulo}
      </div>
      <div className="bitacora-json-content">
        {!raw ? (
          <span className="bitacora-json-vacio">
            — Sin datos (NULL) —
          </span>
        ) : mostrarVisor ? (
          <JsonView
            value={parsed as object}
            collapsed={2}
            displayDataTypes={false}
            displayObjectSize
            enableClipboard
            style={{
              ...(theme === 'dark' ? darkTheme : lightTheme),
              fontSize: 12,
              background: 'transparent'
            }}
          />
        ) : (
          <pre className="bitacora-json-texto">{raw}</pre>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Página principal
// ------------------------------------------------------------

interface FiltrosBitacora {
  fechaInicio: string;
  fechaFin: string;
  tabla: string;
  operacion: string;
  busqueda: string;
}

const FILTROS_INICIALES: FiltrosBitacora = {
  fechaInicio: '',
  fechaFin: '',
  tabla: '',
  operacion: '',
  busqueda: ''
};

export default function BitacoraPage() {
  const { tema } = usePreferencias();
  const appliedTheme = useMemo<'dark' | 'light'>(() => {
    if (tema === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return tema;
  }, [tema]);

  // Filtros aplicados (discretos se aplican al cambiar; texto con debounce)
  const [filtros, setFiltros] = useState<FiltrosBitacora>(FILTROS_INICIALES);
  const [busquedaInput, setBusquedaInput] = useState('');

  // Paginación
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(50);

  // Datos / estados
  // `cargando` inicia en true para mostrar el indicador en la primera carga.
  const [datos, setDatos] = useState<BitacoraRegistro[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [refresco, setRefresco] = useState(0);

  // Detalle (modal)
  const [detalle, setDetalle] = useState<BitacoraRegistro | null>(null);

  // Debounce de la búsqueda por texto (el setState ocurre en el timeout,
  // no directamente en el cuerpo del efecto)
  useEffect(() => {
    const timer = setTimeout(() => {
      const valor = busquedaInput.trim();
      if (filtros.busqueda !== valor) {
        setCargando(true);
        setPagina(1);
        setFiltros(prev => ({ ...prev, busqueda: valor }));
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [busquedaInput, filtros.busqueda]);

  // Cambiar un filtro discreto (fechas, selects, id) → vuelve a la página 1
  const cambiarFiltro = (campo: keyof FiltrosBitacora, valor: string) => {
    setCargando(true);
    setPagina(1);
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  // IMPORTANTE: se crea SIEMPRE un objeto nuevo ({ ...FILTROS_INICIALES }),
  // nunca la misma referencia. Si el estado ya estuviera vacío, React haría
  // bail-out y el efecto de carga no se re-ejecutaría, dejando el indicador
  // de carga activo para siempre.
  const limpiarFiltros = () => {
    setBusquedaInput('');
    setCargando(true);
    setPagina(1);
    setFiltros({ ...FILTROS_INICIALES });
  };

  const irAPagina = (n: number) => {
    if (n < 1 || n > totalPaginas || n === pagina) return;
    setCargando(true);
    setPagina(n);
  };

  const cambiarLimite = (n: number) => {
    setCargando(true);
    setLimite(n);
    setPagina(1);
  };

  // Contador de peticiones: evita que una respuesta vieja (filtros anteriores)
  // pise a una más reciente cuando se disparan varias cargas seguidas.
  const peticionRef = useRef(0);

  // Carga de datos paginada (sin setState síncrono en el cuerpo del efecto)
  useEffect(() => {
    const idPeticion = ++peticionRef.current;
    let activo = true;

    bitacoraService
      .getBitacora({ ...filtros, pagina, limite })
      .then(resp => {
        if (!activo || idPeticion !== peticionRef.current) return;
        setDatos(resp.datos);
        setTotalRegistros(resp.totalRegistros);
        setTotalPaginas(Math.max(1, resp.totalPaginas));
        setError('');
        setCargando(false);
      })
      .catch((err: Error) => {
        if (!activo || idPeticion !== peticionRef.current) return;
        setError(err.message || 'Error al consultar la bitácora.');
        setDatos([]);
        setTotalRegistros(0);
        setTotalPaginas(1);
        setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [filtros, pagina, limite, refresco]);

  // Auto-refresh cada 60s (menos frecuente: es historical) + al volver a enfocar
  useEffect(() => {
    const timer = setInterval(() => {
      setRefresco(prev => prev + 1);
    }, 60_000);

    const onFocus = () => {
      setRefresco(prev => prev + 1);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Cerrar el modal de detalle con la tecla Escape (convención del proyecto)
  useEffect(() => {
    if (!detalle) return;
    const manejarEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetalle(null);
    };
    document.addEventListener('keydown', manejarEscape);
    return () => document.removeEventListener('keydown', manejarEscape);
  }, [detalle]);

  // Opciones del filtro de tabla: catálogo fijo + tablas vistas en los datos
  // (se excluye 'Bitacora' y el Set deduplica cualquier nombre repetido).
  const tablasDisponibles = useMemo(() => {
    const conjunto = new Set<string>(TABLAS_FIJAS);
    datos.forEach(d => {
      if (d.tabla_afectada && d.tabla_afectada !== 'Bitacora') conjunto.add(d.tabla_afectada);
    });
    return Array.from(conjunto).sort();
  }, [datos]);

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

  const badgeOperacion = (operacion: string) => (
    <span className={`badge bitacora-op ${OPERACION_CLASSES[operacion] ?? 'bitacora-op-default'}`}>
      {OPERACION_LABELS[operacion] ?? operacion}
    </span>
  );

  return (
    <>
      <PageHeader title="Bitácora" />

      {/* Barra de filtros (usa el patrón .history-filters de common.css) */}
      <div className="history-filters bitacora-filters">
        <div className="filter-group">
          <label>Fecha inicio</label>
          <input
            type="date"
            value={filtros.fechaInicio}
            onChange={e => cambiarFiltro('fechaInicio', e.target.value)}
            max={filtros.fechaFin || undefined}
          />
        </div>
        <div className="filter-group">
          <label>Fecha fin</label>
          <input
            type="date"
            value={filtros.fechaFin}
            onChange={e => cambiarFiltro('fechaFin', e.target.value)}
            min={filtros.fechaInicio || undefined}
          />
        </div>
        <div className="filter-group">
          <label>Tabla</label>
          <select value={filtros.tabla} onChange={e => cambiarFiltro('tabla', e.target.value)}>
            <option value="">Todas</option>
            {tablasDisponibles.map(t => (
              <option key={t} value={t}>{nombreTabla(t)}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Operación</label>
          <select value={filtros.operacion} onChange={e => cambiarFiltro('operacion', e.target.value)}>
            <option value="">Todas</option>
            {OPERACIONES.map(op => (
              <option key={op} value={op}>{OPERACION_LABELS[op]}</option>
            ))}
          </select>
        </div>
        <div className="filter-group bitacora-filtro-busqueda">
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Descripción o JSON..."
            value={busquedaInput}
            onChange={e => setBusquedaInput(e.target.value)}
          />
        </div>
        <button className="btn-secondary" onClick={limpiarFiltros}>
          <i className="fas fa-undo"></i> Limpiar
        </button>
      </div>

      {/* Indicador de carga */}
      {cargando && (
        <div className="bitacora-loading">
          <i className="fas fa-spinner fa-spin"></i> Cargando bitácora...
        </div>
      )}

      {/* Manejo de errores */}
      {!cargando && error && (
        <div className="bitacora-error">
          <i className="fas fa-exclamation-triangle"></i> {error}
        </div>
      )}

      {/* Sin registros */}
      {!cargando && !error && datos.length === 0 && (
        <div className="bitacora-empty">
          <i className="fas fa-book-open"></i>
          <p>No hay registros de bitácora para los filtros seleccionados.</p>
        </div>
      )}

      {/* Tabla de resultados */}
      {!cargando && !error && datos.length > 0 && (
        <>
          <div className="bitacora-table-wrap">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Fecha / Hora</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Tabla</th>
                  <th>Operación</th>
                  <th>Descripción</th>
                  <th>IP</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.map(r => (
                  <tr key={r.id_bitacora}>
                    <td data-label="Fecha / Hora">{formatFecha(r.fecha_evento)}</td>
                    <td data-label="Usuario">{r.usuario_nombre || 'Sistema'}</td>
                    <td data-label="Rol">{r.usuario_rol || '—'}</td>
                    <td data-label="Tabla">{nombreTabla(r.tabla_afectada)}</td>
                    <td data-label="Operación">{badgeOperacion(r.operacion)}</td>
                    <td data-label="Descripción" className="bitacora-desc" title={r.descripcion || ''}>
                      {r.descripcion || '—'}
                    </td>
                    <td data-label="IP">{r.ip_origen || '—'}</td>
                    <td data-label="Acciones" className="action-icons">
                      <a onClick={() => setDetalle(r)} aria-label="Ver detalle">
                        <i className="fas fa-eye"></i>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
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

      {/* Modal de detalle con los JSON de cambio */}
      {detalle && (
        <div className="bitacora-modal-overlay" onClick={() => setDetalle(null)}>
          <div className="bitacora-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="bitacora-modal-header">
              <h3><i className="fas fa-history"></i> Detalle de evento</h3>
              <button className="bitacora-modal-close" onClick={() => setDetalle(null)} aria-label="Cerrar">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="bitacora-modal-body">
              <div className="bitacora-detail-grid">
                <div className="bitacora-detail-item">
                  <span>Tabla</span>
                  <strong>{nombreTabla(detalle.tabla_afectada)}</strong>
                </div>
                <div className="bitacora-detail-item">
                  <span>Operación</span>
                  {badgeOperacion(detalle.operacion)}
                </div>
                <div className="bitacora-detail-item">
                  <span>Usuario</span>
                  <strong>
                    {detalle.usuario_nombre || 'Sistema'}
                    {detalle.id_usuario ? ` · ID ${detalle.id_usuario}` : ''}
                  </strong>
                </div>
                <div className="bitacora-detail-item">
                  <span>Rol</span>
                  <strong>{detalle.usuario_rol || '—'}</strong>
                </div>
                <div className="bitacora-detail-item">
                  <span>Fecha</span>
                  <strong>{formatFecha(detalle.fecha_evento)}</strong>
                </div>
                <div className="bitacora-detail-item">
                  <span>IP de origen</span>
                  <strong>{detalle.ip_origen || '—'}</strong>
                </div>
                <div className="bitacora-detail-item bitacora-detail-descripcion">
                  <span>Descripción</span>
                  <strong>{detalle.descripcion || '—'}</strong>
                </div>
              </div>

              <div className="bitacora-json-grid">
                <JsonPanel titulo="Dato anterior" raw={detalle.dato_anterior} theme={appliedTheme} />
                <JsonPanel titulo="Dato nuevo" raw={detalle.dato_nuevo} theme={appliedTheme} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

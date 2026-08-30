/**
 * ============================================================================
 * Archivo: PagosPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Módulo "Gestión de Pagos" (Administrador): vista unificada de TODOS los
 * pagos (reservas + contratos + administrativos) consumiendo la API real:
 *
 *   - Tarjetas resumen (GET /pagos/metricas → sp_ObtenerMetricasPagos).
 *   - Listado paginado con filtros (GET /pagos): búsqueda por residente o
 *     concepto, rango de fechas, estado, orden por fecha DESC y paginación
 *     (mismo patrón que Bitácora/Visitas).
 *   - Categoría calculada por fila (Reserva / Contrato / Administrativo).
 *   - "Registrar pago manual" (POST /pagos/manual → sp_RegistrarPago) para
 *     pagos administrativos sin reserva ni contrato.
 *   - "Exportar PDF" (GET /pagos/reporte → sp_ReportePagos + PDFKit).
 *
 * Cada cambio recarga la lista y las métricas desde el backend.
 *
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import { useToast } from '../../components/Toast';
import { useData } from '../../context/DataContext';
import { toDateOnly, toTimeOnly, getLocalDateString } from '../../hooks/useLocalDate';
import { formatearMoneda } from '../../utils/formatters';
import {
  pagosService,
  type PagoAdmin,
  type MetricasPagos,
} from '../../services/pagosService';

interface FiltrosPagosLocal {
  busqueda: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string;
}

const FILTROS_INICIALES: FiltrosPagosLocal = {
  busqueda: '',
  estado: '',
  fechaInicio: '',
  fechaFin: '',
};

const ESTADOS = ['Pagado', 'Reembolsado', 'SinReembolso', 'Pendiente'];

/**
 * Formatea la fecha de un pago a "YYYY-MM-DD HH:mm".
 * FIX (hora local): los DATETIME2 de SQL Server llegan serializados como UTC
 * (ej. "2026-08-14T01:53:36.837Z"); convertir con new Date() + getHours() los
 * desplaza a la hora local del navegador (la BD guarda 01:53 y se veía 19:53
 * del día anterior). Se usan los componentes UTC vía toDateOnly/toTimeOnly,
 * que conservan la hora exacta que guardó la BD.
 */
const formatearFecha = (iso: string): string => {
  if (!iso) return '-';
  const fecha = toDateOnly(iso);
  if (!fecha) return iso;
  return `${fecha} ${toTimeOnly(iso).slice(0, 5)}`;
};

const badgeCategoria = (categoria: PagoAdmin['categoria']) => {
  if (categoria === 'Reserva') return <span className="badge badge-info">Reserva</span>;
  if (categoria === 'Contrato') return <span className="badge badge-success">Contrato</span>;
  return <span className="badge">Administrativo</span>;
};

export default function PagosPage() {
  const { showToast } = useToast();
  const { addActivity } = useData();

  // ---- Métricas (tarjetas resumen) ----
  const [metricas, setMetricas] = useState<MetricasPagos | null>(null);

  // ---- Filtros (texto con debounce, el resto inmediato) ----
  const [filtros, setFiltros] = useState<FiltrosPagosLocal>(FILTROS_INICIALES);
  const [busquedaInput, setBusquedaInput] = useState('');

  // ---- Paginación ----
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(50);

  // ---- Datos ----
  const [datos, setDatos] = useState<PagoAdmin[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // Contador de refrescos: al registrarse un pago manual se incrementa para
  // forzar la recarga del listado (el efecto depende de él).
  const [refresco, setRefresco] = useState(0);

  // ---- Formulario "Registrar pago manual" ----
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formResidente, setFormResidente] = useState('');
  const [formConcepto, setFormConcepto] = useState('');
  const [formMonto, setFormMonto] = useState(0);
  const [formMetodo, setFormMetodo] = useState('Efectivo');
  const [enviandoManual, setEnviandoManual] = useState(false);

  const cargarMetricas = useCallback(async () => {
    try {
      const m = await pagosService.obtenerMetricas();
      setMetricas(m);
    } catch (err: unknown) {
      console.error('Error al cargar métricas de pagos:', err);
    }
  }, []);

  // Debounce de la búsqueda por texto
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

  const cambiarFiltro = (campo: keyof FiltrosPagosLocal, valor: string) => {
    setCargando(true);
    setPagina(1);
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

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

  // Contador de peticiones: evita que una respuesta vieja pise a una reciente.
  const peticionRef = useRef(0);

  // Carga del listado paginado
  useEffect(() => {
    const idPeticion = ++peticionRef.current;
    let activo = true;

    pagosService
      .listarPagos({
        busqueda: filtros.busqueda || undefined,
        estado: filtros.estado || undefined,
        fechaInicio: filtros.fechaInicio || undefined,
        fechaFin: filtros.fechaFin || undefined,
        pageNumber: pagina,
        pageSize: limite,
      })
      .then(resp => {
        if (!activo || idPeticion !== peticionRef.current) return;
        setDatos(resp.datos ?? []);
        setTotalRegistros(resp.totalRegistros ?? 0);
        setTotalPaginas(Math.max(1, resp.totalPaginas ?? 1));
        setError('');
        setCargando(false);
      })
      .catch((err: Error) => {
        if (!activo || idPeticion !== peticionRef.current) return;
        setError(err.message || 'Error al consultar los pagos.');
        setDatos([]);
        setTotalRegistros(0);
        setTotalPaginas(1);
        setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [filtros, pagina, limite, refresco]);

  // Carga inicial de métricas (setMetricas ocurre en continuaciones asíncronas;
  // la regla react-hooks/set-state-in-effect marca la llamada desde el efecto y
  // se suprime con justificación, mismo patrón que GuardiaDashboard).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void cargarMetricas();
  }, [cargarMetricas]);

  // Auto-refresh cada 30s + al volver a enfocar la ventana
  useEffect(() => {
    const timer = setInterval(() => {
      setRefresco(prev => prev + 1);
      void cargarMetricas();
    }, 30_000);

    const onFocus = () => {
      setRefresco(prev => prev + 1);
      void cargarMetricas();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [cargarMetricas]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Páginas a mostrar (ventana alrededor de la actual, patrón Bitácora)
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

  // ---- Acciones ----

  const abrirManual = () => {
    setFormResidente('');
    setFormConcepto('');
    setFormMonto(0);
    setFormMetodo('Efectivo');
    setDrawerOpen(true);
  };

  const guardarManual = async () => {
    if (!formResidente.trim() || !formConcepto.trim()) {
      showToast('El residente y el concepto son obligatorios.', 'error');
      return;
    }
    if (!Number.isFinite(formMonto) || formMonto <= 0) {
      showToast('El monto debe ser mayor a 0.', 'error');
      return;
    }

    setEnviandoManual(true);
    try {
      await pagosService.registrarPagoManual({
        residente: formResidente.trim(),
        concepto: formConcepto.trim(),
        monto: formMonto,
        tipo_pago: formMetodo,
        estado_pago: 'Pagado',
      });

      addActivity(`Pago manual registrado: <strong>${formResidente.trim() || 'Residente'}</strong> por ${formatearMoneda(formMonto)}`, 'fa-credit-card', 'var(--success)');

      setDrawerOpen(false);
      showToast('Pago registrado correctamente.', 'success');
      await cargarMetricas();
      // Recarga el listado (el efecto depende de `refresco`).
      setCargando(true);
      setRefresco(v => v + 1);
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo registrar el pago.', 'error');
    } finally {
      setEnviandoManual(false);
    }
  };

  const exportarPdf = async () => {
    try {
      // Por defecto el PDF es SOLO de los pagos de HOY (fecha local, no UTC);
      // si el admin seleccionó un rango de fechas en los filtros, se respeta.
      const hoy = getLocalDateString();
      const inicio = filtros.fechaInicio || hoy;
      const fin = filtros.fechaFin || hoy;
      await pagosService.descargarReportePdf(inicio, fin);
      addActivity('Reporte de pagos exportado (PDF)', 'fa-file-pdf', 'var(--accent)');
      showToast('Reporte PDF generado.', 'success');
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo generar el reporte.', 'error');
    }
  };

  return (
    <>
      <PageHeader title="Gestión de Pagos">
        <button className="btn-secondary" onClick={() => void exportarPdf()} title="Exporta en PDF los pagos de hoy (o el rango de fechas seleccionado en los filtros)">
          <i className="fas fa-file-pdf"></i> Exportar PDF
        </button>
        <button className="btn-primary" onClick={abrirManual}>
          <i className="fas fa-plus"></i> Registrar pago manual
        </button>
      </PageHeader>

      {/* Tarjetas resumen */}
      <div className="payment-summary">
        <div className="stat-card">
          <div className="stat-label">Total recaudado</div>
          <div className="stat-value">{formatearMoneda(Number(metricas?.total_recaudado ?? 0))}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ingresos de hoy</div>
          <div className="stat-value">{formatearMoneda(Number(metricas?.pagados_hoy ?? 0))}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pendientes</div>
          <div className="stat-value">{formatearMoneda(Number(metricas?.pendientes ?? 0))}</div>
        </div>
      </div>

      {/* Filtros (mismo patrón que Bitácora/Visitas) */}
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
          <label>Estado</label>
          <select value={filtros.estado} onChange={e => cambiarFiltro('estado', e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS.map(est => (
              <option key={est} value={est}>{est}</option>
            ))}
          </select>
        </div>
        <div className="filter-group bitacora-filtro-busqueda">
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Residente o concepto..."
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
          <i className="fas fa-spinner fa-spin"></i> Cargando pagos...
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
          <i className="fas fa-credit-card"></i>
          <p>No hay pagos registrados para los filtros seleccionados.</p>
        </div>
      )}

      {/* Tabla de pagos */}
      {!cargando && !error && datos.length > 0 && (
        <>
          <div className="bitacora-table-wrap">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Residente</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.map(p => (
                  <tr key={p.id_pago}>
                    <td data-label="ID">#{p.id_pago}</td>
                    <td data-label="Residente">{p.residente || '—'}</td>
                    <td data-label="Concepto">{p.concepto || '—'}</td>
                    <td data-label="Monto" style={{ fontWeight: 600 }}>{formatearMoneda(Number(p.monto) || 0)}</td>
                    <td data-label="Fecha">{formatearFecha(p.fecha_pago)}</td>
                    <td data-label="Método">{p.metodo_pago || '—'}</td>
                    <td data-label="Categoría">{badgeCategoria(p.categoria)}</td>
                    <td data-label="Estado">
                      <span className={`badge ${p.estado === 'Pagado' ? 'badge-success' : p.estado === 'Reembolsado' ? 'badge-info' : 'badge-warning'}`}>
                        {p.estado || 'Pagado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación (estilos de Bitácora) */}
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

      {/* Drawer: registrar pago manual (administrativo) */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => { if (!enviandoManual) setDrawerOpen(false); }}
        title="Registrar pago manual"
        onSave={() => void guardarManual()}
        saveText={enviandoManual ? 'Registrando...' : 'Registrar pago'}
        size="md"
      >
        <div className="form-section">
          <h4>Información del pago</h4>
          <div className="form-group">
            <label>Residente *</label>
            <input
              type="text"
              placeholder="Nombre del residente o razón del pago"
              value={formResidente}
              onChange={e => setFormResidente(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Concepto *</label>
            <input
              type="text"
              placeholder="Ej: Cuota extra, Depósito de garantía..."
              value={formConcepto}
              onChange={e => setFormConcepto(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Monto *</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={12}
              placeholder="₡0"
              title="Formato colones CR: ₡1.234"
              value={formMonto > 0 ? formatearMoneda(formMonto) : ''}
              onChange={e => setFormMonto(Number(e.target.value.replace(/\D/g, '')))}
            />
          </div>
          <div className="form-group">
            <label>Método de pago</label>
            <select value={formMetodo} onChange={e => setFormMetodo(e.target.value)}>
              <option>Efectivo</option>
              <option>Tarjeta</option>
              <option>Transferencia</option>
              <option>Otro</option>
            </select>
          </div>
        </div>
      </Drawer>
    </>
  );
}

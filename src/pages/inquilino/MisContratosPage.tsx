/**
 * ============================================================================
 * Archivo: MisContratosPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Módulo "Mis Contratos" (inquilino): lista los contratos del usuario
 * autenticado (GET /contratos/mis-contratos → sp_Contrato_Listar filtrado por
 * id_usuario del JWT), permite pagar la mensualidad con una pasarela simulada
 * (POST /pagos/contrato → sp_RegistrarPagoContrato) y ver el historial de
 * pagos de cada contrato (GET /contratos/:id/pagos).
 *
 * Reglas
 * - Solo los contratos con estado 'Activo' muestran el botón "Pagar".
 * - El monto del pago es editable pero DEBE coincidir exactamente con
 *   monto_mensual (tolerancia 0.01) — la validación ocurre en el frontend y
 *   el SP la refuerza en el backend.
 * - El modal de pago reutiliza el patrón de la Nueva Reserva
 *   (NuevaReservaPage.tsx): monto + selector de método + Confirmar/Cancelar.
 *
 * ============================================================================
 */

import { useCallback, useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/Toast';
import { toDateOnly, toTimeOnly } from '../../hooks/useLocalDate';
import { formatearMoneda } from '../../utils/formatters';
import { pagosService } from '../../services/pagosService';
import { pagarConBanky, describirResultado } from '../../services/payments/bankyCheckout';
import {
  contratoInquilinoService,
  type ContratoInquilino,
  type PagoContrato,
} from '../../services/contratoInquilinoService';

/** Recorta un ISO de SQL Server a "YYYY-MM-DD" (fecha tal cual la guarda la BD). */
const soloFecha = (iso: string | undefined | null): string =>
  iso ? toDateOnly(iso) || '-' : '-';

/**
 * Formatea la fecha de un pago a "YYYY-MM-DD HH:mm".
 * FIX (hora local): los DATETIME2 de SQL Server llegan serializados como UTC;
 * new Date() + getHours() los desplazaba a la hora local del navegador (la BD
 * guarda 01:16 y se veía 19:16 del día anterior). toDateOnly/toTimeOnly usan
 * los componentes UTC y conservan la hora exacta guardada en la BD.
 */
const formatearFechaPago = (iso: string): string => {
  if (!iso) return '-';
  const fecha = toDateOnly(iso);
  if (!fecha) return iso;
  return `${fecha} ${toTimeOnly(iso).slice(0, 5)}`;
};

export default function MisContratosPage() {
  const { addNotification } = useData();
  const { showToast } = useToast();

  const [contratos, setContratos] = useState<ContratoInquilino[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Pasarela de pago
  const [contratoPago, setContratoPago] = useState<ContratoInquilino | null>(null);
  const [montoPago, setMontoPago] = useState(0);
  const [metodoPago, setMetodoPago] = useState<'tarjeta' | 'efectivo' | 'sinpe'>('tarjeta');
  const [enviando, setEnviando] = useState(false);

  // Detalle / historial
  const [detalle, setDetalle] = useState<ContratoInquilino | null>(null);
  const [pagosDetalle, setPagosDetalle] = useState<PagoContrato[] | null>(null);
  const [cargandoPagos, setCargandoPagos] = useState(false);

  const cargarContratos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const data = await contratoInquilinoService.obtenerMisContratos();
      setContratos(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'No se pudieron cargar tus contratos.');
      setContratos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial de los contratos: cargarContratos activa el indicador de
    // carga (setCargando(true)) al arrancar el fetch y actualiza el resto del
    // estado en continuaciones asíncronas. La regla react-hooks/
    // set-state-in-effect lo marca por ser una llamada desde un efecto; se
    // suprime con justificación (mismo patrón que GuardiaDashboard/DataContext).
    /* eslint-disable react-hooks/set-state-in-effect */
    void cargarContratos();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargarContratos]);

  // Auto-refresh cada 30s + al volver a enfocar la ventana
  useEffect(() => {
    const timer = setInterval(() => {
      void cargarContratos();
    }, 30_000);

    const onFocus = () => {
      void cargarContratos();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [cargarContratos]);

  /** Abre la pasarela de pago con el monto mensual pre-cargado. */
  const abrirPago = (contrato: ContratoInquilino) => {
    setContratoPago(contrato);
    setMontoPago(Number(contrato.monto_mensual) || 0);
    setMetodoPago('tarjeta');
  };

  const cerrarPago = () => {
    if (enviando) return;
    setContratoPago(null);
  };

  /** Confirma el pago: valida el monto y llama a POST /pagos/contrato. */
  const confirmarPago = async () => {
    if (!contratoPago) return;

    const montoEsperado = Number(contratoPago.monto_mensual) || 0;
    if (!Number.isFinite(montoPago) || montoPago <= 0) {
      showToast('Ingresa un monto válido.', 'error');
      return;
    }
    // Regla del SP: el monto debe coincidir con monto_mensual (tolerancia 0.01).
    if (Math.abs(montoPago - montoEsperado) > 0.01) {
      showToast(`El monto debe coincidir con la mensualidad del contrato (${formatearMoneda(montoEsperado)}).`, 'error');
      return;
    }

    const metodoTexto = metodoPago === 'tarjeta' ? 'Tarjeta' : metodoPago === 'efectivo' ? 'Efectivo' : 'Sinpe Móvil';

    setEnviando(true);
    try {
      // Cobro real con BankyFinanzas (tarjeta): se espera la aprobación del
      // banco ANTES de registrar el pago de la mensualidad. Efectivo/sinpe
      // se registran directo, igual que antes (fuera de la pasarela).
      if (metodoPago === 'tarjeta') {
        const resultado = await pagarConBanky({
          orderId: `CONTRATO-${contratoPago.id_contrato}-${Date.now()}`,
          amount: Math.round(montoPago),
          description: `Mensualidad contrato #${contratoPago.id_contrato} (${contratoPago.departamento || 'depto.'})`,
        });

        if (resultado.status !== 'completed') {
          showToast(describirResultado(resultado), resultado.status === 'cancelled' ? 'info' : 'error');
          setEnviando(false);
          return;
        }
      }

      await pagosService.registrarPagoContrato({
        id_contrato: contratoPago.id_contrato,
        monto: montoPago,
        tipo_pago: metodoPago,
        concepto: 'Mensualidad',
      });

      setContratoPago(null);
      showToast(`Pago de la mensualidad (${formatearMoneda(montoPago)} con ${metodoTexto}) registrado correctamente.`, 'success');
      addNotification('inquilino', 'Pago de mensualidad', `Pagaste la mensualidad del contrato ${contratoPago.departamento} por ${formatearMoneda(montoPago)}.`, 'fa-credit-card', contratoPago.id_contrato);
      await cargarContratos();
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo registrar el pago.', 'error');
    } finally {
      setEnviando(false);
    }
  };

  /** Abre el detalle y carga el historial de pagos del contrato. */
  const abrirDetalle = async (contrato: ContratoInquilino) => {
    setDetalle(contrato);
    setPagosDetalle(null);
    setCargandoPagos(true);
    try {
      const pagos = await contratoInquilinoService.obtenerPagosContrato(contrato.id_contrato);
      setPagosDetalle(Array.isArray(pagos) ? pagos : []);
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo cargar el historial de pagos.', 'error');
      setPagosDetalle([]);
    } finally {
      setCargandoPagos(false);
    }
  };

  const cerrarDetalle = () => setDetalle(null);

  /** Abre el comprobante de pago (PDF, solo lectura) en una pestaña nueva. */
  const verRecibo = async (idPago: number) => {
    try {
      await pagosService.verReciboPago(idPago);
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo abrir el comprobante.', 'error');
    }
  };

  // 'Activo' → verde; 'Finalizado' → estilo neutro (.badge sin modificador).
  const badgeEstado = (estado: string) =>
    estado === 'Activo' ? 'badge-success' : 'badge';

  return (
    <>
      <div className="page-header">
        <h2>Mis Contratos</h2>
      </div>

      {error && <div className="alert-error" style={{ marginBottom: 'var(--space-3)' }}>{error}</div>}

      {cargando ? (
        <div className="empty-state" style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--text-muted)' }}>
          Cargando tus contratos...
        </div>
      ) : contratos.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--text-muted)' }}>
          No tienes contratos registrados.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table-modern" id="misContratosTable">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Departamento</th>
                <th>Fecha inicio</th>
                <th>Fecha fin</th>
                <th>Mensualidad</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="misContratosBody">
              {contratos.map(c => (
                <tr key={c.id_contrato}>
                  <td data-label="Contrato">#{c.id_contrato}</td>
                  <td data-label="Departamento">{c.departamento || '-'}</td>
                  <td data-label="Fecha inicio">{soloFecha(c.fecha_inicio)}</td>
                  <td data-label="Fecha fin">{soloFecha(c.fecha_fin)}</td>
                  <td data-label="Mensualidad" style={{ fontWeight: 600 }}>{formatearMoneda(Number(c.monto_mensual) || 0)}</td>
                  <td data-label="Estado">
                    <span className={`badge ${badgeEstado(c.estado)}`}>{c.estado}</span>
                  </td>
                  <td data-label="Acciones">
                    <div className="action-cell">
                      <button className="btn-sm btn-info" onClick={() => void abrirDetalle(c)}>
                        <i className="fas fa-eye"></i> Ver detalles
                      </button>
                      {c.estado === 'Activo' && (
                        <button className="btn-sm btn-primary" onClick={() => abrirPago(c)}>
                          <i className="fas fa-credit-card"></i> Pagar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Pasarela de pago (mismo patrón que NuevaReservaPage) ---- */}
      {contratoPago && (
        <div className="modal-overlay open" onClick={cerrarPago}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Pago de Contrato</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
              Contrato #{contratoPago.id_contrato} — Departamento {contratoPago.departamento || '-'} ·
              Vence: {soloFecha(contratoPago.fecha_fin)}
            </p>
            <div className="detail-row">
              <span className="detail-label">Monto a pagar</span>
              <span className="detail-value">
                <input
                  id="pagoContratoMonto"
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="₡0"
                  title="Debe coincidir exactamente con la mensualidad"
                  value={montoPago > 0 ? formatearMoneda(montoPago) : ''}
                  onChange={e => setMontoPago(Number(e.target.value.replace(/\D/g, '')))}
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-1) var(--space-2)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    width: '100%',
                    textAlign: 'right',
                  }}
                />
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Método de pago</span>
              <span className="detail-value">
                <select
                  id="pagoContratoMetodo"
                  value={metodoPago}
                  onChange={e => setMetodoPago(e.target.value as 'tarjeta' | 'efectivo' | 'sinpe')}
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-1) var(--space-2)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    width: '100%',
                  }}
                >
                  <option value="tarjeta">Tarjeta de crédito/débito</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="sinpe">Sinpe Móvil</option>
                </select>
              </span>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cerrarPago} disabled={enviando}>Cancelar</button>
              <button className="btn-primary" id="confirmarPagoContratoBtn" onClick={() => void confirmarPago()} disabled={enviando}>
                {enviando ? 'Procesando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Detalle del contrato + historial de pagos ---- */}
      {detalle && (
        <div className="modal-overlay open" onClick={cerrarDetalle}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', width: '100%' }}>
            <h3>Detalle del contrato #{detalle.id_contrato}</h3>
            <div className="detail-card">
              <div className="detail-row">
                <span className="detail-label">Residente</span>
                <span className="detail-value">{detalle.residente}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Departamento</span>
                <span className="detail-value">{detalle.departamento || '-'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Vigencia</span>
                <span className="detail-value">{soloFecha(detalle.fecha_inicio)} → {soloFecha(detalle.fecha_fin)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Mensualidad</span>
                <span className="detail-value" style={{ fontWeight: 600 }}>{formatearMoneda(Number(detalle.monto_mensual) || 0)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Estado</span>
                <span className="detail-value"><span className={`badge ${badgeEstado(detalle.estado)}`}>{detalle.estado}</span></span>
              </div>
            </div>

            <h4 style={{ margin: 'var(--space-3) 0 var(--space-2)' }}>Historial de pagos</h4>
            {cargandoPagos ? (
              <p style={{ color: 'var(--text-muted)' }}>Cargando pagos...</p>
            ) : !pagosDetalle || pagosDetalle.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Este contrato aún no tiene pagos registrados.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table-modern">
                  <thead>
                    <tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Concepto</th><th>Estado</th><th>Recibo</th></tr>
                  </thead>
                  <tbody>
                    {pagosDetalle.map(p => (
                      <tr key={p.id_pago}>
                        <td data-label="Fecha">{formatearFechaPago(p.fecha_pago)}</td>
                        <td data-label="Monto" style={{ fontWeight: 600 }}>{formatearMoneda(Number(p.monto) || 0)}</td>
                        <td data-label="Método">{p.metodo_pago}</td>
                        <td data-label="Concepto">{p.concepto}</td>
                        <td data-label="Estado"><span className="badge badge-success">{p.estado}</span></td>
                        <td data-label="Recibo">
                          <button className="btn-sm btn-outline" onClick={() => void verRecibo(p.id_pago)}>
                            <i className="fas fa-file-invoice"></i> Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={cerrarDetalle}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

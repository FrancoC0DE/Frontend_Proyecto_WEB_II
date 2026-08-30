/**
 * ============================================================================
 * Archivo: FacturacionPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Panel de Administrador del módulo de Facturación Electrónica (rol de
 * curso: "Empresa que vende el servicio de Facturación Electrónica").
 *
 * Flujo de "Firmar y enviar" (por factura pendiente):
 *   1. El admin hace clic en "Firmar y enviar".
 *   2. Se abre el popup interactivo de HSM Sign CR (firmarConHSMSignCR):
 *      el admin escribe SU identificación y PIN de firma directamente en
 *      ESE popup — nunca en este sitio. Nunca se le pide el PIN aquí.
 *   3. Si HSM Sign CR firma correctamente, el resultado (xmlFirmado +
 *      hashDocumento + serialCertificado) se manda a nuestro backend
 *      (POST /facturacion/:id/firmar), que valida la firma y envía la
 *      factura a Mini Tributación (DGTD real).
 *   4. Se refresca la lista con el resultado (aceptada/rechazada + acuse).
 *
 * IDENTIFICACION_EMISOR: debe coincidir EXACTAMENTE con la identificación
 * registrada en HSM Sign CR (misma que FACT_IDENTIFICACION_TRIBUTARIA en el
 * backend) — no es secreta (es pública, va en cada factura), a diferencia
 * del PIN, que nunca pasa por este código.
 *
 * ============================================================================
 */
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { formatearMoneda } from '../../utils/formatters';
import {
  facturacionService,
  type FacturaPendiente,
  type FacturaHistorial,
} from '../../services/facturacionService';
import { firmarConHSMSignCR, describirResultadoFirma } from '../../services/payments/hsmSignCheckout';

/** Debe coincidir con FACT_IDENTIFICACION_TRIBUTARIA del backend (.env). */
const IDENTIFICACION_EMISOR = '119710437';

const badgeEstado = (estado: string): string => {
  if (estado === 'aceptada') return 'badge-success';
  if (estado === 'rechazada') return 'badge-error';
  if (estado === 'pendiente_firma') return 'badge-warning';
  return 'badge';
};

export default function FacturacionPage() {
  const { showToast } = useToast();

  const [pendientes, setPendientes] = useState<FacturaPendiente[]>([]);
  const [historial, setHistorial] = useState<FacturaHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [firmandoId, setFirmandoId] = useState<number | null>(null);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      const [p, h] = await Promise.all([
        facturacionService.obtenerPendientes(),
        facturacionService.obtenerHistorial(),
      ]);
      setPendientes(p);
      setHistorial(h);
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudieron cargar las facturas.', 'error');
    } finally {
      setCargando(false);
    }
    // showToast no cambia entre renders (viene de un contexto estable); se omite
    // a propósito de las dependencias para no re-crear cargarTodo en cada toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void cargarTodo();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargarTodo]);

  const verComprobante = async (id: number) => {
    try {
      await facturacionService.verComprobante(id);
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo abrir el comprobante.', 'error');
    }
  };

  const reintentarComprobante = async (id: number) => {
    setFirmandoId(id);
    try {
      const respuesta = await facturacionService.reintentarComprobante(id);
      showToast(respuesta.message, respuesta.comprobanteBK ? 'success' : 'error');
      await cargarTodo();
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo reintentar el comprobante.', 'error');
    } finally {
      setFirmandoId(null);
    }
  };

  const firmarYEnviar = async (factura: FacturaPendiente) => {
    setFirmandoId(factura.id);
    try {
      const resultado = await firmarConHSMSignCR({
        identificacion: IDENTIFICACION_EMISOR,
        xmlFactura: factura.xml_original,
      });

      if (resultado.status !== 'completed') {
        showToast(describirResultadoFirma(resultado), resultado.status === 'cancelled' ? 'info' : 'error');
        return;
      }

      const respuesta = await facturacionService.firmarYEnviar(factura.id, {
        xmlFirmado: resultado.xmlFirmado,
        hashDocumento: resultado.hashDocumento,
        serialCertificado: resultado.serialCertificado,
      });

      showToast(respuesta.message, respuesta.estado === 'aceptada' ? 'success' : 'error');
      await cargarTodo();
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo firmar/enviar la factura.', 'error');
    } finally {
      setFirmandoId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Facturación Electrónica</h2>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-header">
          <h3>Pendientes de firma</h3>
        </div>
        <div className="card-body">
          {cargando ? (
            <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p>
          ) : pendientes.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No hay facturas pendientes de firma.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table-modern">
                <thead>
                  <tr><th>Pago</th><th>Cliente</th><th>Monto</th><th>Generada</th><th>Acción</th></tr>
                </thead>
                <tbody>
                  {pendientes.map(f => (
                    <tr key={f.id}>
                      <td data-label="Pago">#{f.id_pago}</td>
                      <td data-label="Cliente">{f.cliente_nombre}</td>
                      <td data-label="Monto" style={{ fontWeight: 600 }}>{formatearMoneda(f.monto)}</td>
                      <td data-label="Generada">{new Date(f.fecha_generacion).toLocaleString('es-CR')}</td>
                      <td data-label="Acción">
                        <button
                          className="btn-sm btn-info"
                          onClick={() => void firmarYEnviar(f)}
                          disabled={firmandoId === f.id}
                        >
                          <i className="fas fa-signature"></i> {firmandoId === f.id ? 'Firmando...' : 'Firmar y enviar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Historial</h3>
        </div>
        <div className="card-body">
          {historial.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Aún no se ha firmado ninguna factura.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table-modern">
                <thead>
                  <tr><th>Pago</th><th>Cliente</th><th>Monto</th><th>Estado</th><th>Acuse / Motivo</th><th>Enviada</th><th>Comprobante</th></tr>
                </thead>
                <tbody>
                  {historial.map(f => (
                    <tr key={f.id}>
                      <td data-label="Pago">#{f.id_pago}</td>
                      <td data-label="Cliente">{f.cliente_nombre}</td>
                      <td data-label="Monto" style={{ fontWeight: 600 }}>{formatearMoneda(f.monto)}</td>
                      <td data-label="Estado"><span className={`badge ${badgeEstado(f.estado)}`}>{f.estado}</span></td>
                      <td data-label="Acuse / Motivo">{f.numero_acuse || f.motivo_rechazo || '-'}</td>
                      <td data-label="Enviada">{f.fecha_envio ? new Date(f.fecha_envio).toLocaleString('es-CR') : '-'}</td>
                      <td data-label="Comprobante">
                        {f.estado !== 'aceptada' ? '-' : f.tiene_comprobante ? (
                          <button className="btn-sm btn-outline" onClick={() => void verComprobante(f.id)}>
                            <i className="fas fa-file-pdf"></i> Ver
                          </button>
                        ) : (
                          <button
                            className="btn-sm btn-info"
                            onClick={() => void reintentarComprobante(f.id)}
                            disabled={firmandoId === f.id}
                            title={f.bk_error || undefined}
                          >
                            <i className="fas fa-redo"></i> {firmandoId === f.id ? 'Reintentando...' : 'Reintentar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

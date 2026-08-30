/**
 * ============================================================================
 * Archivo: MisFacturasPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla donde el inquilino revisa el estado de las facturas electrónicas
 * generadas por sus pagos (reservas y mensualidades). Cumple con el
 * requisito de que "el cliente pueda revisar las facturas generadas ante
 * este módulo" (rol de curso: Empresa que vende Facturación Electrónica).
 *
 * Distinto del comprobante de pago (PDF, ver MisReservasPage/MisContratosPage
 * → "Recibo"): esta pantalla muestra el ESTADO de la factura electrónica
 * ante Mini Tributación (pendiente / aceptada / rechazada + número de acuse).
 *
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { formatearMoneda } from '../../utils/formatters';
import { facturacionService, type FacturaPropia } from '../../services/facturacionService';

const badgeEstado = (estado: string): string => {
  if (estado === 'aceptada') return 'badge-success';
  if (estado === 'rechazada') return 'badge-error';
  return 'badge-warning'; // pendiente_firma
};

const textoEstado = (estado: string): string => {
  if (estado === 'aceptada') return 'Aceptada';
  if (estado === 'rechazada') return 'Rechazada';
  return 'Pendiente de firma';
};

export default function MisFacturasPage() {
  const { showToast } = useToast();
  const [facturas, setFacturas] = useState<FacturaPropia[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      try {
        const data = await facturacionService.obtenerMisFacturas();
        setFacturas(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        const e = err as Error;
        showToast(e.message || 'No se pudieron cargar tus facturas.', 'error');
      } finally {
        setCargando(false);
      }
    };
    /* eslint-disable react-hooks/set-state-in-effect */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verComprobante = async (id: number) => {
    try {
      await facturacionService.verComprobante(id);
    } catch (err: unknown) {
      const e = err as Error;
      showToast(e.message || 'No se pudo abrir el comprobante.', 'error');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Mis Facturas</h2></div>
      <div className="card">
        <div className="card-body">
          {cargando ? (
            <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p>
          ) : facturas.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Aún no tienes facturas electrónicas generadas.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table-modern">
                <thead>
                  <tr><th>Fecha</th><th>Monto</th><th>Estado</th><th>N.º de acuse / Motivo</th><th>Comprobante</th></tr>
                </thead>
                <tbody>
                  {facturas.map(f => (
                    <tr key={f.id}>
                      <td data-label="Fecha">{new Date(f.fecha_generacion).toLocaleDateString('es-CR')}</td>
                      <td data-label="Monto" style={{ fontWeight: 600 }}>{formatearMoneda(f.monto)}</td>
                      <td data-label="Estado"><span className={`badge ${badgeEstado(f.estado)}`}>{textoEstado(f.estado)}</span></td>
                      <td data-label="N.º de acuse / Motivo">{f.numero_acuse || f.motivo_rechazo || '-'}</td>
                      <td data-label="Comprobante">
                        {f.estado === 'aceptada' ? (
                          <button className="btn-sm btn-outline" onClick={() => void verComprobante(f.id)}>
                            <i className="fas fa-file-pdf"></i> Ver
                          </button>
                        ) : '-'}
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

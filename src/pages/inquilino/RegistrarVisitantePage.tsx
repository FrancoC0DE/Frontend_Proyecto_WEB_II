/**
 * ============================================================================
 * Archivo: RegistrarVisitantePage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla donde el inquilino registra un nuevo visitante. Debe ingresar
 * nombre, documento, placa (opcional) y hora esperada. Al registrarse,
 * el visitante queda en estado "Pendiente" hasta que el guardia lo autorice.
 *
 * Componentes que utiliza
 * - PageHeader (título)
 * - useData (contexto: inquilinoVisitantesData, setInquilinoVisitantes)
 * - useToast (notificaciones)
 * - React Router (navegación)
 *
 * ============================================================================
 */

import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/Toast';
import { inquilinoService } from '../../services/inquilinoService';
import { formatearCedula, formatearPlaca, validarDocumentoVisitante, validarNombre, validarPlaca } from '../../utils/formatters';

/** Próxima media hora redondeada (HH:mm) — valor por defecto de "Hora esperada". */
const proximaMediaHora = (): string => {
  const ahora = new Date();
  ahora.setSeconds(0, 0);
  if (ahora.getMinutes() >= 30) {
    ahora.setHours(ahora.getHours() + 1, 0, 0, 0);
  } else {
    ahora.setMinutes(30, 0, 0);
  }
  return `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
};

export default function RegistrarVisitantePage() {
  const { recargarVisitantesInquilino, addNotification } = useData();
  const { showToast } = useToast();
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [placa, setPlaca] = useState('');
  // Valor por defecto = próxima media hora: evita el "--:-- --" nativo de
  // Firefox en inputs type="time" vacíos y asegura una hora futura.
  const [horaEsperada, setHoraEsperada] = useState(() => proximaMediaHora());
  const [enviando, setEnviando] = useState(false);

  /**
   * Máscara adaptativa del documento: si se escriben solo dígitos se formatea
   * como cédula costarricense (1-2345-6789); si aparecen letras (pasaporte u
   * otro documento) el campo queda libre para no romper datos alfanuméricos.
   */
  const cambiarDocumento = (valor: string) => {
    setDocumento(/^[\d-]*$/.test(valor) ? formatearCedula(valor) : valor);
  };

  /** Detecta si la hora elegida ya pasó hoy (se programará para mañana). */
  const esParaManana = (): boolean => {
    if (!horaEsperada) return false;
    const ahora = new Date();
    const [h, m] = horaEsperada.split(':').map(Number);
    const fechaHora = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), h, m);
    return fechaHora.getTime() < ahora.getTime();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !documento) {
      showToast('Nombre y documento son obligatorios.', 'error');
      return;
    }

    // Nombre: solo letras, sin números ni símbolos.
    const errorNombre = validarNombre(nombre);
    if (errorNombre) {
      showToast(errorNombre, 'error');
      return;
    }

    // Documento: si son solo dígitos/guiones debe cumplir el formato de cédula
    // (1-2345-6789); si trae letras se acepta como pasaporte sin más validación.
    const errorDocumento = validarDocumentoVisitante(documento);
    if (errorDocumento) {
      showToast(errorDocumento, 'error');
      return;
    }

    // Placa opcional: si se llenó, debe cumplir el formato ABC-123
    const errorPlaca = validarPlaca(placa);
    if (errorPlaca) {
      showToast(errorPlaca, 'error');
      return;
    }

    setEnviando(true);
    try {
      const resp = await inquilinoService.registrarVisitante({
        nombre_completo: nombre,
        documento_identidad: documento,
        placa: placa || undefined,
        hora_esperada: horaEsperada || ''
      });

      await recargarVisitantesInquilino();

      // NOTA (cambio): ya NO se redirige a "Mis Visitantes" — el usuario pidió
      // quedarse en este formulario tras registrar. La lista se recarga en el
      // fondo (recargarVisitantesInquilino) y se limpia el formulario para
      // registrar otro visitante; el toast confirma el éxito.
      showToast(`Visitante ${nombre} registrado exitosamente.`, 'success');
      addNotification('inquilino', 'Nuevo visitante', `Has registrado a ${nombre} como visitante.`, 'fa-user-plus', resp?.id_visitante ?? null);
      setNombre('');
      setDocumento('');
      setPlaca('');
      setHoraEsperada('');
    } catch (err) {
      console.error('Error al registrar visitante:', err);
      showToast('No se pudo registrar el visitante. Intenta de nuevo.', 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <PageHeader title="Registrar Visitante" />
      <div className="card">
        <form id="registrarVisitanteForm" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="visitanteNombre">Nombre completo *</label>
            <input
              type="text"
              id="visitanteNombre"
              required
              placeholder="Nombre completo del visitante"
              title="Solo letras, sin números"
              value={nombre}
              onChange={e => setNombre(e.target.value.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ '-]/g, ''))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="visitanteDocumento">Documento de identidad *</label>
            <input
              type="text"
              id="visitanteDocumento"
              required
              placeholder="Cédula o pasaporte"
              title="Cédula: 1-2345-6789 · pasaporte: alfanumérico"
              value={documento}
              onChange={e => cambiarDocumento(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="visitantePlaca">Placa (opcional)</label>
            <input
              type="text"
              id="visitantePlaca"
              placeholder="ABC-123"
              maxLength={7}
              title="Formato de placa de carro: ABC-123"
              value={placa}
              onChange={e => setPlaca(formatearPlaca(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="visitanteHoraEsperada">Hora esperada</label>
            <input type="time" id="visitanteHoraEsperada" value={horaEsperada} onChange={e => setHoraEsperada(e.target.value)} />
            {esParaManana() && (
              <small style={{ color: 'var(--accent)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                <i className="fas fa-info-circle"></i> Se programará para mañana
              </small>
            )}
          </div>
          <button type="submit" className="btn-primary" disabled={enviando} style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-2)' }}>
            {enviando ? 'Registrando...' : 'Registrar visitante'}
          </button>
        </form>
      </div>
    </>
  );
}

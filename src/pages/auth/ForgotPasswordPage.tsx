/**
 * ============================================================================
 * Archivo: ForgotPasswordPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla de recuperación de contraseña (paso 1: solicitar el enlace).
 * Consume el backend REAL: POST /api/auth/recuperar-solicitar.
 *
 * Flujo
 * 1. El usuario ingresa su correo real (el que usa para recibir correos:
 *    Inquilino → correo; Admin/Guarda → correo_contacto).
 * 2. El backend busca en ambos campos y SIEMPRE responde lo mismo (genérico)
 *    para no revelar si el correo existe: "Si el correo existe, recibirás
 *    instrucciones."
 * 3. Si el correo existe, llega un enlace con token (válido 10 min) a la
 *    dirección donde coincidió → el usuario abre /recuperar?token=...
 *
 * Reutiliza
 * - authService.solicitarRecuperacion (misma API que el resto de auth)
 * - useAlert (alerta personalizada de la app)
 * - Estilos .forgot-card / .form-content / .input-group / .login-btn-primary
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';
import { useAlert } from '../../components/Alert';

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const navigate = useNavigate();
  const { showAlert } = useAlert();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!REGEX_CORREO.test(email.trim())) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }

    setEnviando(true);
    try {
      // El backend responde SIEMPRE con el mismo mensaje genérico
      const respuesta = await authService.solicitarRecuperacion(email.trim());
      setEnviado(true);
      showAlert(respuesta.mensaje ?? 'Si el correo existe, recibirás instrucciones.', { titulo: 'Correo enviado', tipo: 'success' });
    } catch (err) {
      // 429 = demasiadas solicitudes; los demás errores muestran el mensaje del backend
      setError(err instanceof Error ? err.message : 'No se pudo procesar la solicitud. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="forgot-wrapper">
      <div className="forgot-card">
        <div className="form-content active" id="forgotContent">
          <div className="brand-icon">D</div>
          <h1>Recuperar contraseña</h1>
          <p>Ingresa el correo asociado a tu cuenta y te enviaremos un enlace para restablecer tu contraseña.</p>

          {!enviado ? (
            <form id="forgotForm" onSubmit={handleSubmit}>
              {error && <p className="error">{error}</p>}
              <div className="input-group">
                <label htmlFor="reset-email">E-MAIL</label>
                <input
                  type="email"
                  id="reset-email"
                  placeholder="Ingresa tu correo electrónico"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={enviando}
                />
              </div>

              <button type="submit" className="login-btn-primary" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar enlace'}
              </button>

              <div className="form-footer">
                <a href="/login" onClick={e => { e.preventDefault(); navigate('/login'); }}>Volver a iniciar sesión</a>
              </div>
            </form>
          ) : (
            <div>
              <p className="success">Revisa tu correo. Si la cuenta existe, recibirás un enlace para restablecer tu contraseña (válido por 10 minutos).</p>
              <button
                type="button"
                className="login-btn-primary"
                onClick={() => navigate('/login')}
              >
                Volver a iniciar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

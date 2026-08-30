/**
 * ============================================================================
 * Archivo: RecuperarPasswordPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla de recuperación de contraseña (paso 2: restablecer con el token).
 * Lee el token del enlace recibido por correo (/recuperar?token=...) y llama
 * a POST /api/auth/recuperar-restablecer.
 *
 * Flujo
 * 1. El usuario abre el enlace del correo → esta página se monta con ?token=.
 * 2. Ingresa y confirma su nueva contraseña (se valida la MISMA política que
 *    el backend: mín 8, mayúscula, minúscula, número y símbolo).
 * 3. Si el token es válido (no usado, no expirado, menos de 10 min), el
 *    backend actualiza la contraseña y el token queda usado → se redirige a
 *    /login (NO al dashboard: el usuario debe iniciar sesión de nuevo, pasando
 *    por el 2FA si aplica).
 * 4. Token inválido/expirado → mensaje claro con enlace para solicitar uno nuevo.
 *
 * Reutiliza
 * - authService.restablecerContrasena
 * - useAlert (alerta personalizada de la app)
 * - Estilos .forgot-card / .form-content / .input-group / .login-btn-primary
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authService } from '../../services/authService';
import { useAlert } from '../../components/Alert';

// Misma política que el backend (authController): mín 8, mayúscula, minúscula, número, símbolo
const REGEX_CONTRASENA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const MENSAJE_POLITICA = 'Debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo (@$!%*?&).';

export default function RecuperarPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const { showAlert } = useAlert();

  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [showNuevaContrasena, setShowNuevaContrasena] = useState(false);
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [showConfirmarContrasena, setShowConfirmarContrasena] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Si el enlace vino sin token, no tiene sentido mostrar el formulario
  const tokenInvalido = !token.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!REGEX_CONTRASENA.test(nuevaContrasena)) {
      setError(`La contraseña no cumple la política. ${MENSAJE_POLITICA}`);
      return;
    }
    if (nuevaContrasena !== confirmarContrasena) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setEnviando(true);
    try {
      await authService.restablecerContrasena(token, nuevaContrasena);
      showAlert('Contraseña actualizada correctamente. Inicia sesión nuevamente.', { titulo: 'Contraseña actualizada', tipo: 'success' });
      // Redirigir a /login (NO al dashboard): el flujo 2FA aplica de nuevo al iniciar sesión
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="forgot-wrapper">
      <div className="forgot-card">
        <div className="form-content active" id="recuperarContent">
          <div className="brand-icon">D</div>
          <h1>Nueva contraseña</h1>

          {tokenInvalido ? (
            <div>
              <p>El enlace de recuperación es inválido o está incompleto.</p>
              <p className="success" style={{ marginTop: 16 }}>
                Solicita uno nuevo desde la pantalla de recuperación.
              </p>
              <button
                type="button"
                className="login-btn-primary"
                onClick={() => navigate('/forgot')}
              >
                Solicitar nuevo enlace
              </button>
              <div className="form-footer">
                <Link to="/login">Volver a iniciar sesión</Link>
              </div>
            </div>
          ) : (
            <form id="recuperarForm" onSubmit={handleSubmit}>
              <p>Ingresa tu nueva contraseña. {MENSAJE_POLITICA}</p>

              {error && <p className="error">{error}</p>}

              <div className="input-group">
                <label htmlFor="nueva-contrasena">NUEVA CONTRASEÑA</label>
                <div className="password-field">
                  <input
                    type={showNuevaContrasena ? 'text' : 'password'}
                    id="nueva-contrasena"
                    placeholder="Ingresa tu nueva contraseña"
                    value={nuevaContrasena}
                    onChange={e => setNuevaContrasena(e.target.value)}
                    disabled={enviando}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showNuevaContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowNuevaContrasena(v => !v)}
                  >
                    <i className={`fas ${showNuevaContrasena ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="confirmar-contrasena">CONFIRMAR CONTRASEÑA</label>
                <div className="password-field">
                  <input
                    type={showConfirmarContrasena ? 'text' : 'password'}
                    id="confirmar-contrasena"
                    placeholder="Repite tu nueva contraseña"
                    value={confirmarContrasena}
                    onChange={e => setConfirmarContrasena(e.target.value)}
                    disabled={enviando}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showConfirmarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowConfirmarContrasena(v => !v)}
                  >
                    <i className={`fas ${showConfirmarContrasena ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <button type="submit" className="login-btn-primary" disabled={enviando}>
                {enviando ? 'Guardando…' : 'Restablecer contraseña'}
              </button>

              <div className="form-footer">
                <Link to="/login">Volver a iniciar sesión</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * Archivo: TwoFactorPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla de verificación en dos pasos (2FA) con backend REAL:
 *   1. Al montar (con sesión), llama a POST /api/auth/2fa/send → el backend
 *      genera el código de 6 dígitos y lo envía por correo real (Gmail SMTP)
 *      al correo del usuario (Inquilino → correo principal; Admin/Guarda →
 *      correo_contacto).
 *   2. El usuario ingresa el código; POST /api/auth/2fa/verify lo valida.
 *      Si es correcto, el backend devuelve el JWT DEFINITIVO (2faVerified: true)
 *      y se reemplaza el token temporal.
 *   3. El código expira según `expira_en` del backend (5 min).
 *   4. Se permiten 3 intentos fallidos por código; al agotarlos se bloquea la
 *      verificación hasta reenviar (el backend también lo enforce con 429).
 *      Los errores de red/5xx NO consumen intentos.
 *   5. REGLA DE REENVÍO: el botón "Reenviar código" SOLO está disponible tras
 *      agotar los 3 intentos, si el código expiró o si el envío inicial falló.
 *      Mientras haya un código vigente con intentos disponibles NO se genera
 *      otro código (el backend responde "ya_enviado" con el tiempo restante).
 *
 * NOTA (Rules of Hooks): todos los hooks se declaran antes de los early returns
 * para mantener el mismo orden de hooks en cada render (incluye el caso de
 * recargar /2fa mientras se restaura la sesión guardada con isRestoring).
 * ============================================================================
 */

import { useState, useEffect, useRef, type FormEvent, type ClipboardEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';
import { ApiError, rutaPorRol } from '../../services/apiClient';

const TIEMPO_EXPIRACION = 300; // 5 minutos en segundos (fallback; el backend manda expira_en)
const INTENTOS_MAXIMOS = 3;    // intentos fallidos permitidos por código

function formatoTiempo(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}:${seg.toString().padStart(2, '0')}`;
}

export default function TwoFactorPage() {
  const navigate = useNavigate();
  const { usuario, isRestoring, completar2FA } = useAuth();

  const [codigo, setCodigo] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState(TIEMPO_EXPIRACION);
  const [intentosFallidos, setIntentosFallidos] = useState(0);
  const [bloqueado, setBloqueado] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Evita el auto-envío doble: en desarrollo React StrictMode ejecuta los
  // efectos dos veces al montar, y si el objeto `usuario` cambia de identidad
  // el efecto se re-ejecutaría. Sin este guard se enviarían 2 peticiones
  // POST /2fa/send (2 códigos / 2 correos). Solo se permite UN auto-envío
  // por montaje de la página.
  const autoEnviadoRef = useRef(false);

  // --- Envío automático del código (cuando ya hay sesión) ---
  useEffect(() => {
    if (!usuario) return; // espera a que la sesión se restaure (isRestoring)
    // Guard contra el doble envío: en desarrollo React StrictMode ejecuta los
    // efectos dos veces al montar, y si `usuario` cambia de identidad el efecto
    // se re-ejecutaría. Sin este guard se dispararían 2 POST /2fa/send (2
    // códigos / 2 correos). Solo se permite UN auto-envío por montaje.
    //
    // NOTA: NO se usa el patrón `activo` (cleanup) aquí. Como el ref evita el
    // segundo disparo, el cleanup de StrictMode pondría `activo = false` y
    // descartaría la respuesta del ÚNICO envío (sin notificación y con el
    // estado enviandoCodigo colgado). React 18 ignora de forma segura los
    // setState de componentes ya desmontados, así que no hace falta esa bandera.
    if (autoEnviadoRef.current) return;
    autoEnviadoRef.current = true;

    const enviarInicial = async () => {
      setEnviandoCodigo(true);
      try {
        const respuesta = await authService.reenviarCodigo2FA({ auto: true });
        setCodigoEnviado(true);
        // Sincroniza el contador local con los intentos que el backend ya cuenta
        // (al recargar /2fa con intentos usados, "ya_enviado" trae intentos_restantes).
        setIntentosFallidos(Math.max(0, INTENTOS_MAXIMOS - (respuesta.intentos_restantes ?? INTENTOS_MAXIMOS)));
        setTiempoRestante(respuesta.expira_en > 0 ? respuesta.expira_en : TIEMPO_EXPIRACION);
        setMensajeExito(
          respuesta.ya_enviado
            ? 'Ya tienes un código activo en tu correo. Revísalo e ingrésalo.'
            : 'Hemos enviado un código de 6 dígitos a tu correo.',
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          // El backend indica que ya se agotaron los 3 intentos (p. ej. al
          // recargar /2fa estando bloqueado): se muestra el bloqueo y solo
          // queda disponible "Reenviar código".
          setCodigoEnviado(true);
          setBloqueado(true);
          setIntentosFallidos(INTENTOS_MAXIMOS);
          const datos = err.data as { expira_en?: number } | undefined;
          if (typeof datos?.expira_en === 'number' && datos.expira_en > 0) {
            setTiempoRestante(datos.expira_en);
          }
          setError('Agotaste los 3 intentos. Solicita un nuevo código.');
        } else {
          setError(err instanceof Error ? err.message : 'No se pudo enviar el código. Inténtalo de nuevo.');
        }
      } finally {
        setEnviandoCodigo(false);
      }
    };
    void enviarInicial();
  }, [usuario]);

  // --- Contador regresivo (solo mientras hay un código vigente) ---
  useEffect(() => {
    if (!codigoEnviado || tiempoRestante <= 0) return;

    if (intervaloRef.current) clearInterval(intervaloRef.current);

    intervaloRef.current = setInterval(() => {
      setTiempoRestante(prev => {
        if (prev <= 1) {
          if (intervaloRef.current) clearInterval(intervaloRef.current);
          intervaloRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervaloRef.current) {
        clearInterval(intervaloRef.current);
        intervaloRef.current = null;
      }
    };
  }, [codigoEnviado, tiempoRestante]);

  const handleInput = (index: number, value: string) => {
    // Limpiar mensajes al escribir
    if (error) setError('');
    if (mensajeExito) setMensajeExito('');

    // Solo permitir dígitos
    if (!/^\d$/.test(value)) {
      return;
    }

    const nuevoCodigo = [...codigo];
    nuevoCodigo[index] = value;
    setCodigo(nuevoCodigo);

    // Avanzar al siguiente input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (codigo[index]) {
        // Borrar el dígito actual
        const nuevoCodigo = [...codigo];
        nuevoCodigo[index] = '';
        setCodigo(nuevoCodigo);
      } else if (index > 0) {
        // Retroceder al input anterior
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const textoPegado = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (textoPegado.length === 0) return;

    const nuevoCodigo = [...codigo];
    for (let i = 0; i < textoPegado.length; i++) {
      nuevoCodigo[i] = textoPegado[i];
    }
    setCodigo(nuevoCodigo);

    // Enfocar el siguiente input vacío o el último
    const siguienteVacio = nuevoCodigo.findIndex(c => !c);
    const indiceEnfoque = siguienteVacio >= 0 ? siguienteVacio : 5;
    inputRefs.current[indiceEnfoque]?.focus();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMensajeExito('');

    const codigoCompleto = codigo.join('');

    if (codigoCompleto.length < 6) {
      setError('Ingresa los 6 dígitos.');
      return;
    }

    if (!codigoEnviado) {
      setError('Solicita primero el envío del código.');
      return;
    }

    if (bloqueado) {
      setError('Agotaste los 3 intentos. Solicita un nuevo código.');
      return;
    }

    if (tiempoRestante <= 0) {
      setError('El código ha expirado. Solicita uno nuevo.');
      return;
    }

    setVerificando(true);
    try {
      const resultado = await authService.verificarCodigo2FA(codigoCompleto);
      completar2FA(resultado.token);

      // Redirige según el rol: Administrador → /admin, Guarda → /guardia, Inquilino → /inquilino
      navigate(rutaPorRol(usuario?.rol ?? 'Inquilino'), { replace: true });
    } catch (err) {
      // Solo los 400/429 (código inválido o bloqueado por el backend) consumen
      // un intento; un error de red o 5xx NO debe penalizar al usuario.
      if (err instanceof ApiError && (err.status === 400 || err.status === 429)) {
        const nuevosIntentos = intentosFallidos + 1;
        setIntentosFallidos(nuevosIntentos);

        if (nuevosIntentos >= INTENTOS_MAXIMOS) {
          setBloqueado(true);
          setError('Código inválido. Agotaste los 3 intentos: solicita un nuevo código.');
        } else {
          setError(`${err.message} Te quedan ${INTENTOS_MAXIMOS - nuevosIntentos} intentos.`);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Error al verificar el código.');
      }
    } finally {
      setVerificando(false);
    }
  };

  const handleResend = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!puedeReenviar || enviandoCodigo) return;
    setError('');
    setMensajeExito('');
    setEnviandoCodigo(true);

    try {
      // Reenvío MANUAL (sin auto): el backend solo permite generar otro código
      // porque el usuario está bloqueado, el código expiró o el envío inicial
      // falló — el propio botón no está disponible en otros casos.
      const respuesta = await authService.reenviarCodigo2FA();
      setCodigoEnviado(true);
      setIntentosFallidos(0);
      setBloqueado(false);
      setTiempoRestante(respuesta.expira_en > 0 ? respuesta.expira_en : TIEMPO_EXPIRACION);
      setMensajeExito('Nuevo código enviado a tu correo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reenviar el código.');
    } finally {
      setEnviandoCodigo(false);
    }
  };

  // REGLA DE REENVÍO: el botón solo está disponible cuando el usuario agotó
  // los 3 intentos (bloqueado), cuando el código expiró (tiempo <= 0) o cuando
  // el envío inicial falló (!codigoEnviado). Mientras haya un código vigente
  // con intentos disponibles NO se puede reenviar (el backend también lo
  // enforce respondiendo "ya_enviado").
  const puedeReenviar =
    !enviandoCodigo &&
    !verificando &&
    (bloqueado || !codigoEnviado || tiempoRestante <= 0);

  // --- Guardias de render (después de todos los hooks: Rules of Hooks) ---
  if (isRestoring) {
    // Restaurando una sesión guardada: esperar antes de decidir
    return null;
  }
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="twofa-wrapper">
      <div className="twofa-card">
        <div className="form-content active" id="twofaContent">

          <div className="security-icon">
            <i className="bi bi-shield-lock-fill"></i>
          </div>

          <h1>Verificación de seguridad</h1>

          <p className={`timer${tiempoRestante <= 30 && tiempoRestante > 0 ? ' timer-warning' : ''}`}>
            Hemos enviado un código de 6 dígitos a tu correo electrónico.{' '}
            <span style={{ display: 'inline-block', minWidth: 50 }}>
              ({formatoTiempo(tiempoRestante)})
            </span>
            {tiempoRestante <= 30 && tiempoRestante > 0 && ' El código está por expirar.'}
            {tiempoRestante <= 0 && ' El código expiró. Solicita uno nuevo.'}
          </p>

          {intentosFallidos > 0 && !bloqueado && (
            <p className="error" style={{ marginBottom: 8, fontSize: 13 }}>
              Intentos restantes: {INTENTOS_MAXIMOS - intentosFallidos} de {INTENTOS_MAXIMOS}
            </p>
          )}

          <form id="twofaForm" onSubmit={handleSubmit}>
            {error && <p className="error">{error}</p>}
            {mensajeExito && <p className="success">{mensajeExito}</p>}

            <div className="code-inputs">
              {codigo.map((digito, index) => (
                <input key={index} type="text" maxLength={1} pattern="[0-9]" inputMode="numeric" placeholder="0"
                  value={digito}
                  ref={el => { inputRefs.current[index] = el; }}
                  onChange={e => handleInput(index, e.target.value)}
                  onKeyDown={e => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  disabled={verificando}
                />
              ))}
            </div>

            <button
              type="submit"
              className="login-btn-primary"
              disabled={verificando || enviandoCodigo || bloqueado}
              style={{ opacity: verificando || enviandoCodigo || bloqueado ? 0.5 : 1 }}
            >
              {verificando ? 'Verificando…' : 'Verificar código'}
            </button>

            <div className="twofa-actions">
              <button
                type="button"
                className="login-btn-secondary"
                id="resendCode"
                onClick={handleResend}
                disabled={!puedeReenviar}
                style={{ opacity: puedeReenviar ? 1 : 0.4 }}
              >
                {enviandoCodigo ? 'Enviando…' : 'Reenviar código'}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}

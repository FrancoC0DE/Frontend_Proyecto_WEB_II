/**
 * ============================================================================
 * Archivo: LoginPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla de inicio de sesión y registro. Permite al usuario iniciar
 * sesión con correo y contraseña, o crear una cuenta nueva.
 *
 * Componentes que utiliza
 * - useAuth (contexto de autenticación)
 * - authService (servicio de autenticación real contra el backend)
 * - React Router (navegación)
 *
 * Flujo
 * 1. Usuario ingresa credenciales
 * 2. Se validan los campos localmente
 * 3. authService.iniciarSesion() verifica el dominio del correo
 * 4. Se guarda el usuario en el contexto global
 * 5. Redirecciona a /2fa para verificación de dos pasos
 *
 * Credenciales de prueba
 * - admin@admin.com → Administrador
 * - guardia@guardia.com → Guardia
 * - cualquier@correo.com → Inquilino
 *
 * Cambios para Backend
 * Cuando exista el backend, esta página deberá:
 * ✓ Consumir POST /api/auth/login
 * ✓ Mostrar errores HTTP específicos (400, 401, 403)
 * ✓ Soporte para "¿Olvidaste tu contraseña?" real
 *
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';
import { formatearCedula, formatearTelefono, validarCedula, validarTelefono } from '../../utils/formatters';

// Misma política que RecuperarPasswordPage y el backend (authController):
// mín 8 caracteres con mayúscula, minúscula, número y símbolo (@$!%*?&).
const REGEX_CONTRASENA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cedula, setCedula] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null);
  const [mensajeLogin, setMensajeLogin] = useState<string | null>(null);
  const { guardarUsuarioParcial } = useAuth();
  const navigate = useNavigate();

  const activateTab = (tabName: 'signin' | 'signup') => {
    setIsSignUp(tabName === 'signup');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLogin(null);
    setMensajeLogin(null);

    if (!loginEmail.includes('@')) {
      setErrorLogin('Please enter a valid email address.');
      return;
    }
    if (!loginPassword.trim()) {
      setErrorLogin('Password cannot be empty.');
      return;
    }

    try {
      // Flujo real: el backend valida credenciales y devuelve el JWT (8h)
      const { token, usuario } = await authService.iniciarSesion({
        correo: loginEmail,
        contrasena: loginPassword,
      });
      guardarUsuarioParcial(usuario, token);
      navigate('/2fa');
    } catch (err) {
      setErrorLogin(err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorRegistro(null);

    if (signupPassword !== confirmPassword) {
      setErrorRegistro('Passwords do not match.');
      return;
    }

    if (!REGEX_CONTRASENA.test(signupPassword)) {
      setErrorRegistro('Password must have at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character (@$!%*?&).');
      return;
    }

    if (!termsAccepted) {
      setErrorRegistro('You must accept the terms of service.');
      return;
    }

    // Mismas validaciones de formato que el módulo Personal del admin:
    // cédula 1-2345-6789 (9 dígitos) y teléfono 7777-7777 (8 dígitos).
    // La CÉDULA es OBLIGATORIA: el inquilino la necesita para que el admin le
    // asigne un contrato (sp_Contrato_Insertar la busca por cédula).
    if (!cedula.trim()) {
      setErrorRegistro('La cédula es obligatoria.');
      return;
    }
    const errorTelefono = validarTelefono(phone);
    if (errorTelefono) {
      setErrorRegistro(errorTelefono);
      return;
    }
    const errorCedula = validarCedula(cedula);
    if (errorCedula) {
      setErrorRegistro(errorCedula);
      return;
    }

    try {
      // Flujo real: el registro no devuelve token → se envía al login
      await authService.registrarUsuario({
        nombreCompleto: fullName,
        correo: signupEmail,
        contrasena: signupPassword,
        telefono: phone || undefined,
        cedula,
      });
      setErrorRegistro(null);
      setMensajeLogin('Cuenta creada exitosamente. Inicia sesión con tu correo.');
      setFullName('');
      setSignupEmail('');
      setSignupPassword('');
      setConfirmPassword('');
      setPhone('');
      setCedula('');
      setTermsAccepted(false);
      activateTab('signin');
    } catch (err) {
      setErrorRegistro(err instanceof Error ? err.message : 'Registration failed.');
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card" id="mainCard">
        {/* Panel Visual */}
        <div className="panel panel-visual" id="panelVisual">
          <div className="visual-content">
            <div className="brand-icon"><i className="fas fa-building"></i></div>
            <h1>Condominium</h1>
            <p>Smart management for your condominium.</p>
            <div className="tagline">Simple • Secure • Efficient</div>
          </div>
        </div>

        {/* Panel del Formulario */}
        <div className="panel panel-form" id="panelForm">
          <div className="form-wrapper">
            {/* Título y subtítulo dinámicos */}
            <h2 className="form-title" id="formTitle">
              {isSignUp ? 'Everything your condominium needs, in one place.' : 'Welcome Back'}
            </h2>
            <p className="form-subtitle" id="formSubtitle">Please enter your details</p>

            {/* Toggle estilo Apple */}
            <div className="toggle-container">
              <div className="toggle" id="toggle">
                <span className={`toggle-slider ${isSignUp ? 'right' : ''}`} id="toggleSlider"></span>
                <span
                  className={`toggle-option ${!isSignUp ? 'active' : ''}`}
                  data-tab="signin"
                  onClick={() => activateTab('signin')}
                >
                  Sign In
                </span>
                <span
                  className={`toggle-option ${isSignUp ? 'active' : ''}`}
                  data-tab="signup"
                  onClick={() => activateTab('signup')}
                >
                  Sign Up
                </span>
              </div>
            </div>

            {/* SIGN IN */}
            <form id="signinForm" className={`form-content ${!isSignUp ? 'active' : ''}`} onSubmit={handleSignIn}>
              {errorLogin && <p className="error">{errorLogin}</p>}
              {mensajeLogin && <p className="success">{mensajeLogin}</p>}
              <div className="input-group">
                <label htmlFor="login-email">E-MAIL</label>
                <input
                  type="email"
                  id="login-email"
                  placeholder="Enter your email address"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label htmlFor="login-password">PASSWORD</label>
                <div className="password-field">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    id="login-password"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowLoginPassword(v => !v)}
                  >
                    <i className={`fas ${showLoginPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
              <div className="forgot-password">
                <a href="/forgot" onClick={e => { e.preventDefault(); navigate('/forgot'); }}>Forgot your password?</a>
              </div>
              <button type="submit" className="login-btn-primary">Sign In</button>
              <div className="form-footer">
                <a id="signupTrigger" onClick={() => activateTab('signup')}>Create an account</a>
              </div>
            </form>

            {/* SIGN UP */}
            <form id="signupForm" className={`form-content ${isSignUp ? 'active' : ''}`} onSubmit={handleSignUp}>
              <div className="input-group">
                <label htmlFor="nombre_completo">FULL NAME</label>
                <input
                  type="text"
                  id="nombre_completo"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label htmlFor="cedula">CÉDULA</label>
                <input
                  type="text"
                  id="cedula"
                  placeholder="1-2345-6789"
                  maxLength={11}
                  value={cedula}
                  onChange={e => setCedula(formatearCedula(e.target.value))}
                />
              </div>
              <div className="input-group">
                <label htmlFor="contraseña_hash">PASSWORD</label>
                <div className="password-field">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    id="contraseña_hash"
                    placeholder="Enter your password"
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showSignupPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowSignupPassword(v => !v)}
                  >
                    <i className={`fas ${showSignupPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <small className="form-hint">
                  Mínimo 8 caracteres con una mayúscula, una minúscula, un número y un símbolo (@$!%*?&).
                </small>
              </div>
              <div className="input-group">
                <label htmlFor="confirm_password">CONFIRM PASSWORD</label>
                <div className="password-field">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirm_password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowConfirmPassword(v => !v)}
                  >
                    <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
              <div className="input-group">
                <label htmlFor="correo">E-MAIL</label>
                <input
                  type="email"
                  id="correo"
                  placeholder="Enter your email address"
                  value={signupEmail}
                  onChange={e => setSignupEmail(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label htmlFor="telefono">Phone</label>
                <input
                  type="tel"
                  id="telefono"
                  placeholder="7777-7777"
                  maxLength={9}
                  value={phone}
                  onChange={e => setPhone(formatearTelefono(e.target.value))}
                />
              </div>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                />
                <label htmlFor="terms">I agree all statements in <a href="#" onClick={e => e.preventDefault()}>terms of service</a></label>
              </div>
              {errorRegistro && <p className="error">{errorRegistro}</p>}
              <button type="submit" className="login-btn-primary">Sign Up</button>
              <div className="form-footer">
                <a id="signinTrigger" onClick={() => activateTab('signin')}>I'm already a member</a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

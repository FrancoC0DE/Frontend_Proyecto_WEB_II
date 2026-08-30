/**
 * ============================================================================
 * Archivo: ProfileDrawer.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Drawer que muestra el perfil del usuario conectado al backend real:
 * - Al abrirse carga los datos con GET /api/perfil (sp_ObtenerPerfil).
 * - Permite editar nombre, teléfono y el correo correspondiente al rol:
 *     Inquilino            → correo (correo_contacto no aparece)
 *     Administrador/Guarda → correo_contacto (el correo de acceso se muestra
 *                            deshabilitado y no se puede modificar)
 * - Gestión de foto de perfil con doble entrada:
 *     - Pegar una URL pública (http/https) → se guarda directo en foto_perfil.
 *     - Subir un archivo (multipart) → el backend la guarda en
 *       uploads/avatars/ y devuelve la ruta /uploads/avatars/...
 * - Cambio de contraseña validando la actual contra el backend (bcrypt).
 *
 * Props que recibe
 * - isOpen: boolean          → Controla si se muestra
 * - onClose: () => void      → Cierra el drawer
 * - profile: ProfileData     → Datos del AuthContext (fallback mientras carga)
 * - onSave: (data) => void   → Sincroniza el perfil en el AuthContext
 * - onAvatarUpdate: (src) => void → Actualiza el avatar en el AuthContext
 * - role?: string            → nombre_rol del backend (fallback antes de cargar)
 *
 * Quién lo utiliza
 * - AdminLayout, GuardiaLayout, InquilinoLayout
 *
 * ============================================================================
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import Drawer from './Drawer';
import { useToast } from './Toast';
import { ApiError } from '../services/apiClient';
import { perfilService, buildAvatarUrl } from '../services/perfilService';
import type { ProfileData } from '../types';

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProfileData;
  onSave: (data: Partial<ProfileData>) => void;
  onAvatarUpdate: (src: string) => void;
  /** nombre_rol del backend: 'Administrador' | 'Guarda' | 'Inquilino' */
  role?: string;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Valida un formato de email básico: usuario@dominio.ext */
const esEmailValido = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default function ProfileDrawer({
  isOpen, onClose, profile, onSave, onAvatarUpdate, role,
}: ProfileDrawerProps) {
  const { showToast } = useToast();

  // --- Estado del formulario ---
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);

  const [nombre, setNombre] = useState(profile.nombre);
  const [telefono, setTelefono] = useState(profile.telefono);
  const [fotoPerfil, setFotoPerfil] = useState(profile.avatar);
  const [correo, setCorreo] = useState(profile.correo);
  const [correoContacto, setCorreoContacto] = useState('');
  const [rol, setRol] = useState(role ?? '');

  // Input de URL del avatar (texto libre). Siempre inicia vacío: no debe
  // mostrar la ruta del backend (/uploads/...) ni el avatar existente; solo
  // contiene lo que el usuario escriba para pegar una URL externa.
  const [avatarUrl, setAvatarUrl] = useState('');

  // --- Cambio de contraseña ---
  const [contrasenaActual, setContrasenaActual] = useState('');
  const [showContrasenaActual, setShowContrasenaActual] = useState(false);
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [showNuevaContrasena, setShowNuevaContrasena] = useState(false);
  const [cambiandoContrasena, setCambiandoContrasena] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref para onSave: evita que cargarPerfil (useCallback con deps estables)
  // cambie de identidad cuando AuthContext re-renderiza y cree un nuevo
  // updateProfile (eso dispararía el efecto en bucle).
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Es Inquilino → solo puede editar `correo`; si no → solo `correo_contacto`
  const esInquilino = rol === 'Inquilino';

  // -------------------------------------------------------------------------
  // Carga de datos reales del backend al abrir el drawer
  // -------------------------------------------------------------------------
  const cargarPerfil = useCallback(async () => {
    // Limpiar los campos de contraseña al abrir (evita valores residuales)
    setContrasenaActual('');
    setNuevaContrasena('');
    setCargando(true);
    try {
      const perfil = await perfilService.obtenerPerfil();
      setNombre(perfil.nombre_completo ?? '');
      setTelefono(perfil.telefono ?? '');
      setFotoPerfil(perfil.foto_perfil ?? '');
      // NOTA: NO se rellena avatarUrl con la ruta del backend (el input de
      // pegar URL debe quedar limpio; la imagen se ve en la previsualización).
      setAvatarUrl('');
      setCorreo(perfil.correo ?? '');
      setCorreoContacto(perfil.correo_contacto ?? '');
      setRol(perfil.nombre_rol ?? role ?? '');

      // Reflejar en el AuthContext (Navbar) los datos reales del backend:
      // así el avatar y el nombre del usuario se muestran apenas se abre el
      // drawer (y persisten al recargar), sin depender de un guardado manual.
      onSaveRef.current({
        nombre: perfil.nombre_completo ?? '',
        telefono: perfil.telefono ?? '',
        avatar: buildAvatarUrl(perfil.foto_perfil ?? ''),
        ...(perfil.nombre_rol === 'Inquilino' ? { correo: perfil.correo ?? '' } : {}),
      });
    } catch (error) {
      // Si el backend falla, se conservan los datos del prop (fallback)
      console.error('No se pudo cargar el perfil:', error);
      const mensaje = error instanceof ApiError
        ? error.message
        : 'No se pudo cargar el perfil. Revisa la conexión con el servidor.';
      showToast(mensaje, 'error');
    } finally {
      setCargando(false);
    }
  }, [role, showToast]);

  // Cada vez que se abre el drawer → recargar + limpiar contraseñas.
  // El defer con setTimeout evita setState síncrono dentro del efecto
  // (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => { void cargarPerfil(); }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, cargarPerfil]);

  // -------------------------------------------------------------------------
  // Guardar cambios (PUT /api/perfil)
  // -------------------------------------------------------------------------
  const handleSave = async () => {
    if (guardando) return;
    if (!nombre.trim()) {
      showToast('El nombre es obligatorio', 'error');
      return;
    }

    setGuardando(true);
    try {
      // Solo se envía el campo de correo correspondiente al rol
      const payload: {
        nombre_completo: string;
        telefono: string | null;
        foto_perfil: string | null;
        correo?: string;
        correo_contacto?: string;
      } = {
        nombre_completo: nombre.trim(),
        telefono: telefono.trim() || null,
        foto_perfil: fotoPerfil || null,
      };
      if (esInquilino) {
        const email = correo.trim();
        if (!email) {
          showToast('El correo es obligatorio', 'error');
          return;
        }
        if (!esEmailValido(email)) {
          showToast('Ingresa un correo electrónico válido (usuario@dominio.com)', 'error');
          return;
        }
        payload.correo = email;
      } else {
        const emailContacto = correoContacto.trim();
        // correo_contacto es opcional, pero si se escribe debe ser válido
        if (emailContacto && !esEmailValido(emailContacto)) {
          showToast('Ingresa un correo de contacto válido (usuario@dominio.com)', 'error');
          return;
        }
        payload.correo_contacto = emailContacto;
      }

      await perfilService.actualizarPerfil(payload);

      // Sincronizar el AuthContext (Navbar) con los datos guardados.
      // El avatar se guarda SIEMPRE como URL completa (externa o BASE_URL + ruta)
      // para que el <img> del Navbar la muestre sin depender de la ruta local.
      onSave({
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        avatar: buildAvatarUrl(fotoPerfil),
        ...(esInquilino ? { correo: correo.trim() } : {}),
      });

      showToast('Perfil actualizado correctamente', 'success');
      onClose();
    } catch (error) {
      const mensaje = error instanceof ApiError
        ? error.message
        : 'No se pudo guardar el perfil. Inténtalo nuevamente.';
      showToast(mensaje, 'error');
    } finally {
      setGuardando(false);
    }
  };

  // -------------------------------------------------------------------------
  // Foto de perfil: pegar URL
  // -------------------------------------------------------------------------
  const aplicarAvatarUrl = () => {
    const url = avatarUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      showToast('Ingresa una URL válida que comience con http:// o https://', 'error');
      return;
    }
    setFotoPerfil(url);
    // Vista previa inmediata en el Navbar
    onAvatarUpdate(buildAvatarUrl(url));
    showToast('URL aplicada. Guarda los cambios para confirmar.', 'info');
  };

  // -------------------------------------------------------------------------
  // Foto de perfil: subir archivo
  // -------------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpiar el input para poder re-subir el mismo archivo luego
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!file) return;

    if (!MIME_PERMITIDOS.includes(file.type)) {
      showToast('Solo se permiten imágenes (JPG, PNG, GIF, WEBP)', 'error');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showToast('La imagen supera el tamaño máximo de 2 MB', 'error');
      return;
    }

    setSubiendoAvatar(true);
    try {
      const resp = await perfilService.uploadAvatar(file);
      setFotoPerfil(resp.foto_perfil);
      // NOTA: no se rellena el input de URL con la ruta del backend (se mantiene
      // limpio; la previsualización muestra la imagen subida).
      setAvatarUrl('');
      // Vista previa inmediata en el Navbar
      onAvatarUpdate(buildAvatarUrl(resp.foto_perfil));
      showToast('Imagen subida. Guarda los cambios para confirmar.', 'success');
    } catch (error) {
      const mensaje = error instanceof ApiError
        ? error.message
        : 'No se pudo subir la imagen. Inténtalo nuevamente.';
      showToast(mensaje, 'error');
    } finally {
      setSubiendoAvatar(false);
    }
  };

  // -------------------------------------------------------------------------
  // Cambiar contraseña (PUT /api/perfil/cambiar-contrasena)
  // -------------------------------------------------------------------------
  const handleChangePassword = async () => {
    if (cambiandoContrasena) return;
    if (!contrasenaActual || !nuevaContrasena) {
      showToast('Completa la contraseña actual y la nueva', 'error');
      return;
    }
    if (nuevaContrasena.length < 6) {
      showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }

    setCambiandoContrasena(true);
    try {
      await perfilService.cambiarContrasena(contrasenaActual, nuevaContrasena);
      setContrasenaActual('');
      setNuevaContrasena('');
      showToast('Contraseña actualizada correctamente', 'success');
    } catch (error) {
      const mensaje = error instanceof ApiError
        ? error.message
        : 'No se pudo cambiar la contraseña. Inténtalo nuevamente.';
      showToast(mensaje, 'error');
    } finally {
      setCambiandoContrasena(false);
    }
  };

  // URL final del avatar para el <img> (externa o local construida con BASE_URL)
  const avatarSrc = fotoPerfil ? buildAvatarUrl(fotoPerfil) : '';
  const inicial = (nombre || profile.nombre).charAt(0).toUpperCase();

  return (
    <Drawer isOpen={isOpen} onClose={onClose}
      title="Mi Perfil" size="md"
      onSave={handleSave} saveText={guardando ? 'Guardando…' : 'Guardar cambios'}>
      {cargando && (
        <p className="drawer-loading" role="status">Cargando perfil…</p>
      )}

      {/* --- Foto de perfil --- */}
      <div className="profile-avatar-section">
        <div className="profile-avatar" id="profileAvatar">
          {avatarSrc ? (
            <img
              id="profileAvatarImg"
              src={avatarSrc}
              alt="Foto de perfil"
              style={{ display: 'block' }}
            />
          ) : (
            <span className="fallback" id="profileAvatarFallback">
              {inicial}
            </span>
          )}
          {subiendoAvatar && <span className="avatar-uploading">Subiendo…</span>}
        </div>
        <div className="profile-avatar-controls">
          <div className="url-input-group">
            <input
              type="text"
              id="profileAvatarUrl"
              placeholder="Pega una URL de imagen (http/https)"
              value={avatarUrl}
              onChange={e => setAvatarUrl(e.target.value)}
            />
            <button className="btn-primary" id="applyAvatarUrl" onClick={aplicarAvatarUrl}>
              Aplicar URL
            </button>
          </div>
          <div className="file-input-wrapper">
            <label htmlFor="profileAvatarFile" className="file-label">
              <i className="fas fa-upload"></i> Subir archivo
            </label>
            <input
              type="file"
              id="profileAvatarFile"
              accept="image/jpeg,image/png,image/gif,image/webp"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>
        </div>
        <p className="avatar-hint">Máximo 2 MB. JPG, PNG, GIF o WEBP.</p>
      </div>

      {/* --- Información personal --- */}
      <div className="form-section">
        <h4>Información personal</h4>
        <div className="form-group">
          <label>Nombre</label>
          <input type="text" id="profileName"
            value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>

        {esInquilino ? (
          <div className="form-group">
            <label>Correo electrónico</label>
            <input type="email" id="profileEmail"
              value={correo} onChange={e => setCorreo(e.target.value)} />
          </div>
        ) : (
          <>
            <div className="form-group">
              <label>Correo de acceso</label>
              <input type="email" id="profileEmail" value={correo} disabled
                title="El correo de acceso no se puede modificar desde el perfil" />
              <small className="field-hint">No se puede modificar</small>
            </div>
            <div className="form-group">
              <label>Correo de contacto (recibe el código 2FA)</label>
              <input type="email" id="profileContactEmail"
                placeholder="correo@dominio.com"
                value={correoContacto}
                onChange={e => setCorreoContacto(e.target.value)} />
              <small className="field-hint">
                El código de verificación 2FA se envía a este correo.
              </small>
            </div>
          </>
        )}

        <div className="form-group">
          <label>Teléfono</label>
          <input type="text" id="profilePhone"
            value={telefono} onChange={e => setTelefono(e.target.value)} />
        </div>
      </div>

      {/* --- Cambiar contraseña --- */}
      <div className="form-section">
        <h4>Cambiar contraseña</h4>
        <div className="form-group">
          <label>Contraseña actual</label>
          <div className="password-field">
            <input
              type={showContrasenaActual ? 'text' : 'password'}
              id="profileCurrentPassword"
              placeholder="Ingresa tu contraseña actual"
              value={contrasenaActual}
              onChange={e => setContrasenaActual(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showContrasenaActual ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              onClick={() => setShowContrasenaActual(v => !v)}
            >
              <i className={`fas ${showContrasenaActual ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          </div>
        </div>
        <div className="form-group">
          <label>Nueva contraseña</label>
          <div className="password-field">
            <input
              type={showNuevaContrasena ? 'text' : 'password'}
              id="profileNewPassword"
              placeholder="Mínimo 6 caracteres"
              value={nuevaContrasena}
              onChange={e => setNuevaContrasena(e.target.value)}
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
        <button
          className="btn-secondary btn-change-password"
          id="changePasswordBtn"
          onClick={handleChangePassword}
          disabled={cambiandoContrasena}
        >
          {cambiandoContrasena ? 'Actualizando…' : 'Cambiar contraseña'}
        </button>
      </div>
    </Drawer>
  );
}

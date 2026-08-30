/**
 * ============================================================================
 * Archivo: AuthContext.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Administra el estado global de autenticación del usuario con el backend real:
 * - Guarda quién está logueado, su rol y su perfil
 * - Persiste el token JWT + usuario en localStorage
 * - Restaura la sesión al recargar (validando con GET /api/auth/me)
 * - Cierra la sesión en el backend (POST /api/auth/logout) y limpia el estado
 *
 * Estado que administra
 * - usuario:         Datos del usuario logueado (id, nombre, rol)
 * - token:           JWT real devuelto por POST /api/auth/login (temporal) o
 *                    por POST /api/auth/2fa/verify (definitivo, 2faVerified)
 * - autenticado:     Booleano que indica si pasó el login
 * - verificacion2FA: Booleano que indica si pasó la verificación 2FA (según el
 *                    flag 2faVerified del JWT)
 * - isAuthenticated / userRole / profile: API anterior (compatibilidad)
 *
 * Restauración de sesión (NOTA de diseño)
 * Los valores se restauran desde localStorage con INICIALIZADORES LAZY de
 * useState (() => ...), el patrón que React recomienda para derivar estado de
 * storage. Así se evita el setState síncrono dentro del useEffect, que la
 * regla react-hooks/set-state-in-effect prohíbe. El efecto queda solo para la
 * validación ASÍNCRONA con /me (sus setState ocurren dentro de callbacks de
 * promesas, lo que sí está permitido).
 *
 * Nota (Fast Refresh): el contexto y el hook useAuth viven en hooks/useAuth.ts
 * (archivo sin componentes); este archivo solo exporta el componente AuthProvider
 * para cumplir react-refresh/only-export-components.
 *
 * Flujo
 * Login (authService.iniciarSesion) → guardarUsuarioParcial(usuario, token)
 *   → TwoFactorPage → completar2FA() → Dashboard según el rol
 * Recargar → se restaura desde localStorage (lazy init) y se valida con /me;
 *   el flag 2faVerified del token decide si hay que repasar la verificación 2FA
 * Cerrar sesión → limpiarTodo() + authService.cerrarSesionBackend()
 * ============================================================================
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { UserRole, ProfileData } from '../types';
import type { Usuario } from '../types/auth';
import { authService } from '../services/authService';
import { perfilService, buildAvatarUrl } from '../services/perfilService';
import { TOKEN_KEY, USUARIO_KEY } from '../services/apiClient';
// El contexto y su tipo viven en hooks/useAuth.ts (archivo sin componentes,
// ver nota en ese archivo sobre react-refresh y la colisión de nombres en Windows).
import { AuthContext, type AuthContextType } from '../hooks/useAuth';

// Perfiles base por rol (API anterior). construirPerfil los usa como plantilla
// y luego los sobreescribe con los datos reales del backend.
const profileMap: Record<UserRole, ProfileData> = {
  admin: {
    nombre: 'Administrador',
    correo: 'admin@condominio.com',
    telefono: '+506 8888-9999',
    password: 'admin123',
    avatar: ''
  },
  guardia: {
    nombre: 'Guarda',
    correo: 'guarda@condominio.com',
    telefono: '+506 7777-8888',
    password: 'guardia123',
    avatar: ''
  },
  inquilino: {
    nombre: 'Jeremy',
    correo: 'jeremy@condominio.com',
    telefono: '+506 6666-7777',
    password: 'jeremy123',
    avatar: ''
  },
};

const rolMap: Record<string, UserRole> = {
  Administrador: 'admin',
  Guarda: 'guardia',
  Inquilino: 'inquilino',
};

// ---------------------------------------------------------------------------
// Helpers de restauración (se usan en los inicializadores lazy de useState)
// ---------------------------------------------------------------------------

/** Lee y parsea el usuario guardado en localStorage (null si no existe o es inválido). */
const leerUsuarioGuardado = (): Usuario | null => {
  const raw = localStorage.getItem(USUARIO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Usuario;
  } catch {
    return null;
  }
};

/**
 * Lee el token guardado SOLO si el usuario también es parseable: con JSON
 * corrupto el token se descarta igual que el usuario, dejando el estado
 * coherente (token y usuario null en lugar de solo uno de ellos).
 */
const leerTokenGuardado = (): string | null => {
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw && leerUsuarioGuardado() ? raw : null;
};

/** true solo si hay token Y usuario parseable (sesión coherente guardada). */
const haySesionGuardada = (): boolean => Boolean(leerTokenGuardado() && leerUsuarioGuardado());

/** Construye el ProfileData (API anterior) a partir de un Usuario del backend. */
const construirPerfil = (nuevoUsuario: Usuario): ProfileData => {
  const role = rolMap[nuevoUsuario.rol] || 'inquilino';
  const baseProfile = { ...profileMap[role] };
  baseProfile.nombre = nuevoUsuario.nombreCompleto;
  baseProfile.correo = nuevoUsuario.correo;
  // Avatar/teléfono persistidos en el usuario guardado (se restauran al recargar)
  if (nuevoUsuario.avatar) baseProfile.avatar = nuevoUsuario.avatar;
  if (nuevoUsuario.telefono) baseProfile.telefono = nuevoUsuario.telefono;
  return baseProfile;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // --- API anterior (compatibilidad) ---
  // Se restauran con lazy init para reflejar la sesión guardada desde el primer render.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(haySesionGuardada);
  const [userRole, setUserRole] = useState<UserRole | null>(() => {
    const u = leerUsuarioGuardado();
    return u ? (rolMap[u.rol] || 'inquilino') : null;
  });
  const [profile, setProfile] = useState<ProfileData | null>(() => {
    const u = leerUsuarioGuardado();
    return u ? construirPerfil(u) : null;
  });

  // --- Estados para la nueva API (lazy init desde localStorage) ---
  const [usuario, setUsuario] = useState<Usuario | null>(leerUsuarioGuardado);
  const [token, setToken] = useState<string | null>(leerTokenGuardado);
  const [autenticado, setAutenticado] = useState<boolean>(haySesionGuardada);
  const [verificacion2FA, setVerificacion2FA] = useState(false);
  // true solo si hay una sesión guardada por restaurar (evita rebote a /login)
  const [isRestoring, setIsRestoring] = useState<boolean>(haySesionGuardada);

  /** Sincroniza el estado con la API anterior (profile, userRole, isAuthenticated) */
  const sincronizarAPIAnterior = (nuevoUsuario: Usuario) => {
    setProfile(construirPerfil(nuevoUsuario));
    setUserRole(rolMap[nuevoUsuario.rol] || 'inquilino');
    setIsAuthenticated(true);
  };

  /** Limpia TODO el estado de autenticación y el localStorage */
  const limpiarTodo = () => {
    setUsuario(null);
    setToken(null);
    setAutenticado(false);
    setVerificacion2FA(false);
    setProfile(null);
    setUserRole(null);
    setIsAuthenticated(false);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
  };

  // --- Validar sesión restaurada al recargar (solo trabajo ASÍNCRONO) ---
  // La restauración de estado ya ocurrió en los inicializadores lazy; aquí solo
  // se valida contra el backend. Los setState están dentro de callbacks de
  // promesas (.then/.catch/.finally), lo que no viola set-state-in-effect.
  useEffect(() => {
    const tokenGuardado = localStorage.getItem(TOKEN_KEY);
    const usuarioRaw = localStorage.getItem(USUARIO_KEY);

    // Sin sesión guardada: isRestoring ya inicia en false, no hay nada que validar.
    if (!tokenGuardado || !usuarioRaw) return;

    // JSON corrupto o sin usuario: limpiar restos (sin setState — los estados ya
    // quedaron en su valor inicial correcto) y no validar nada.
    let restaurado: Usuario | null = null;
    try {
      restaurado = JSON.parse(usuarioRaw) as Usuario;
    } catch {
      // JSON inválido: restaurado queda null
    }
    if (!restaurado) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USUARIO_KEY);
      return;
    }

    // El flag 2faVerified del JWT decide si el usuario debe pasar (o repasar)
    // la verificación 2FA al recargar: si el token guardado es temporal
    // (2faVerified: false), el frontend redirige a /2fa. Si responde 401, se
    // limpia la sesión.
    //
    // IMPORTANTE (parpadeo de /2fa): isRestoring se mantiene en true hasta que
    // /me RESUELVA, no solo hasta leer localStorage. Así PrivateRoute no
    // redirige a /2fa en el hueco en que verificacion2FA aún es false: una
    // sesión ya verificada va directo al dashboard (sin pantalla 2FA ni correo
    // no deseado) y una sesión expirada va directo al login.
    //
    // IMPORTANTE (backend apagado): si /me falla por CUALQUIER motivo (red
    // caída, 401, 5xx...), la sesión guardada ya no es confiable: se limpia y
    // el usuario va a /login. Antes solo se limpiaba con 401, por lo que con el
    // backend apagado se quedaba una sesión fantasma que redirigía a /2fa
    // (pantalla que incluso intentaba enviar un correo).
    authService.me()
      .then(me => setVerificacion2FA(Boolean(me.user['2faVerified'])))
      .catch(() => limpiarTodo())
      .finally(() => setIsRestoring(false));
    // El efecto corre una sola vez al montar ([]): los estados ya se restauraron
    // en los inicializadores lazy, así que no depende de cambios posteriores.
  }, []);

  // --- Sincronizar el perfil REAL del backend (avatar en el Navbar) ---
  // Sin esto, el Navbar mostraría el fallback de inicial hasta abrir/cerrar el
  // drawer. Al tener sesión verificada se carga GET /api/perfil y se persiste
  // el avatar/teléfono en el usuario guardado (sobrevive a recargas).
  // Los setState ocurren dentro de .then (asíncrono), permitido por el lint.
  // Se usa una ref para leer el usuario actual sin agregarlo a las deps: el
  // efecto solo debe re-correr cuando cambia el id del usuario o el 2FA.
  // La ref se sincroniza en un efecto propio (escribirla en el render está
  // prohibido por react-hooks/refs).
  const usuarioRef = useRef<Usuario | null>(usuario);
  useEffect(() => {
    usuarioRef.current = usuario;
  }, [usuario]);

  useEffect(() => {
    const usuarioActual = usuarioRef.current;
    if (!usuarioActual || !verificacion2FA) return;

    let activo = true;
    perfilService.obtenerPerfil()
      .then(perfil => {
        if (!activo) return;
        const avatarUrl = buildAvatarUrl(perfil.foto_perfil ?? '');
        const nombre = perfil.nombre_completo ?? usuarioActual.nombreCompleto;
        const telefono = perfil.telefono ?? '';

        // Sincronizar el profile (Navbar) con los datos reales del backend.
        setProfile(prev => prev ? { ...prev, nombre, telefono, avatar: avatarUrl } : prev);

        // Persistir en el usuario guardado (misma comparación JSON que
        // updateProfile: evita setUsuario innecesarios → sin refetch en DataProvider).
        const usuarioActualizado: Usuario = { ...usuarioActual, nombreCompleto: nombre, telefono, avatar: avatarUrl };
        const cambioReal = JSON.stringify(usuarioActualizado) !== JSON.stringify(usuarioActual);
        if (cambioReal) {
          setUsuario(usuarioActualizado);
          localStorage.setItem(USUARIO_KEY, JSON.stringify(usuarioActualizado));
        }
      })
      .catch(() => { /* silencioso: el Navbar muestra el fallback */ })
      .finally(() => { activo = false; });

    return () => { activo = false; };
  }, [verificacion2FA, usuario?.idUsuario]);

  // --- Nueva API ---

  const guardarUsuarioParcial = (nuevoUsuario: Usuario, nuevoToken?: string) => {
    setUsuario(nuevoUsuario);
    setAutenticado(true);
    if (nuevoToken) {
      setToken(nuevoToken);
      localStorage.setItem(TOKEN_KEY, nuevoToken);
    }
    localStorage.setItem(USUARIO_KEY, JSON.stringify(nuevoUsuario));
    sincronizarAPIAnterior(nuevoUsuario);
  };

  const completar2FA = (nuevoToken?: string) => {
    if (nuevoToken) {
      setToken(nuevoToken);
      localStorage.setItem(TOKEN_KEY, nuevoToken);
    }
    setVerificacion2FA(true);
  };

  const cerrarSesion = () => {
    // FIX (importante): el backend necesita el token para llamar a sp_CerrarSesion.
    // El api client lee el token de localStorage al CONSTRUIR la petición (de
    // forma síncrona), por eso se invoca ANTES de limpiar. Si se limpiara primero,
    // el POST /auth/logout iría SIN token (401) y la sesión en BD nunca se
    // marcaría como 'CerradaManual'.
    void authService.cerrarSesionBackend().catch(() => {});
    limpiarTodo();
  };

  // --- API anterior ---

  const login = (role: UserRole, name?: string) => {
    const baseProfile = { ...profileMap[role] };
    if (name) baseProfile.nombre = name;
    setProfile(baseProfile);
    setUserRole(role);
    setIsAuthenticated(true);
  };

  const logout = () => {
    // Mismo fix que cerrarSesion: primero el backend (usa el token de
    // localStorage al armar la petición), luego se limpia el estado.
    void authService.cerrarSesionBackend().catch(() => {});
    limpiarTodo();
  };

  const updateProfile = (data: Partial<ProfileData>) => {
    if (profile) {
      const nuevoPerfil = { ...profile, ...data };
      setProfile(nuevoPerfil);
      // Persistir los campos que reflejan el backend (avatar, teléfono, nombre,
      // correo) en el usuario guardado para que sobrevivan a recargas de página.
      if (usuario) {
        const usuarioActualizado: Usuario = { ...usuario };
        if (data.avatar !== undefined) usuarioActualizado.avatar = data.avatar;
        if (data.telefono !== undefined) usuarioActualizado.telefono = data.telefono;
        if (data.nombre !== undefined) usuarioActualizado.nombreCompleto = data.nombre;
        if (data.correo !== undefined) usuarioActualizado.correo = data.correo;
        // NOTA (cambio): solo se reemplaza la referencia si algo cambió de verdad.
        // DataProvider re-ejecuta sus recargas al cambiar `usuario`, así que
        // reemplazar el objeto sin cambios dispararía refetch innecesarios.
        const cambioReal = JSON.stringify(usuarioActualizado) !== JSON.stringify(usuario);
        if (cambioReal) {
          setUsuario(usuarioActualizado);
        }
        localStorage.setItem(USUARIO_KEY, JSON.stringify(usuarioActualizado));
      }
    }
  };

  const userName = profile?.nombre || usuario?.nombreCompleto || '';

  const value: AuthContextType = {
    // Nueva API
    usuario, token, autenticado, verificacion2FA, isRestoring,
    guardarUsuarioParcial, completar2FA, cerrarSesion,
    // API anterior
    isAuthenticated, userRole, userName, profile,
    login, logout, updateProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

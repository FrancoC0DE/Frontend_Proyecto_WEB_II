/**
 * ============================================================================
 * Archivo: DataContext.tsx
 * ============================================================================
 *
 * NOTA (protección de rutas con JWT):
 * Este provider se comunica con el backend usando el cliente compartido `api`
 * (services/apiClient.ts) en lugar de fetch() crudo. Razones:
 *
 * 1. Las rutas exigen token JWT (Authorization: Bearer <token>).
 * 2. Si la sesión expira (401), limpia localStorage y redirige a /login.
 * 3. `id_usuario_actual` lo deduce el backend del JWT (req.user.id_usuario).
 * ============================================================================
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type {
  Reserva, Visitante, Personal, Residente, Contrato, Departamento,
  ActivityItem, NotificationItem, AreaInquilino, UserRole
} from '../types';
import { useAuth } from '../hooks/useAuth';
import { api, buildStaticUrl } from '../services/apiClient';
import { inquilinoService, type AreaInquilinoRaw } from '../services/inquilinoService';
import { notificacionesService, transformarNotificacion, VIDA_MS_NOTIFICACION } from '../services/notificacionesService';
import { toDateOnly, toTimeOnly } from '../hooks/useLocalDate';

/** Rol del backend → UserRole de la app (para las listas por rol del Navbar). */
const rolNotificaciones: Record<string, UserRole> = {
  Administrador: 'admin',
  Guarda: 'guardia',
  Inquilino: 'inquilino',
};

// ----------------------------------------------------------------------------
// Actividad reciente del administrador (seguimiento LOCAL en el navegador).
// Se guarda en localStorage por usuario (actividad_admin_<id>) para que cada
// admin vea SOLO sus propias acciones y sobrevivan a recargas de página.
// ----------------------------------------------------------------------------
const MAX_ACTIVIDAD_LOCAL = 50;

const claveActividadLocal = (id: number | undefined): string | null =>
  id ? `actividad_admin_${id}` : null;

/** Lee la actividad guardada del usuario ([] si no hay nada o falla). */
const cargarActividadLocal = (id: number | undefined): ActivityItem[] => {
  const clave = claveActividadLocal(id);
  if (!clave) return [];
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityItem[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ACTIVIDAD_LOCAL) : [];
  } catch {
    return [];
  }
};

/** Persiste la actividad (máx. 50 ítems; errores de cuota se ignoran). */
const guardarActividadLocal = (id: number | undefined, items: ActivityItem[]): void => {
  const clave = claveActividadLocal(id);
  if (!clave) return;
  try {
    localStorage.setItem(clave, JSON.stringify(items.slice(0, MAX_ACTIVIDAD_LOCAL)));
  } catch {
    // almacenamiento no disponible (modo privado, cuota llena): no bloquea la app
  }
};

interface PersonalRaw {
  id_usuario: number;
  nombre_completo: string;
  correo: string;
  correo_contacto?: string | null;
  telefono: string;
  cedula: string;
  activo: boolean;
}

interface ResidenteRaw {
  id_usuario: number;
  nombre_completo: string;
  correo: string;
  telefono: string;
  cedula: string;
  departamento?: string;
  estado_contrato?: string;
  activo: boolean;
}

interface DepartamentoRaw {
  id_departamento: number;
  numero: string;
  piso?: number | null;
  metros_cuadrados?: number | null;
  estado: string;
  activo: boolean | number;
  fecha_registro?: string;
}

interface ContratoRaw {
  id_contrato: number;
  id_usuario: number;
  residente: string;
  id_departamento: number;
  departamento: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  monto_mensual?: number;
  monto_deposito?: number;
  fecha_registro?: string;
}

interface ReservaRaw {
  id_reserva?: number;
  id?: number;
  id_area?: number;
  id_area_comun?: number;
  area?: string;
  nombre_area?: string;
  residente?: string;
  nombre_residente?: string;
  nombre_completo?: string;
  fecha?: string;
  fecha_reserva?: string;
  hora_inicio?: string;
  hora_fin?: string;
  estado?: string;
  cantidad_personas?: number;
  personas?: number;
  costo?: number;
  estado_pago?: string;
}

// --- Interfaces para el Dashboard ---
interface DashboardKPIs {
  reservas_hoy: number;
  visitas_registradas: number;
  contratos_activos: number;
  areas_ocupadas: number;
  ingresos_del_dia: number; // antes: ingresos_dia (no coincidía con el backend, siempre daba 0/₡0)
}

interface DashboardData {
  kpis: DashboardKPIs;
  proximasReservas: unknown[];
  alertas: unknown[]; // antes faltaba este campo: se perdía aunque el backend lo mandara
  actividadReciente: unknown[];
}

interface DashboardApiResponse {
  status?: string;
  data?: DashboardData;
  kpis?: DashboardKPIs;
  proximasReservas?: unknown[];
  alertas?: unknown[];
  actividadReciente?: unknown[];
}

interface DataContextType {
  personalData: Personal[];
  residentesData: Residente[];
  contratosData: Contrato[];
  departamentosData: Departamento[];
  reservasData: Reserva[];
  areasDisponiblesData: AreaInquilino[];
  recargarAreasDisponibles: () => Promise<void>;
  inquilinoReservasData: Reserva[];
  recargarReservasInquilino: () => Promise<void>;
  inquilinoVisitantesData: Visitante[];
  recargarVisitantesInquilino: () => Promise<void>;
  activityLog: ActivityItem[];
  adminNotifications: NotificationItem[];
  guardiaNotifications: NotificationItem[];
  inquilinoNotifications: NotificationItem[];

  /** Recarga las notificaciones del usuario autenticado desde la BD (SPs). */
  recargarNotificaciones: () => Promise<void>;

  // Dashboard State & Method
  dashboardData: DashboardData | null;
  recargarDashboard: () => Promise<void>;

  addActivity: (descripcion: string, icono?: string, color?: string) => void;
  /** icono opcional + id_referencia de la entidad relacionada (reserva, área, contrato...). */
  addNotification: (role: UserRole, titulo: string, mensaje: string, icono?: string, idReferencia?: number | null) => void;
  markAsRead: (role: UserRole, id: number) => void;
  markAllRead: (role: UserRole) => void;

  // Personal CRUD (los crear* devuelven el id nuevo para el id_referencia de
  // la notificación; null si el backend no lo reporta).
  recargarPersonal: (busqueda?: string) => Promise<void>;
  crearPersonal: (nombre: string, correo: string, contrasena: string, telefono: string, cedula: string, correoContacto?: string) => Promise<number | null>;
  editarPersonal: (id_usuario: number, nombre: string, correo: string, telefono: string, cedula: string, correoContacto?: string) => Promise<void>;
  cambiarEstadoPersonal: (id_usuario: number, activar: boolean) => Promise<void>;

  // Residentes CRUD
  recargarResidentes: () => Promise<void>;
  crearResidente: (nombre: string, correo: string, contrasena: string, telefono: string, cedula: string) => Promise<number | null>;
  editarResidente: (id_usuario: number, nombre: string, correo: string, telefono: string, cedula: string) => Promise<void>;
  cambiarEstadoResidente: (id_usuario: number, activar: boolean) => Promise<void>;

  // Contratos CRUD
  recargarContratos: () => Promise<void>;
  crearContrato: (datos: { cedula: string; numero_departamento: string; fecha_inicio: string; fecha_fin: string; monto_mensual: number; monto_deposito: number }) => Promise<number | null>;
  editarContrato: (id_contrato: number, datos: { fecha_inicio: string; fecha_fin: string; monto_mensual: number; monto_deposito: number }) => Promise<void>;

  // Departamentos CRUD
  recargarDepartamentos: () => Promise<void>;
  crearDepartamento: (numero: string, piso: number | null, metrosCuadrados: number | null) => Promise<number | null>;
  editarDepartamento: (id_departamento: number, numero: string, piso: number | null, metrosCuadrados: number | null) => Promise<void>;
  cambiarEstadoDepartamento: (id_departamento: number, activar: boolean) => Promise<void>;

  // Reservas: SOLO CONSULTA para el admin (el panel es de solo lectura).
  // La creación (sp_CrearReservaPago) y cancelación (sp_CancelarReserva) son
  // exclusivas del inquilino vía inquilinoService → /api/inquilino/reservas.
  recargarReservas: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [personalData, setPersonalData] = useState<Personal[]>([]);
  const [residentesData, setResidentesData] = useState<Residente[]>([]);
  const [contratosData, setContratosData] = useState<Contrato[]>([]);
  const [departamentosData, setDepartamentosData] = useState<Departamento[]>([]);
  const [adminReservas, setReservasData] = useState<Reserva[]>([]);
  // Estados del inquilino: se cargan desde la API según el rol (mount effect).
  const [areasDisponiblesData, setAreasDisponibles] = useState<AreaInquilino[]>([]);
  const [inquilinoReservasData, setInquilinoReservas] = useState<Reserva[]>([]);
  const [inquilinoVisitantesData, setInquilinoVisitantes] = useState<Visitante[]>([]);
  const { usuario, verificacion2FA } = useAuth();
  const idAdminActual = usuario?.idUsuario;

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  // Actividad reciente del admin: seguimiento LOCAL (localStorage por usuario),
  // NO de la BD. Se restaura al recargar la página.
  const [activityLog, setActivityLog] = useState<ActivityItem[]>(() => cargarActividadLocal(idAdminActual));
  // Las notificaciones se cargan desde la BD (sp_ListarNotificaciones) según
  // el usuario autenticado en recargarNotificaciones.
  const [adminNotifications, setAdminNotifications] = useState<NotificationItem[]>([]);
  const [guardiaNotifications, setGuardiaNotifications] = useState<NotificationItem[]>([]);
  const [inquilinoNotifications, setInquilinoNotifications] = useState<NotificationItem[]>([]);

  // Cada cuánto se consulta la BD por notificaciones nuevas (trigger de la DB).
  const INTERVALO_POLL_NOTIFICACIONES_MS = 30_000;

  /**
   * Fusiona las filas recién traídas con el estado local SIN revertir las que
   * el usuario acaba de marcar como leídas (optimista): evita el parpadeo entre
   * la actualización local y la escritura del PATCH en la BD.
   */
  const fusionarNotificaciones = (prev: NotificationItem[], nuevos: NotificationItem[]): NotificationItem[] => {
    const leidasLocal = new Set(prev.filter(n => n.read).map(n => n.id));
    return nuevos.map(n => (leidasLocal.has(n.id) ? { ...n, read: true } : n));
  };

  // --- Notificaciones (todos los roles; fuente de verdad: la BD) ---
  const recargarNotificaciones = useCallback(async () => {
    if (!usuario || !verificacion2FA) return;

    try {
      const res = await notificacionesService.obtener({ limite: 50 });

      if (!res || !Array.isArray(res.datos)) {
        console.error('Error del backend al obtener notificaciones:', res);
        return;
      }

      const ahora = Date.now();
      // ahora_bd = reloj actual del servidor SQL: ancla la edad de cada
      // notificación al reloj de la BD (no al del navegador) para que el
      // "hace X min/h" sea correcto aunque el servidor tenga otra zona horaria.
      const items: NotificationItem[] = res.datos
        .map(raw => transformarNotificacion(raw, res.ahora_bd))
        // Red de seguridad: nunca mostrar notificaciones con más de 24 h
        // (el backend las purga al listar; si la BD no permite el DELETE,
        // aquí se ocultan igualmente).
        .filter(n => ahora - n.timestamp < VIDA_MS_NOTIFICACION);

      const role = rolNotificaciones[usuario.rol] ?? 'inquilino';
      if (role === 'admin') setAdminNotifications(prev => fusionarNotificaciones(prev, items));
      else if (role === 'guardia') setGuardiaNotifications(prev => fusionarNotificaciones(prev, items));
      else setInquilinoNotifications(prev => fusionarNotificaciones(prev, items));
    } catch (err) {
      console.error('Error de red al recargar notificaciones:', err);
    }
  }, [usuario, verificacion2FA]);

  // Polling periódico: las notificaciones de los triggers de la BD aparecen en
  // la campana sin recargar la página. El intervalo corre SIEMPRE (la guarda
  // previa por document.hidden podía dejar de actualizar el contador en
  // entornos donde la pestaña se reporta como oculta) y, además, al volver a
  // la pestaña se refresca al instante (visibilitychange).
  // Los setState ocurren dentro de los callbacks diferidos (interval/evento),
  // no de forma síncrona en el efecto (por eso no viola set-state-in-effect).
  useEffect(() => {
    if (!usuario || !verificacion2FA) return;

    const timer = setInterval(() => {
      void recargarNotificaciones();
    }, INTERVALO_POLL_NOTIFICACIONES_MS);

    const onVisibility = () => {
      if (!document.hidden) void recargarNotificaciones();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [usuario, verificacion2FA, recargarNotificaciones]);

  // --- Reservas / Visitantes del Inquilino (rol Inquilino) ---
  const recargarReservasInquilino = useCallback(async () => {
    if (!usuario || usuario.rol !== 'Inquilino') return;

    try {
      const data = await inquilinoService.obtenerMisReservas();

      if (!Array.isArray(data)) {
        console.error('Error del backend al obtener reservas del inquilino:', data);
        return;
      }

      const transformed: Reserva[] = data.map((r) => ({
        id: r.id_reserva,
        area: r.area,
        fecha: toDateOnly(r.fecha),
        hora_inicio: toTimeOnly(r.hora_inicio),
        hora_fin: toTimeOnly(r.hora_fin),
        estado: r.estado as Reserva['estado'],
        personas: r.cantidad_personas,
        costo: r.costo,
        pago_estado: r.estado_pago,
      }));

      setInquilinoReservas(transformed);
    } catch (err) {
      console.error('Error de red al recargar reservas del inquilino:', err);
    }
  }, [usuario]);

  const recargarVisitantesInquilino = useCallback(async () => {
    if (!usuario || usuario.rol !== 'Inquilino') return;

    try {
      const data = await inquilinoService.obtenerVisitantes();

      if (!Array.isArray(data)) {
        console.error('Error del backend al obtener visitantes del inquilino:', data);
        return;
      }

      const transformed: Visitante[] = data.map((v) => ({
        id: v.id_visitante,
        nombre: v.nombre_completo,
        documento: v.documento_identidad,
        placa: v.placa ?? '',
        // El SP puede devolver hora_esperada o fecha_hora_estimada según la versión
        hora_esperada: toTimeOnly(v.hora_esperada ?? (v as unknown as Record<string, unknown>).fecha_hora_estimada as string ?? ''),
        estado: v.estado,
        motivo_rechazo: v.motivo_rechazo ?? undefined,
      }));

      setInquilinoVisitantes(transformed);
    } catch (err) {
      console.error('Error de red al recargar visitantes del inquilino:', err);
    }
  }, [usuario]);

  const recargarAreasDisponibles = useCallback(async () => {
    if (!usuario || usuario.rol !== 'Inquilino') return;

    try {
      const data = await inquilinoService.obtenerAreasDisponibles();

      if (!Array.isArray(data)) {
        console.error('Error del backend al obtener áreas disponibles:', data);
        return;
      }

      const transformed: AreaInquilino[] = data.map((a: AreaInquilinoRaw) => ({
        id: a.id_area,
        nombre: a.nombre,
        imagen: a.foto_principal ? buildStaticUrl(a.foto_principal) : '/img/area-placeholder.svg',
        capacidad: a.capacidad_max,
        horario_inicio: parseInt(toTimeOnly(a.hora_apertura).split(':')[0], 10),
        horario_fin: parseInt(toTimeOnly(a.hora_cierre).split(':')[0], 10),
        costo_por_hora: a.costo_por_hora,
        disponible: a.estado === 'Disponible',
      }));

      setAreasDisponibles(transformed);
    } catch (err) {
      console.error('Error de red al recargar áreas disponibles:', err);
    }
  }, [usuario]);

  // --- Dashboard Consulta ---
  const recargarDashboard = useCallback(async () => {
    if (!idAdminActual) return;

    try {
      const res = await api.get<DashboardApiResponse>('/dashboard');

      if (res && res.data) {
        setDashboardData(res.data);
      } else if (res && res.kpis) {
        setDashboardData({
          kpis: res.kpis,
          proximasReservas: res.proximasReservas ?? [],
          alertas: res.alertas ?? [],
          actividadReciente: res.actividadReciente ?? []
        });
      }
    } catch (err) {
      console.error('Error de red al recargar el dashboard:', err);
    }
  }, [idAdminActual]);

  // --- Personal CRUD ---
  const recargarPersonal = useCallback(async (busqueda?: string) => {
    if (!idAdminActual) return;
    try {
      const params = busqueda?.trim() ? `?busqueda=${encodeURIComponent(busqueda.trim())}` : '';
      const data = await api.get<PersonalRaw[]>(`/personal${params}`);

      if (!Array.isArray(data)) {
        console.error('Error del backend al obtener personal:', data);
        return;
      }

      const transformed: Personal[] = data.map((row: PersonalRaw) => ({
        id_usuario: row.id_usuario,
        nombre: row.nombre_completo,
        correo: row.correo,
        correoContacto: row.correo_contacto || '',
        telefono: row.telefono,
        cedula: row.cedula,
        dominio: row.correo?.split('@')[1] || '',
        iniciales: row.nombre_completo?.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2) || '',
        estado: row.activo ? 'Activo' : 'Inactivo'
      }));
      setPersonalData(transformed);
    } catch (err) {
      console.error('Error de red al recargar personal:', err);
    }
  }, [idAdminActual]);

  const crearPersonal = useCallback(async (nombre: string, correo: string, contrasena: string, telefono: string, cedula: string, correoContacto?: string) => {
    const res = await api.post<{ id_usuario_nuevo?: number | null }>('/personal', { nombre_completo: nombre, correo, correo_contacto: correoContacto || null, contrasena, telefono, cedula, foto_perfil: null });
    await recargarPersonal();
    return res?.id_usuario_nuevo ?? null;
  }, [recargarPersonal]);

  const editarPersonal = useCallback(async (id_usuario: number, nombre: string, correo: string, telefono: string, cedula: string, correoContacto?: string) => {
    await api.put(`/personal/${id_usuario}`, { nombre_completo: nombre, correo, correo_contacto: correoContacto || null, telefono, cedula, foto_perfil: null });
    await recargarPersonal();
  }, [recargarPersonal]);

  const cambiarEstadoPersonal = useCallback(async (id_usuario: number, activar: boolean) => {
    const accion = activar ? 'reactivar' : 'desactivar';
    await api.patch(`/personal/${id_usuario}/${accion}`);
    await recargarPersonal();
  }, [recargarPersonal]);

  // --- Residentes CRUD ---
  const recargarResidentes = useCallback(async () => {
    if (!idAdminActual) return;
    try {
      const data = await api.get<ResidenteRaw[]>('/residentes');

      if (!Array.isArray(data)) {
        console.error('Error del backend al obtener residentes:', data);
        return;
      }

      const transformed: Residente[] = data.map((row: ResidenteRaw) => ({
        id: row.id_usuario,
        nombre: row.nombre_completo,
        departamento: row.departamento || 'Sin asignar',
        correo: row.correo,
        telefono: row.telefono,
        cedula: row.cedula || '',
        contrato_estado: row.estado_contrato || 'Sin Contrato',
        estado: row.activo ? 'Activo' : 'Inactivo'
      }));

      setResidentesData(transformed);
    } catch (err) {
      console.error('Error de red al recargar residentes:', err);
    }
  }, [idAdminActual]);

  const crearResidente = useCallback(async (nombre: string, correo: string, contrasena: string, telefono: string, cedula: string) => {
    const res = await api.post<{ id_usuario_nuevo?: number | null }>('/residentes', {
      nombre_completo: nombre,
      correo,
      contrasena,
      telefono,
      cedula
    });

    await recargarResidentes();
    await recargarDashboard(); // "Actividad reciente" muestra altas de residentes
    return res?.id_usuario_nuevo ?? null;
  }, [recargarResidentes, recargarDashboard]);

  const editarResidente = useCallback(async (id_usuario: number, nombre: string, correo: string, telefono: string, cedula: string) => {
    await api.put(`/residentes/${id_usuario}`, {
      nombre_completo: nombre,
      correo,
      telefono,
      cedula
    });

    await recargarResidentes();
  }, [recargarResidentes]);

  const cambiarEstadoResidente = useCallback(async (id: number, activo: boolean) => {
    await api.patch(`/residentes/${id}/changeEstadoResidente`, {
      activo: activo ? 1 : 0
    });

    await recargarResidentes();
  }, [recargarResidentes]);

  // --- Departamentos CRUD ---
  const recargarDepartamentos = useCallback(async () => {
    if (!idAdminActual) return;
    try {
      const data = await api.get<DepartamentoRaw[]>('/departamentos');

      if (!Array.isArray(data)) {
        console.error('Error del backend al obtener departamentos:', data);
        return;
      }

      const transformed: Departamento[] = data.map((row: DepartamentoRaw) => ({
        id_departamento: row.id_departamento,
        numero: row.numero,
        piso: row.piso ?? null,
        metros_cuadrados: row.metros_cuadrados ?? null,
        estado: row.estado,
        activo: Boolean(row.activo)
      }));

      setDepartamentosData(transformed);
    } catch (err) {
      console.error('Error de red al recargar departamentos:', err);
    }
  }, [idAdminActual]);

  // --- Contratos CRUD ---
  const recargarContratos = useCallback(async () => {
    if (!idAdminActual) return;
    try {
      const data = await api.get<ContratoRaw[]>('/contratos');

      if (!Array.isArray(data)) {
        console.error('Error del backend al obtener contratos:', data);
        return;
      }

      const transformed: Contrato[] = data.map((row: ContratoRaw) => ({
        id_contrato: row.id_contrato,
        id_usuario: row.id_usuario,
        residente: row.residente,
        id_departamento: row.id_departamento,
        departamento: row.departamento,
        fecha_inicio: row.fecha_inicio?.split('T')[0] || row.fecha_inicio,
        fecha_fin: row.fecha_fin?.split('T')[0] || row.fecha_fin,
        estado: row.estado,
        monto_mensual: row.monto_mensual ?? 0,
        monto_deposito: row.monto_deposito ?? 0
      }));

      setContratosData(transformed);
      await recargarDepartamentos();
    } catch (err) {
      console.error('Error de red al recargar contratos:', err);
    }
  }, [idAdminActual, recargarDepartamentos]);

  const crearContrato = useCallback(async (datos: {
    cedula: string;
    numero_departamento: string;
    fecha_inicio: string;
    fecha_fin: string;
    monto_mensual: number;
    monto_deposito: number;
  }) => {
    const res = await api.post<{ id_contrato_nuevo?: number | null }>('/contratos', datos);

    await recargarContratos();
    await recargarResidentes();
    await recargarDashboard(); // 🔑 antes faltaba: por esto "Contratos activos" no se actualizaba en la tarjeta
    return res?.id_contrato_nuevo ?? null;
  }, [recargarContratos, recargarResidentes, recargarDashboard]);

  const editarContrato = useCallback(async (
    id_contrato: number,
    datos: {
      fecha_inicio: string;
      fecha_fin: string;
      monto_mensual: number;
      monto_deposito: number;
    }
  ) => {
    await api.put(`/contratos/${id_contrato}`, datos);

    await recargarContratos();
    await recargarResidentes();
    await recargarDashboard(); // las fechas editadas pueden afectar la alerta de "vence en N días"
  }, [recargarContratos, recargarResidentes, recargarDashboard]);

  const crearDepartamento = useCallback(async (numero: string, piso: number | null, metrosCuadrados: number | null) => {
    const res = await api.post<{ id_departamento_nuevo?: number | null }>('/departamentos', { numero, piso, metros_cuadrados: metrosCuadrados });

    await recargarDepartamentos();
    return res?.id_departamento_nuevo ?? null;
  }, [recargarDepartamentos]);

  const editarDepartamento = useCallback(async (id_departamento: number, numero: string, piso: number | null, metrosCuadrados: number | null) => {
    await api.put(`/departamentos/${id_departamento}`, { numero, piso, metros_cuadrados: metrosCuadrados });

    await recargarDepartamentos();
  }, [recargarDepartamentos]);

  const cambiarEstadoDepartamento = useCallback(async (id_departamento: number, activar: boolean) => {
    const accion = activar ? 'reactivar' : 'desactivar';
    await api.patch(`/departamentos/${id_departamento}/${accion}`);

    await recargarDepartamentos();
  }, [recargarDepartamentos]);

  // --- RESERVAS CONSULTA & CRUD ---
  const recargarReservas = useCallback(async () => {
    if (!idAdminActual) return;
    try {
      const data = await api.get<ReservaRaw[]>('/reservas');

      if (!Array.isArray(data)) {
        console.error('Error del backend al obtener reservas:', data);
        setReservasData([]);
        return;
      }

      const transformed: Reserva[] = data.map((row: ReservaRaw) => {
        const rawFecha = row.fecha || row.fecha_reserva || '';
        const fechaFormateada = rawFecha ? String(rawFecha).split('T')[0] : '';

        const hInicio = row.hora_inicio ? String(row.hora_inicio).slice(0, 5) : '';
        const hFin = row.hora_fin ? String(row.hora_fin).slice(0, 5) : '';
        const horarioFormateado = hInicio && hFin ? `${hInicio} - ${hFin}` : (hInicio || '-');

        return {
          id: row.id || row.id_reserva || 0,
          // id_area lo devuelve sp_ListarReservas (join con AreaComun); se usa
          // para el filtro "Área" del panel admin (ReservasPage).
          id_area: row.id_area ?? row.id_area_comun ?? 0,
          area: row.area || row.nombre_area || 'Área Común',
          residente: row.residente || row.nombre_residente || row.nombre_completo || 'Sin asignar',
          fecha: fechaFormateada,
          hora: horarioFormateado,
          hora_inicio: hInicio,
          hora_fin: hFin,
          estado: (row.estado || 'Confirmada') as Reserva['estado'],
          personas: row.cantidad_personas ?? row.personas ?? 1,
          costo: row.costo ?? 0,
          pago_estado: row.estado_pago ?? 'Pendiente'
        };
      });

      setReservasData(transformed);
    } catch (err) {
      console.error('Error de red al recargar reservas:', err);
      setReservasData([]);
    }
  }, [idAdminActual]);

  // NOTA (cambio): el admin no crea ni edita reservas (panel de solo lectura).
  // Se eliminaron crearReserva (POST /api/reservas → sp_InsertarReserva) y
  // editarReserva (PUT /api/reservas/:id → sp_ActualizarReserva), ambos sin uso.
  // La cancelación también es SOLO del inquilino dueño (MisReservasPage).

  // --- Carga Inicial ---
  useEffect(() => {
    if (!usuario || !verificacion2FA) return;

    // La carga inicial de datos al montar el provider es intencional: los
    // recargar* solo actualizan el estado en continuaciones asíncronas
    // (después del await de la API), nunca de forma síncrona en el efecto.
    // La regla react-hooks/set-state-in-effect es conservadora y la marca.
    /* eslint-disable react-hooks/set-state-in-effect */
    // NOTA (fix 403 + reservas/visitantes vacías):
    // Se llaman las rutas SOLO según el rol autenticado; authorizeRole
    // rechazaría con 403 las rutas de admin para Guarda/Inquilino, y las
    // reservas/visitantes del inquilino se cargan desde su propia API.
    if (usuario.rol === 'Administrador') {
      recargarPersonal();
      recargarResidentes();
      recargarContratos();
      recargarDepartamentos();
      recargarReservas();
      recargarDashboard();
    } else if (usuario.rol === 'Inquilino') {
      recargarReservasInquilino();
      recargarVisitantesInquilino();
      recargarAreasDisponibles();
    }
    // Guarda no necesita ninguna de estas listas por ahora.

    // La campana de notificaciones se alimenta de la BD para TODOS los roles.
    recargarNotificaciones();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [usuario, verificacion2FA, recargarPersonal, recargarResidentes, recargarContratos, recargarDepartamentos, recargarReservas, recargarDashboard, recargarReservasInquilino, recargarVisitantesInquilino, recargarAreasDisponibles, recargarNotificaciones]);

  // --- Helpers Notificaciones / Actividad ---
  const addActivity = useCallback((descripcion: string, icono = 'fa-circle', color = 'var(--accent)') => {
    const now = new Date();
    const item: ActivityItem = {
      id: Date.now(), descripcion, icono, color,
      fecha: now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' as const }),
      hora: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      timestamp: now.getTime()
    };
    setActivityLog(prev => {
      const nuevo = [item, ...prev].slice(0, MAX_ACTIVIDAD_LOCAL);
      guardarActividadLocal(idAdminActual, nuevo);
      return nuevo;
    });
  }, [idAdminActual]);

  /**
   * Convierte el título de un aviso en un código tipo (ej. "Nueva área" →
   * "NUEVA_AREA") para persistirlo en la BD. Sin acentos ni espacios, ≤ 30
   * chars (cabe en Notificacion.tipo).
   */
  const tituloATipo = (titulo: string): string => {
    const tipo = titulo
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
      .replace(/[^a-z0-9]+/g, '_')                        // espacios/símbolos → _
      .replace(/^_+|_+$/g, '');
    return (tipo || 'actividad').toUpperCase().slice(0, 30);
  };

  const addNotification = useCallback((role: UserRole, titulo: string, mensaje: string, icono = 'fa-bell', idReferencia?: number | null) => {
    const now = new Date();
    const newItem: NotificationItem = {
      id: Date.now(), title: titulo, message: mensaje,
      time: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      read: false, icon: icono, timestamp: now.getTime(),
      id_referencia: idReferencia ?? null,
    };
    if (role === 'admin') setAdminNotifications(prev => [newItem, ...prev]);
    else if (role === 'guardia') setGuardiaNotifications(prev => [newItem, ...prev]);
    else setInquilinoNotifications(prev => [newItem, ...prev]);

    // Persistir en la BD (sp_CrearNotificacion) para que la notificación NO
    // sea un "fantasma" local: la campana se recarga desde la BD cada 30 s y
    // reemplaza la lista, así que un aviso solo-local desaparecía al instante.
    // id_referencia = id de la entidad relacionada (reserva, área, contrato...)
    // para que quede ligada igual que las notis de los triggers.
    // Best-effort: si la BD no responde, el aviso local igual se muestra.
    notificacionesService.crear(tituloATipo(titulo), mensaje, idReferencia ?? null).catch(err => {
      console.error('Error al persistir notificación:', err);
    });
  }, []);

  const markAsRead = useCallback((role: UserRole, id: number) => {
    // Optimista: la UI se actualiza al instante y el cambio persiste en la BD.
    const setter = (prev: NotificationItem[]) => prev.map(n => n.id === id ? { ...n, read: true } : n);
    if (role === 'admin') setAdminNotifications(setter);
    else if (role === 'guardia') setGuardiaNotifications(setter);
    else setInquilinoNotifications(setter);

    // Persistir en la BD (sp_MarcarNotificacionLeida valida la pertenencia).
    notificacionesService.marcarLeida(id).catch(err => {
      console.error('Error al marcar notificación como leída:', err);
    });
  }, []);

  const markAllRead = useCallback((role: UserRole) => {
    const setter = (prev: NotificationItem[]) => prev.map(n => ({ ...n, read: true }));
    if (role === 'admin') setAdminNotifications(setter);
    else if (role === 'guardia') setGuardiaNotifications(setter);
    else setInquilinoNotifications(setter);

    // Persistir en la BD (sp_MarcarTodasNotificacionesLeidas).
    notificacionesService.marcarTodasLeidas().catch(err => {
      console.error('Error al marcar todas las notificaciones como leídas:', err);
    });
  }, []);

  return (
    <DataContext.Provider value={{
      personalData,
      residentesData,
      contratosData,
      departamentosData,
      reservasData: adminReservas,
      areasDisponiblesData, recargarAreasDisponibles,
      inquilinoReservasData, recargarReservasInquilino,
      inquilinoVisitantesData, recargarVisitantesInquilino,
      activityLog,
      adminNotifications, guardiaNotifications, inquilinoNotifications,
      recargarNotificaciones,
      dashboardData, recargarDashboard,
      addActivity, addNotification,
      markAsRead, markAllRead,
      recargarPersonal, crearPersonal, editarPersonal, cambiarEstadoPersonal,
      recargarResidentes, crearResidente, editarResidente, cambiarEstadoResidente,
      recargarContratos, crearContrato, editarContrato,
      recargarDepartamentos, crearDepartamento, editarDepartamento, cambiarEstadoDepartamento,
      recargarReservas
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
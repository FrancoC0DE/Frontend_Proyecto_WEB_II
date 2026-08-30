/**
 * ============================================================================
 * Archivo: notificacionesService.ts
 * ============================================================================
 *
 * ¿Qué hace?
 * Cliente del módulo de Notificaciones. Consume /api/notificaciones (que llama
 * a los SPs sp_ListarNotificaciones, sp_MarcarNotificacionLeida y
 * sp_MarcarTodasNotificacionesLeidas de CondominioDB). La tabla Notificacion se
 * llena automáticamente mediante triggers del motor de la BD.
 *
 * Endpoints
 * - obtener(...)        → GET  /notificaciones?leida=&limite=
 * - crear(...)          → POST /notificaciones (persiste un aviso del propio
 *                          usuario; evita la "noti fantasma" local)
 * - marcarLeida(id)     → PATCH /notificaciones/:id/leida
 * - marcarTodasLeidas() → PATCH /notificaciones/marcar-todas
 *
 * Además expone helpers de presentación:
 * - tipoNotificacionATitulo(tipo)  → "RESERVA_CREADA" → "Nueva reserva"
 * - tipoNotificacionAIcono(tipo)   → "RESERVA_CREADA" → "fa-calendar-plus"
 * - transformarNotificacion(raw)   → NotificacionRaw → NotificationItem
 *
 * ============================================================================
 */
import { api } from './apiClient';

/** Fila tal cual la devuelve sp_ListarNotificaciones. */
export interface NotificacionRaw {
  id_notificacion: number;
  id_usuario: number;
  /** Categoría del evento: NUEVA_SOLICITUD_VISITA, RESERVA_CREADA, NUEVO_PAGO... */
  tipo: string;
  mensaje: string;
  /** ID de la entidad relacionada (reserva, visita, usuario...) o null. */
  id_referencia: number | null;
  /** ISO de SQL Server (DATETIME2) — el frontend calcula el tiempo relativo. */
  fecha_envio: string;
  /** BIT → true si ya fue leída. */
  leida: boolean;
}

/** Títulos legibles por tipo de notificación. */
const TITULOS: Record<string, string> = {
  NUEVA_SOLICITUD_VISITA: 'Nueva solicitud de visita',
  VISITA_AUTORIZADA: 'Visita autorizada',
  VISITA_RECHAZADA: 'Visita rechazada',
  VISITA_CANCELADA: 'Visita cancelada',
  VISITA_INGRESADA: 'Visitante ingresó',
  RESERVA_CREADA: 'Nueva reserva',
  NUEVA_RESERVA: 'Nueva reserva',
  RESERVA_CONFIRMADA: 'Reserva confirmada',
  RESERVA_CANCELADA: 'Reserva cancelada',
  NUEVO_PAGO: 'Nuevo pago',
  NUEVO_RESIDENTE: 'Nuevo residente',
  RESIDENTE_EDITADO: 'Residente editado',
  RESIDENTE_HABILITADO: 'Residente habilitado',
  RESIDENTE_DESHABILITADO: 'Residente deshabilitado',
  NUEVA_AREA: 'Nueva área',
  AREA_EDITADA: 'Área editada',
  AREA_HABILITADA: 'Área habilitada',
  AREA_DESHABILITADA: 'Área deshabilitada',
  NUEVO_CONTRATO: 'Nuevo contrato',
  CONTRATO_EDITADO: 'Contrato editado',
  NUEVO_DEPARTAMENTO: 'Nuevo departamento',
  DEPARTAMENTO_EDITADO: 'Departamento editado',
  DEPARTAMENTO_HABILITADO: 'Departamento habilitado',
  DEPARTAMENTO_DESHABILITADO: 'Departamento deshabilitado',
  NUEVO_EMPLEADO: 'Nuevo empleado',
  EMPLEADO_EDITADO: 'Empleado editado',
  EMPLEADO_HABILITADO: 'Empleado habilitado',
  EMPLEADO_DESHABILITADO: 'Empleado deshabilitado',
  NUEVO_VISITANTE: 'Nuevo visitante',
  PAGO_DE_MENSUALIDAD: 'Pago de mensualidad',
  RECORDATORIO_CANCELACION: 'Recordatorio de cancelación',
  PAGO_CONTRATO: 'Pago de mensualidad',
};

/** Íconos (Font Awesome) por tipo de notificación. */
const ICONOS: Record<string, string> = {
  NUEVA_SOLICITUD_VISITA: 'fa-user-friends',
  VISITA_AUTORIZADA: 'fa-check-circle',
  VISITA_RECHAZADA: 'fa-times-circle',
  VISITA_CANCELADA: 'fa-ban',
  VISITA_INGRESADA: 'fa-sign-in-alt',
  RESERVA_CREADA: 'fa-calendar-plus',
  NUEVA_RESERVA: 'fa-calendar-plus',
  RESERVA_CONFIRMADA: 'fa-calendar-check',
  RESERVA_CANCELADA: 'fa-calendar-times',
  NUEVO_PAGO: 'fa-credit-card',
  NUEVO_RESIDENTE: 'fa-user-plus',
  RESIDENTE_EDITADO: 'fa-edit',
  RESIDENTE_HABILITADO: 'fa-user-check',
  RESIDENTE_DESHABILITADO: 'fa-user-slash',
  NUEVA_AREA: 'fa-plus-circle',
  AREA_EDITADA: 'fa-edit',
  AREA_HABILITADA: 'fa-play',
  AREA_DESHABILITADA: 'fa-pause',
  NUEVO_CONTRATO: 'fa-file-signature',
  CONTRATO_EDITADO: 'fa-edit',
  NUEVO_DEPARTAMENTO: 'fa-door-open',
  DEPARTAMENTO_EDITADO: 'fa-edit',
  DEPARTAMENTO_HABILITADO: 'fa-user-check',
  DEPARTAMENTO_DESHABILITADO: 'fa-door-closed',
  NUEVO_EMPLEADO: 'fa-user-plus',
  EMPLEADO_EDITADO: 'fa-edit',
  EMPLEADO_HABILITADO: 'fa-user-check',
  EMPLEADO_DESHABILITADO: 'fa-user-slash',
  NUEVO_VISITANTE: 'fa-user-plus',
  PAGO_DE_MENSUALIDAD: 'fa-credit-card',
  RECORDATORIO_CANCELACION: 'fa-clock',
  PAGO_CONTRATO: 'fa-credit-card',
};

/** "NUEVO_PAGO" → "Nuevo pago" (fallback cuando el tipo no está mapeado). */
const humanizar = (tipo: string): string =>
  tipo.split('_').map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');

/** Título legible del tipo (ej: "NUEVO_PAGO" → "Nuevo pago"). */
export const tipoNotificacionATitulo = (tipo: string): string =>
  TITULOS[tipo] ?? humanizar(tipo);

/** Ícono Font Awesome del tipo (ej: "NUEVO_PAGO" → "fa-credit-card"). */
export const tipoNotificacionAIcono = (tipo: string): string =>
  ICONOS[tipo] ?? 'fa-bell';

/** Horas de vida de una notificación (debe coincidir con el backend). */
export const HORAS_DE_VIDA_NOTIFICACION = 24;

/** Milisegundos de vida (24 h) — el frontend filtra por seguridad lo vencido. */
export const VIDA_MS_NOTIFICACION = HORAS_DE_VIDA_NOTIFICACION * 60 * 60 * 1000;

/**
 * Respuesta de GET /api/notificaciones.
 * El backend devuelve el reloj actual del servidor SQL (SYSDATETIME) como
 * `ahora_bd` para que el frontend calcule la edad de cada notificación contra
 * el reloj de la BD y no contra el del navegador (ver timestampAncladoABD).
 */
export interface NotificacionesResponse {
  /** ISO del SYSDATETIME() de SQL Server (mismo formato que fecha_envio). */
  ahora_bd: string | null;
  /** Filas de sp_ListarNotificaciones. */
  datos: NotificacionRaw[];
}

/**
 * Convierte un DATETIME2 de SQL Server (ISO, ej. "2026-08-14T01:16:13.443Z") a
 * un timestamp que representa la MISMA hora de pared (wall-clock) como si fuera
 * hora local.
 *
 * FIX (zona horaria): el driver mssql entrega el DATETIME2 como si fuera UTC
 * (fecha_envio se escribe con SYSDATETIME() = hora del servidor). Si se usara
 * `new Date(iso).getTime()`, getTimeAgo() (que compara contra Date.now() local)
 * quedaría desplazado por la zona horaria: en UTC-6 una notificación de hace
 * 1 min se veía "hace 6 h". Tratar la hora guardada como local devuelve el
 * tiempo transcurrido real SIEMPRE QUE el reloj del servidor SQL coincida con
 * el del navegador.
 */
const timestampLocalDesdeSql = (iso: string): number => {
  const partes = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!partes) return NaN;
  return new Date(
    Number(partes[1]),
    Number(partes[2]) - 1,
    Number(partes[3]),
    Number(partes[4]),
    Number(partes[5]),
    Number(partes[6])
  ).getTime();
};

/**
 * Timestamp de la notificación ANCLADO al reloj del servidor SQL.
 *
 * La edad real de la notificación es (reloj de la BD ahora − reloj de la BD al
 * crearla), porque fecha_envio y ahora_bd se escriben con la MISMA función
 * (SYSDATETIME()). Comparar fecha_envio contra Date.now() del navegador rompe
 * cuando el servidor SQL tiene su reloj/zona desfasado respecto a la máquina
 * del usuario (p. ej. el servidor está configurado en UTC y el navegador en
 * UTC-6: una notificación recién creada se veía "hace 6 h").
 *
 * Fórmula: timestamp = hora_de_pared(fecha_envio) − (hora_de_pared(ahora_bd)
 * − Date.now()). Si falta el ancla, se comporta como antes (reloj navegador).
 */
const timestampAncladoABD = (iso: string, ahoraBdIso: string | null | undefined): number => {
  const base = timestampLocalDesdeSql(iso);
  if (!Number.isFinite(base) || !ahoraBdIso) return base;
  const ahoraBd = timestampLocalDesdeSql(ahoraBdIso);
  if (!Number.isFinite(ahoraBd)) return base;
  return base - (ahoraBd - Date.now());
};

/**
 * Convierte una fila de sp_ListarNotificaciones en el NotificationItem que
 * consume la UI (DataContext / NotificationDropdown). El timestamp se calcula
 * desde fecha_envio para que el dropdown muestre "hace 5 min / hace 2 h".
 *
 * @param ahoraBd ISO de SYSDATETIME() que devuelve el backend: ancla la edad
 * de la notificación al reloj de la BD (ver timestampAncladoABD). Si se omite,
 * se usa el reloj del navegador (comportamiento original).
 */
export const transformarNotificacion = (
  raw: NotificacionRaw,
  ahoraBd?: string | null
): {
  id: number;
  title: string;
  message: string;
  time: string;
  read: boolean;
  icon: string;
  timestamp: number;
  tipo: string;
  id_referencia: number | null;
} => {
  const ts = timestampAncladoABD(raw.fecha_envio, ahoraBd);
  const timestamp = Number.isFinite(ts) ? ts : Date.now();
  return {
    id: raw.id_notificacion,
    title: tipoNotificacionATitulo(raw.tipo),
    message: raw.mensaje,
    time: '',
    read: Boolean(raw.leida),
    icon: tipoNotificacionAIcono(raw.tipo),
    timestamp,
    tipo: raw.tipo,
    id_referencia: raw.id_referencia ?? null,
  };
};

export interface ObtenerNotificacionesParams {
  /** true → solo no leídas; false → solo leídas; omitir → todas */
  soloNoLeidas?: boolean;
  /** Máximo de notificaciones a devolver (def: sin límite en backend, máx 100). */
  limite?: number;
}

export const notificacionesService = {
  /** GET /notificaciones — lista las notificaciones del usuario autenticado
   *  junto con el reloj actual de la BD (ahora_bd) para anclar la edad. */
  obtener: (params: ObtenerNotificacionesParams = {}): Promise<NotificacionesResponse> => {
    const query = new URLSearchParams();
    if (params.soloNoLeidas !== undefined) query.set('leida', params.soloNoLeidas ? '0' : '1');
    if (params.limite !== undefined) query.set('limite', String(params.limite));
    const qs = query.toString();
    return api.get<NotificacionesResponse>(`/notificaciones${qs ? `?${qs}` : ''}`);
  },

  /**
   * POST /notificaciones — persiste un aviso del usuario autenticado
   * (sp_CrearNotificacion). La campana se recarga desde la BD, así que sin
   * esto los avisos generados solo en la UI desaparecerían al siguiente poll.
   */
  crear: (tipo: string, mensaje: string, idReferencia?: number | null): Promise<{ message: string }> =>
    api.post('/notificaciones', { tipo, mensaje, id_referencia: idReferencia ?? null }),

  /** PATCH /notificaciones/:id/leida — marca UNA notificación como leída. */
  marcarLeida: (idNotificacion: number): Promise<{ message: string }> =>
    api.patch(`/notificaciones/${idNotificacion}/leida`),

  /** PATCH /notificaciones/marcar-todas — marca TODAS como leídas. */
  marcarTodasLeidas: (): Promise<{ message: string }> =>
    api.patch('/notificaciones/marcar-todas'),
};

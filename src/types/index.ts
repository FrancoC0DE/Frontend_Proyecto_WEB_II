/**
 * ============================================================================
 * Archivo: types/index.ts
 * ============================================================================
 *
 * ¿Qué contiene?
 * Todas las interfaces y tipos compartidos del sistema.
 *
 * Responsabilidades
 * - Definir la estructura de datos de: Reserva, Visitante, Personal,
 *   Residente, Contrato, AreaInquilino, ActivityItem, NotificationItem
 * - Definir tipos auxiliares como UserRole
 *
 * Se comunica con
 * - TODOS los archivos del proyecto (es el contrato de datos central)
 * - DataContext.tsx (usa estos tipos para su estado global)
 * - Cada página usa estos tipos para mostrar datos
 *
 * Datos actuales
 * Las páginas consumen la API real del backend; estas interfaces tipan
 * las respuestas y el estado global.
 *
 * ============================================================================
 */

// Para el panel de Inquilino (estructura diferente)
export interface AreaInquilino {
  id: number;
  nombre: string;
  imagen: string;
  capacidad: number;
  horario_inicio: number;
  horario_fin: number;
  costo_por_hora: number;
  disponible: boolean;
}

/**
 * NOTA: en la app conviven DOS formas de `Reserva` con vocabularios distintos:
 *  - Forma panel Admin (id_reserva, id_area, cantidad_personas, estado
 *    'Reservado'|'Completado'|'Cancelado') usada por ReservasPage.tsx y por
 *    DataContext.recargarReservas() (panel admin).
 *  - Forma panel Inquilino (id, personas, costo, pago_estado, estados
 *    'Confirmada'|'Pendiente'|'Cancelada'|...) usada por MisReservasPage,
 *    NuevaReservaPage e InquilinoDashboard; se llena desde la API de inquilino
 *    (recargarReservasInquilino → inquilinoService).
 * Se amplió la interfaz para admitir ambas formas: `estado` pasa a ser string
 * y los campos de la forma admin quedan opcionales (la UI los lee con `??`/`!`),
 * mientras los de la forma inquilino son obligatorios porque las páginas los
 * consumen como valores garantizados.
 */
export interface Reserva {
  // --- Presentes en ambas formas ---
  area: string;
  fecha: string;            // 'YYYY-MM-DD'
  hora_inicio: string;      // 'HH:mm:ss'
  hora_fin: string;         // 'HH:mm:ss'
  // Unión de los estados usados por ambas formas (admin: 'Reservado' |
  // 'Completado' | 'Cancelado'; inquilino: 'Confirmada' | 'Pendiente' |
  // 'Cancelada' | 'Finalizada' — sp_FinalizarReservasVencidas escribe
  // 'Finalizada' en femenino).
  // Se usa la unión (no `string`) para que `tsc -b` compile y aun así detecte
  // estados mal escritos (ej: 'Canceladdo').
  estado: 'Reservado' | 'Completado' | 'Cancelado' | 'Confirmada' | 'Pendiente' | 'Cancelada' | 'Finalizada';

  // --- Forma panel Admin ---
  id_reserva?: number;
  id_usuario?: number;
  residente?: string;
  id_area?: number;
  cantidad_personas?: number;
  estado_pago?: string | null;
  monto?: number | null;
  fecha_creacion?: string;

  // --- Forma panel Inquilino ---
  id: number;
  departamento?: string;
  personas: number;
  costo: number;
  pago_estado: string;
  horas_anticipacion_cancelacion?: number;
  hora?: string;
}

export interface Visitante {
  id: number;
  nombre_completo?: string;
  nombre?: string;
  documento_identidad?: string;
  documento?: string;
  placa: string;
  fecha_autorizacion?: string;
  estado: string;
  autoriza?: string;
  departamento?: string;
  motivo_rechazo?: string;
  hora_esperada?: string;
}

export interface Personal {
  id_usuario: number;
  nombre: string;
  correo: string;
  /** Correo real para recibir el código 2FA (lo usan Admin/Guarda) */
  correoContacto?: string;
  dominio: string;
  telefono: string;
  cedula: string;
  estado: string;
  iniciales: string;
}

export interface Residente {
  id: number;
  nombre: string;
  departamento: string;
  correo: string;
  telefono: string;
  cedula?: string;
  contrato_estado: string;
  estado: string;
}

export interface Departamento {
  id_departamento: number;
  numero: string;
  piso?: number | null;
  metros_cuadrados?: number | null;
  /** 'Disponible' | 'Ocupado' — lo gestiona el ciclo de vida del contrato (no se edita a mano). */
  estado: string;
  /** true = habilitado, false = deshabilitado (lo gestiona el admin). */
  activo: boolean;
  fecha_registro?: string;
}

export interface Contrato {
  id_contrato: number;
  id_usuario: number;
  residente: string;
  id_departamento: number;
  departamento: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  /** Monto mensual del contrato (colones CR). Opcional por compatibilidad con la vista VW_Contratos. */
  monto_mensual?: number;
  /** Monto del depósito (colones CR). Opcional por compatibilidad con la vista VW_Contratos. */
  monto_deposito?: number;
}

/**
 * Registro de auditoría devuelto por GET /api/bitacora (sp_ObtenerBitacora).
 * `usuario_nombre`/`usuario_rol` son NULL cuando el evento lo generó el sistema
 * (ej: LOGOUT/EXPIRADA) y `dato_anterior`/`dato_nuevo` son JSON en texto.
 */
export interface BitacoraRegistro {
  id_bitacora: number;
  /** Fecha/hora del evento (la BD la devuelve como Date; la UI la formatea local). */
  fecha_evento: string;
  /** INSERT | UPDATE | DELETE | LOGIN | LOGOUT | EXPIRADA */
  operacion: string;
  /** Nombre técnico de la tabla afectada (ej: 'Reserva'). */
  tabla_afectada: string;
  descripcion: string | null;
  ip_origen: string | null;
  /** JSON en texto con el estado anterior (NULL en INSERT) o null si no aplica. */
  dato_anterior: string | null;
  /** JSON en texto con el estado nuevo (NULL en DELETE) o null si no aplica. */
  dato_nuevo: string | null;
  id_usuario: number | null;
  /** Nombre completo del usuario o NULL → 'Sistema'. */
  usuario_nombre: string | null;
  /** Administrador | Guarda | Inquilino | null */
  usuario_rol: string | null;
}

/** Respuesta paginada de GET /api/bitacora. */
export interface BitacoraResponse {
  pagina: number;
  limite: number;
  totalRegistros: number;
  totalPaginas: number;
  datos: BitacoraRegistro[];
}

export interface ActivityItem {
  id: number;
  descripcion: string;
  icono: string;
  color: string;
  fecha: string;
  hora: string;
  timestamp: number;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  /** Texto de hora; la UI moderna usa el timestamp y getTimeAgo ("hace 5 min"). */
  time: string;
  read: boolean;
  icon: string;
  timestamp: number;
  /** Tipo del evento en la BD (NUEVA_SOLICITUD_VISITA, RESERVA_CREADA, etc.). */
  tipo?: string;
  /** ID de la entidad relacionada (reserva, visita, usuario...) — enlaces directos. */
  id_referencia?: number | null;
}

export interface ProfileData {
  nombre: string;
  correo: string;
  telefono: string;
  password: string;
  avatar: string;
}

export type UserRole = 'admin' | 'guardia' | 'inquilino';



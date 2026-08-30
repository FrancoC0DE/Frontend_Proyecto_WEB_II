/**
 * ============================================================================
 * Archivo: useLocalDate.ts
 * ============================================================================
 *
 * ¿Qué hace?
 * Contiene funciones de utilidad para manejar fechas y horas en formato local.
 * No es un hook de React (no usa useState ni useEffect), sino funciones puras.
 *
 * Funciones que expone
 * - getLocalDateString(date?)  → Retorna "YYYY-MM-DD"
 * - formatHora(hora24)         → Convierte "15:30" a "03:30 PM"
 * - formatHoraAMPM(hora24)     → Convierte "15:30" a "3:30 p.m."
 * - toDateOnly(fecha)          → Convierte ISO SQL Server ("...T00:00:00.000Z")
 *                                 a "YYYY-MM-DD" plano (o la deja igual si ya lo es)
 * - toTimeOnly(hora)           → Convierte ISO SQL Server (TIME/DATETIME) a
 *                                 "HH:mm:ss" plano (o la deja igual si ya lo es)
 * - getTimeAgo(timestamp)      → Retorna "hace 5 min", "hace 3 h", etc.
 * - getGreeting()              → Retorna "Buenos días / tardes / noches"
 *
 * Quién las utiliza
 * - AdminDashboard, ReservasPage, AreasPage, VisitasPage
 * - InquilinoDashboard, MisReservasPage, NuevaReservaPage
 * - DataContext.tsx (toDateOnly/toTimeOnly, para normalizar lo que devuelve
 *   el backend de Inquilino antes de guardarlo en el estado)
 * - Cualquier componente que muestre fechas u horas
 *
 * ============================================================================
 */

export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatHora(hora24: string): string {
  if (!hora24) return '--:--';
  const [h, m] = hora24.split(':').map(Number);
  // Entradas malformadas (sin ":", ej. un Date serializado por SQL Server)
  // no deben romper el render: se devuelve el placeholder en vez de crashear.
  if (Number.isNaN(h) || Number.isNaN(m)) return '--:--';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function formatHoraAMPM(hora24: string): string {
  if (!hora24) return '--:--';
  const partes = hora24.split(':');
  let h = parseInt(partes[0]);
  const m = partes[1] || '00';
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  if (h > 12) h = h - 12;
  if (h === 0) h = 12;
  return h + ':' + m + ' ' + ampm;
}

/**
 * Convierte un valor de fecha que puede venir como "YYYY-MM-DD" (ya plano)
 * o como ISO completo (lo que devuelve SQL Server al serializar una columna
 * DATE, ej. "2026-08-15T00:00:00.000Z") a un string plano "YYYY-MM-DD".
 * Usa los componentes UTC porque SQL Server no aplica timezone a DATE: la
 * "T00:00:00.000Z" es solo un artefacto de la serialización, no una hora real.
 */
export function toDateOnly(fecha: string): string {
  if (!fecha) return '';
  if (!fecha.includes('T')) return fecha;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return fecha;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convierte un valor de hora que puede venir como "HH:mm[:ss]" (ya plano, lo
 * que devuelven las columnas TIME de Postgres o un to_char(...) del backend)
 * o como ISO completo de un TIMESTAMPTZ real (ej. hora_esperada/
 * fecha_hora_estimada de Visitante: "2026-08-30T04:24:00.000Z") a "HH:mm:ss".
 *
 * IMPORTANTE (post-migración a Postgres): un TIMESTAMPTZ es un INSTANTE
 * absoluto, no una hora de pared — su parte "Z" es UTC real, no un artefacto
 * de serialización como en SQL Server (que devolvía las columnas TIME como
 * "1970-01-01T13:00:00.000Z" donde el UTC SÍ era la hora de pared). Por eso
 * el fallback usa los componentes LOCALES del navegador (getHours, no
 * getUTCHours): asume que el navegador corre en la misma zona de negocio que
 * el backend (DB_TIMEZONE, ver confDB.ts), igual que hace to_char en Postgres.
 * Usar getUTCHours aquí mostraría la hora UTC cruda en vez de la hora real
 * (ej. una visita a las 10:24 p.m. de Costa Rica se vería como 4:24 a.m.).
 */
export function toTimeOnly(hora: string): string {
  if (!hora) return '';
  // Si ya viene como "HH:mm:ss" o "HH:mm" (sin espacio ni T), devolver tal cual
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) return hora;
  // Si viene como DATETIME con espacio (SQL Server: "2026-08-22 00:00:00.0000000")
  // o ISO con T ("2026-08-22T00:00:00.000Z"), extraer solo la parte de hora
  if (hora.includes(' ')) {
    const partes = hora.split(' ');
    const tiempo = partes[partes.length - 1]; // "00:00:00.0000000"
    // Quitar milisegundos si existen
    const sinMs = tiempo.split('.')[0]; // "00:00:00"
    return sinMs || hora;
  }
  const d = new Date(hora);
  if (isNaN(d.getTime())) return hora;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'hace unos segundos';
  if (minutes < 60) return `hace ${minutes} min`;
  if (hours < 24) return `hace ${hours} h`;
  if (days < 7) return `hace ${days} días`;
  return new Date(timestamp).toLocaleDateString('es-ES');
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  // 12:00 a. m. – 11:59 a. m. → Buenos días
  if (hour >= 0 && hour < 12) return 'Buenos días';
  // 12:00 p. m. – 6:59 p. m. → Buenas tardes
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  // 7:00 p. m. – 11:59 p. m. → Buenas noches
  return 'Buenas noches';
}
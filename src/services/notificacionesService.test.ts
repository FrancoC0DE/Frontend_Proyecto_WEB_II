/**
 * Pruebas de transformarNotificacion — en especial el FIX de zona horaria:
 * el DATETIME2 de SQL Server llega serializado como UTC, pero el backend lo
 * escribe con SYSDATETIME() (hora del servidor). Si se interpretara como UTC,
 * el "hace X min" del dropdown quedaría desplazado por la zona horaria (en
 * UTC-6, una notificación de hace 1 min se veía "hace 6 h"). El helper
 * timestampLocalDesdeSql reconstruye el timestamp tratando la hora de pared
 * que guardó la BD como hora LOCAL, así el tiempo transcurrido es el real.
 */
import { describe, it, expect } from 'vitest';
import { transformarNotificacion, type NotificacionRaw } from './notificacionesService';

/** Construye el ISO "YYYY-MM-DDTHH:mm:ss.sssZ" de una fecha (mismo formato
 *  que produce res.json al serializar un Date del driver mssql). */
const isoDeHoraLocal = (fecha: Date): string => {
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}` +
    `T${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}.000Z`;
};

const rawBase: NotificacionRaw = {
  id_notificacion: 1,
  id_usuario: 2,
  tipo: 'NUEVA_SOLICITUD_VISITA',
  mensaje: 'Prueba',
  id_referencia: null,
  fecha_envio: '',
  leida: false,
};

describe('transformarNotificacion (fix de zona horaria)', () => {
  it('timestamp de una notificación recién creada ≈ ahora (sin desfase UTC)', () => {
    // Simula una notificación creada hace ~1 s en la BD (hora de pared local).
    const haceUnSegundo = new Date(Date.now() - 1000);
    const item = transformarNotificacion({
      ...rawBase,
      fecha_envio: isoDeHoraLocal(haceUnSegundo),
    });

    // Con el fix, el timestamp queda a < 2 s de Date.now() sin importar la
    // zona horaria de la máquina donde corra el test. Sin el fix, en zonas
    // con offset UTC negativo el desfase sería de horas.
    expect(Math.abs(Date.now() - item.timestamp)).toBeLessThan(2000);
  });

  it('ancla la edad al reloj de la BD cuando el servidor está 6 h desfasado', () => {
    // Simula el caso real reportado: el servidor SQL tiene su reloj/zona 6 h
    // ATRÁS respecto al navegador. La notificación se creó "hace ~1 s" según
    // el reloj del servidor (SYSDATETIME), que es el que usa el trigger.
    const ahoraBD = new Date(Date.now() - 6 * 3600 * 1000); // reloj de la BD (6 h atrás)
    const haceUnSegundoBD = new Date(ahoraBD.getTime() - 1000);

    const sinAncla = transformarNotificacion({
      ...rawBase,
      fecha_envio: isoDeHoraLocal(haceUnSegundoBD),
    });
    // Sin el ancla, la edad quedaría corrida ~6 h (el bug que se reportó).
    expect(Date.now() - sinAncla.timestamp).toBeGreaterThan(5 * 3600 * 1000);

    const conAncla = transformarNotificacion({
      ...rawBase,
      fecha_envio: isoDeHoraLocal(haceUnSegundoBD),
    }, isoDeHoraLocal(ahoraBD));
    // Con el ancla (SYSDATETIME devuelto por el backend), la edad es real.
    expect(Math.abs(Date.now() - conAncla.timestamp)).toBeLessThan(2000);
  });

  it('respeta la caducidad de 24 h con el ancla (23 h visible, 25 h caducada)', () => {
    // Mismo escenario real: reloj de la BD 6 h atrás respecto al navegador.
    const ahoraBD = new Date(Date.now() - 6 * 3600 * 1000);
    const H24 = 24 * 3600 * 1000;

    // Creada hace ~23 h (según el reloj de la BD) → edad real ~23 h → debe
    // seguir pasando el filtro de 24 h del frontend (ahora - timestamp < 24 h).
    const hace23hBD = new Date(ahoraBD.getTime() - 23 * 3600 * 1000);
    const item23 = transformarNotificacion({
      ...rawBase,
      fecha_envio: isoDeHoraLocal(hace23hBD),
    }, isoDeHoraLocal(ahoraBD));
    const edad23 = Date.now() - item23.timestamp;
    expect(edad23).toBeGreaterThanOrEqual(23 * 3600 * 1000 - 2000);
    expect(edad23).toBeLessThan(H24); // sigue dentro de las 24 h

    // Creada hace ~25 h (según el reloj de la BD) → edad real ~25 h → el
    // filtro de 24 h la debe descartar.
    const hace25hBD = new Date(ahoraBD.getTime() - 25 * 3600 * 1000);
    const item25 = transformarNotificacion({
      ...rawBase,
      fecha_envio: isoDeHoraLocal(hace25hBD),
    }, isoDeHoraLocal(ahoraBD));
    expect(Date.now() - item25.timestamp).toBeGreaterThanOrEqual(H24);
  });

  it('acepta la fecha SIN la letra Z (formato local que envía el backend)', () => {
    // El backend ahora entrega fecha_envio y ahora_bd sin el marcador UTC
    // (ej. "2026-08-14T13:32:07.063" en lugar de "...Z"). El parser debe
    // tratarla igual: componentes como hora local, sin doble conversión.
    const haceUnSegundo = new Date(Date.now() - 1000);
    const isoLocalSinZ = isoDeHoraLocal(haceUnSegundo).replace('Z', '');
    expect(isoLocalSinZ.endsWith('Z')).toBe(false);

    const item = transformarNotificacion({
      ...rawBase,
      fecha_envio: isoLocalSinZ,
    });
    expect(Math.abs(Date.now() - item.timestamp)).toBeLessThan(2000);
  });

  it('ignora un ancla inválido y cae al comportamiento anterior', () => {
    const haceUnSegundo = new Date(Date.now() - 1000);
    const item = transformarNotificacion({
      ...rawBase,
      fecha_envio: isoDeHoraLocal(haceUnSegundo),
    }, 'no-es-fecha');
    expect(Math.abs(Date.now() - item.timestamp)).toBeLessThan(2000);
  });

  it('mapea el tipo PAGO_CONTRATO (creado por el módulo de pagos)', () => {
    const item = transformarNotificacion({
      ...rawBase,
      id_notificacion: 42,
      tipo: 'PAGO_CONTRATO',
      mensaje: 'El inquilino X pagó.',
      leida: true,
    });

    expect(item.id).toBe(42);
    expect(item.title).toBe('Pago de mensualidad');
    expect(item.message).toBe('El inquilino X pagó.');
    expect(item.read).toBe(true);
    expect(item.icon).toBe('fa-credit-card');
  });

  it('humaniza tipos desconocidos y usa el ícono por defecto', () => {
    const item = transformarNotificacion({ ...rawBase, tipo: 'EVENTO_PRUEBA' });
    expect(item.title).toBe('Evento Prueba');
    expect(item.icon).toBe('fa-bell');
  });

  it('fallback a Date.now() si la fecha no es parseable', () => {
    const item = transformarNotificacion({ ...rawBase, fecha_envio: 'no-es-fecha' });
    expect(Math.abs(Date.now() - item.timestamp)).toBeLessThan(2000);
  });
});

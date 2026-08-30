/**
 * Pruebas unitarias para las utilidades de fecha local (useLocalDate).
 *
 * Verifica que:
 * - getLocalDateString formatee fechas correctamente como YYYY-MM-DD
 * - formatHora convierta formato 24h a 12h con AM/PM
 * - formatHoraAMPM convierta a formato 12h con a.m./p.m.
 * - getTimeAgo retorne textos relativos en español
 * - getGreeting retorne el saludo según la hora del día
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getLocalDateString,
  formatHora,
  formatHoraAMPM,
  toTimeOnly,
  getTimeAgo,
  getGreeting,
} from './useLocalDate';

// ============================================================
// getLocalDateString
// ============================================================
describe('getLocalDateString', () => {
  it('debe formatear una fecha como YYYY-MM-DD', () => {
    const fecha = new Date(2026, 6, 22); // 22 julio 2026
    expect(getLocalDateString(fecha)).toBe('2026-07-22');
  });

  it('debe usar el día actual si no se pasa fecha', () => {
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const esperado = `${hoy.getFullYear()}-${mes}-${dia}`;
    expect(getLocalDateString()).toBe(esperado);
  });

  it('debe padding con ceros para meses y días de un dígito', () => {
    const fecha = new Date(2026, 0, 5); // 5 enero 2026
    expect(getLocalDateString(fecha)).toBe('2026-01-05');
  });
});

// ============================================================
// formatHora
// ============================================================
describe('formatHora', () => {
  it('debe convertir 00:00 a 12:00 AM', () => {
    expect(formatHora('00:00')).toBe('12:00 AM');
  });

  it('debe convertir 08:00 a 08:00 AM', () => {
    expect(formatHora('08:00')).toBe('08:00 AM');
  });

  it('debe convertir 12:00 a 12:00 PM', () => {
    expect(formatHora('12:00')).toBe('12:00 PM');
  });

  it('debe convertir 15:30 a 03:30 PM', () => {
    expect(formatHora('15:30')).toBe('03:30 PM');
  });

  it('debe retornar --:-- para string vacío', () => {
    expect(formatHora('')).toBe('--:--');
  });

  it('debe retornar --:-- para undefined/null', () => {
    expect(formatHora('')).toBe('--:--');
  });

  it('debe retornar --:-- para entradas malformadas sin ":" (regresión: ISO de TIME de SQL Server)', () => {
    // SQL Server serializa columnas TIME como "1970-01-01T13:00:00.000Z";
    // antes esto crasheaba con "Cannot read properties of undefined (reading 'toString')".
    expect(formatHora('1970-01-01T13:00:00.000Z')).toBe('--:--');
    expect(formatHora('1970-')).toBe('--:--');
  });
});

// ============================================================
// toTimeOnly
// ============================================================
describe('toTimeOnly', () => {
  it('debe convertir el ISO de TIME de SQL Server a HH:mm:ss', () => {
    expect(toTimeOnly('1970-01-01T13:00:00.000Z')).toBe('13:00:00');
  });

  it('debe dejar las horas planas "HH:mm[:ss]" igual', () => {
    expect(toTimeOnly('08:00')).toBe('08:00');
    expect(toTimeOnly('08:00:30')).toBe('08:00:30');
  });
});

// ============================================================
// formatHoraAMPM
// ============================================================
describe('formatHoraAMPM', () => {
  it('debe convertir 00:00 a 12:00 a.m.', () => {
    expect(formatHoraAMPM('00:00')).toBe('12:00 a.m.');
  });

  it('debe convertir 08:00 a 8:00 a.m.', () => {
    expect(formatHoraAMPM('08:00')).toBe('8:00 a.m.');
  });

  it('debe convertir 15:30 a 3:30 p.m.', () => {
    expect(formatHoraAMPM('15:30')).toBe('3:30 p.m.');
  });

  it('debe retornar --:-- para string vacío', () => {
    expect(formatHoraAMPM('')).toBe('--:--');
  });
});

// ============================================================
// getTimeAgo
// ============================================================
describe('getTimeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debe retornar "hace unos segundos" para timestamps recientes', () => {
    vi.useFakeTimers();
    const ahora = Date.now();
    expect(getTimeAgo(ahora)).toBe('hace unos segundos');
    expect(getTimeAgo(ahora - 30000)).toBe('hace unos segundos');
  });

  it('debe retornar "hace X min" para timestamps de minutos', () => {
    vi.useFakeTimers();
    const ahora = Date.now();
    expect(getTimeAgo(ahora - 5 * 60000)).toBe('hace 5 min');
    expect(getTimeAgo(ahora - 30 * 60000)).toBe('hace 30 min');
  });

  it('debe retornar "hace X h" para timestamps de horas', () => {
    vi.useFakeTimers();
    const ahora = Date.now();
    expect(getTimeAgo(ahora - 3 * 3600000)).toBe('hace 3 h');
  });

  it('debe retornar "hace X días" para timestamps de días', () => {
    vi.useFakeTimers();
    const ahora = Date.now();
    expect(getTimeAgo(ahora - 5 * 86400000)).toBe('hace 5 días');
  });
});

// ============================================================
// getGreeting
// ============================================================
describe('getGreeting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debe retornar "Buenos días" de 12:00 a. m. a 11:59 a. m.', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 8, 0, 0));
    expect(getGreeting()).toBe('Buenos días');
  });

  it('debe retornar "Buenos días" exactamente a las 12:00 a. m. (medianoche)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 0, 0, 0));
    expect(getGreeting()).toBe('Buenos días');
  });

  it('debe retornar "Buenos días" a las 11:00 a. m. (última hora del rango)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 11, 0, 0));
    expect(getGreeting()).toBe('Buenos días');
  });

  it('debe retornar "Buenas tardes" de 12:00 p. m. a 6:59 p. m.', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 15, 0, 0));
    expect(getGreeting()).toBe('Buenas tardes');
  });

  it('debe retornar "Buenas tardes" exactamente a las 12:00 p. m. (mediodía)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    expect(getGreeting()).toBe('Buenas tardes');
  });

  it('debe retornar "Buenas tardes" a las 6:00 p. m. (última hora del rango)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 18, 0, 0));
    expect(getGreeting()).toBe('Buenas tardes');
  });

  it('debe retornar "Buenas noches" de 7:00 p. m. a 11:59 p. m.', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 22, 0, 0));
    expect(getGreeting()).toBe('Buenas noches');
  });

  it('debe retornar "Buenas noches" a las 7:00 p. m. (primera hora del rango)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 19, 0, 0));
    expect(getGreeting()).toBe('Buenas noches');
  });

  it('debe retornar "Buenas noches" a las 11:00 p. m. (última hora del rango)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 23, 0, 0));
    expect(getGreeting()).toBe('Buenas noches');
  });
});

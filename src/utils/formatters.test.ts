/**
 * Pruebas unitarias para los formateadores de la app (formatters.ts).
 *
 * Verifica que:
 * - formatearMoneda devuelva colones CR con PUNTOS para miles (₡3.000),
 *   independiente de la ICU del navegador (toLocaleString('es-CR') separa
 *   con espacio U+00A0 en Chrome/Node, lo que NO queremos).
 * - formatearTelefono / formatearCedula mantengan sus máscaras.
 */

import { describe, it, expect } from 'vitest';
import {
  formatearMoneda,
  formatearTelefono,
  formatearCedula,
  validarCedula,
  validarTelefono,
  formatearPlaca,
  validarPlaca,
  validarCorreoDominio,
} from './formatters';

// ============================================================
// formatearMoneda
// ============================================================
describe('formatearMoneda', () => {
  it('debe formatear 3000 como ₡3.000 (puntos para miles)', () => {
    expect(formatearMoneda(3000)).toBe('₡3.000');
  });

  it('debe formatear 1234567 como ₡1.234.567', () => {
    expect(formatearMoneda(1234567)).toBe('₡1.234.567');
  });

  it('debe formatear 0 como ₡0', () => {
    expect(formatearMoneda(0)).toBe('₡0');
  });

  it('debe redondear sin decimales: 1234.5 → ₡1.235', () => {
    expect(formatearMoneda(1234.5)).toBe('₡1.235');
  });

  it('debe dejar los montos sin miles igual: 950 → ₡950', () => {
    expect(formatearMoneda(950)).toBe('₡950');
  });

  it('NUNCA debe usar espacio ni espacio no separable como separador de miles', () => {
    expect(formatearMoneda(3000)).not.toMatch(/[\s\u00A0\u202F]/);
    expect(formatearMoneda(1234567)).not.toMatch(/[\s\u00A0\u202F]/);
  });
});

// ============================================================
// formatearTelefono
// ============================================================
describe('formatearTelefono', () => {
  it('debe formatear 77777777 como 7777-7777', () => {
    expect(formatearTelefono('77777777')).toBe('7777-7777');
  });

  it('debe ignorar caracteres no numéricos y limitar a 8 dígitos', () => {
    expect(formatearTelefono('77 77-7777 x99')).toBe('7777-7777');
  });

  it('debe dejar sin guion los números de 4 dígitos o menos', () => {
    expect(formatearTelefono('1234')).toBe('1234');
  });
});

// ============================================================
// formatearCedula
// ============================================================
describe('formatearCedula', () => {
  it('debe formatear 123456789 como 1-2345-6789', () => {
    expect(formatearCedula('123456789')).toBe('1-2345-6789');
  });

  it('debe limitar a 9 dígitos', () => {
    expect(formatearCedula('1234567890123')).toBe('1-2345-6789');
  });

  it('debe formatear parcialmente mientras se escribe (3 dígitos → 1-23)', () => {
    expect(formatearCedula('123')).toBe('1-23');
  });

  it('debe formatear parcialmente mientras se escribe (6 dígitos → 1-2345-6)', () => {
    expect(formatearCedula('123456')).toBe('1-2345-6');
  });
});

// ============================================================
// validarCedula
// ============================================================
describe('validarCedula', () => {
  it('debe aceptar el formato nuevo 1-2345-6789', () => {
    expect(validarCedula('1-2345-6789')).toBeNull();
  });

  it('debe rechazar el formato antiguo 1-234-56789', () => {
    expect(validarCedula('1-234-56789')).toBe('La cédula debe tener el formato 1-2345-6789 y comenzar con un dígito válido (1-7).');
  });

  it('debe aceptar cédulas vacías (opcional, no es error)', () => {
    expect(validarCedula('')).toBeNull();
    expect(validarCedula('   ')).toBeNull();
  });

  it('debe rechazar cédulas que empiezan con 0, 8 o 9', () => {
    expect(validarCedula('0-2345-6789')).toBe('La cédula debe tener el formato 1-2345-6789 y comenzar con un dígito válido (1-7).');
    expect(validarCedula('8-2345-6789')).toBe('La cédula debe tener el formato 1-2345-6789 y comenzar con un dígito válido (1-7).');
    expect(validarCedula('9-2345-6789')).toBe('La cédula debe tener el formato 1-2345-6789 y comenzar con un dígito válido (1-7).');
  });

  it('debe aceptar cédulas que empiezan con 1 o 2 (válidas en CR)', () => {
    expect(validarCedula('1-2345-6789')).toBeNull();
    expect(validarCedula('2-3456-7890')).toBeNull();
  });
});

// ============================================================
// validarTelefono
// ============================================================
describe('validarTelefono', () => {
  it('debe rechazar 0000-0000', () => {
    expect(validarTelefono('0000-0000')).toBe('El teléfono no puede ser 0000-0000.');
  });

  it('debe aceptar un teléfono válido 7777-7777', () => {
    expect(validarTelefono('7777-7777')).toBeNull();
  });
});

// ============================================================
// formatearPlaca / validarPlaca
// ============================================================
describe('formatearPlaca', () => {
  it('debe formatear abc123 como ABC-123 (mayúsculas y guion)', () => {
    expect(formatearPlaca('abc123')).toBe('ABC-123');
  });

  it('debe limitar a 6 caracteres y limpiar símbolos', () => {
    expect(formatearPlaca('abc-123xyz')).toBe('ABC-123');
  });

  it('debe dejar sin guion mientras hay 3 o menos caracteres', () => {
    expect(formatearPlaca('ab')).toBe('AB');
  });
});

describe('validarPlaca', () => {
  it('debe aceptar ABC-123', () => {
    expect(validarPlaca('ABC-123')).toBeNull();
  });

  it('debe rechazar formatos inválidos', () => {
    expect(validarPlaca('ABC12')).toBe('La placa debe tener el formato ABC-123 (3 letras + 3 números).');
    expect(validarPlaca('123-ABC')).toBe('La placa debe tener el formato ABC-123 (3 letras + 3 números).');
  });

  it('debe aceptar placas vacías (opcional, no es error)', () => {
    expect(validarPlaca('')).toBeNull();
  });
});

// ============================================================
// validarCorreoDominio
// ============================================================
describe('validarCorreoDominio', () => {
  it('debe aceptar gmail, hotmail, outlook y yahoo', () => {
    expect(validarCorreoDominio('hola@gmail.com')).toBeNull();
    expect(validarCorreoDominio('hola@hotmail.com')).toBeNull();
    expect(validarCorreoDominio('hola@outlook.com')).toBeNull();
    expect(validarCorreoDominio('hola@yahoo.com')).toBeNull();
  });

  it('debe rechazar dominios fuera de la lista', () => {
    expect(validarCorreoDominio('hola@perrastodas.com')).toBe('Solo se permiten correos con dominio público (gmail.com, hotmail.com, outlook.com, yahoo.com).');
  });

  it('debe aceptar correos vacíos (opcional, no es error)', () => {
    expect(validarCorreoDominio('')).toBeNull();
  });
});

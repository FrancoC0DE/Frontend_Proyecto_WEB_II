/**
 * ============================================================================
 * Archivo: formatters.ts
 * ============================================================================
 * Utilidades de formato de campos de formularios (máscaras de entrada).
 *
 * - formatearTelefono → 7777-7777 (8 dígitos, guion en el medio)
 * - formatearCedula   → #-####-#### (9 dígitos en total)
 * ============================================================================
 */

/**
 * Moneda (colones CR, sin decimales): 1234.5 → ₡1.235 — puntos para miles,
 * convención ₡ de toda la app.
 *
 * NOTA: se formatea a mano (regex de separación de miles) en lugar de
 * `toLocaleString('es-CR')` porque en Chrome/Node la ICU moderna separa los
 * miles con un espacio no separable (U+00A0 → "₡3 000") y la app quiere
 * puntos ("₡3.000"). Así el resultado es idéntico en cualquier navegador.
 */
export const formatearMoneda = (valor: number): string => {
  const entero = String(Math.round(valor));
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₡${conPuntos}`;
};

/** Teléfono: 7777-7777 (8 dígitos, guion en el medio) */
export const formatearTelefono = (valor: string): string => {
  const digitos = valor.replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 4) return digitos;
  return `${digitos.slice(0, 4)}-${digitos.slice(4)}`;
};

/** Cédula: #-####-#### (9 dígitos en total) */
export const formatearCedula = (valor: string): string => {
  const digitos = valor.replace(/\D/g, '').slice(0, 9);
  if (digitos.length <= 1) return digitos;
  if (digitos.length <= 5) return `${digitos[0]}-${digitos.slice(1)}`;
  return `${digitos[0]}-${digitos.slice(1, 5)}-${digitos.slice(5)}`;
};

/**
 * Valida un teléfono con el formato 7777-7777 (8 dígitos).
 * Devuelve un mensaje de error legible o null si es válido (o está vacío).
 */
export const validarTelefono = (valor: string): string | null => {
  const limpio = valor.trim();
  if (!limpio) return null; // opcional: vacío no es error
  if (!/^\d{4}-\d{4}$/.test(limpio)) {
    return 'El teléfono debe tener el formato 7777-7777 (8 dígitos).';
  }
  if (limpio === '0000-0000') {
    return 'El teléfono no puede ser 0000-0000.';
  }
  return null;
};

/**
 * Valida una cédula con el formato #-###-##### (9 dígitos en total).
 * El primer dígito debe estar entre 1 y 7 (las cédulas costarricenses válidas
 * no empiezan con 0, 8 ni 9).
 * Devuelve un mensaje de error legible o null si es válida (o está vacía).
 */
export const validarCedula = (valor: string): string | null => {
  const limpio = valor.trim();
  if (!limpio) return null; // opcional: vacío no es error
  if (!/^[1-7]-\d{4}-\d{4}$/.test(limpio)) {
    return 'La cédula debe tener el formato 1-2345-6789 y comenzar con un dígito válido (1-7).';
  }
  return null;
};

/**
 * Valida un nombre completo: solo letras (con acentos/ñ) y espacios, sin
 * dígitos ni símbolos.
 * Devuelve un mensaje de error legible o null si es válido (o está vacío).
 */
export const validarNombre = (valor: string): string | null => {
  const limpio = valor.trim();
  if (!limpio) return null; // opcional: vacío no es error (el required del input lo exige)
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:[ '-][A-Za-zÁÉÍÓÚÑáéíóúñ]+)*$/.test(limpio)) {
    return 'El nombre solo puede contener letras.';
  }
  return null;
};

/**
 * Valida el documento de un visitante (cédula o pasaporte). Si el valor es
 * solo dígitos/guiones se exige el formato de cédula costarricense
 * (1-2345-6789, primer dígito 1-7); si contiene letras se acepta como
 * pasaporte/otro documento sin más restricción de formato.
 * Devuelve un mensaje de error legible o null si es válido (o está vacío).
 */
export const validarDocumentoVisitante = (valor: string): string | null => {
  const limpio = valor.trim();
  if (!limpio) return null; // opcional: vacío no es error (el required del input lo exige)
  if (/^[\d-]+$/.test(limpio)) {
    return validarCedula(limpio);
  }
  return null;
};

/**
 * Formatea una placa de vehículo a formato costarricense de carro:
 * ABC123 → ABC-123 (3 letras + 3 números, máximo 6 caracteres).
 */
export const formatearPlaca = (valor: string): string => {
  const limpio = valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (limpio.length <= 3) return limpio;
  return `${limpio.slice(0, 3)}-${limpio.slice(3)}`;
};

/**
 * Valida una placa con el formato ABC-123 (3 letras + 3 números).
 * Devuelve un mensaje de error legible o null si es válida (o está vacía).
 */
export const validarPlaca = (valor: string): string | null => {
  const limpio = valor.trim().toUpperCase();
  if (!limpio) return null; // opcional: vacío no es error
  if (!/^[A-Z]{3}-\d{3}$/.test(limpio)) {
    return 'La placa debe tener el formato ABC-123 (3 letras + 3 números).';
  }
  return null;
};

/** Dominios de correo públicos permitidos (gmail, hotmail, outlook, yahoo). */
export const DOMINIOS_PERMITIDOS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com'] as const;

/**
 * Valida que el dominio del correo esté en la lista permitida.
 * Devuelve un mensaje de error legible o null si es válido (o está vacío).
 */
export const validarCorreoDominio = (correo: string): string | null => {
  const limpio = correo.trim().toLowerCase();
  if (!limpio) return null;
  const dominio = limpio.split('@')[1];
  if (!dominio || !(DOMINIOS_PERMITIDOS as readonly string[]).includes(dominio)) {
    return 'Solo se permiten correos con dominio público (gmail.com, hotmail.com, outlook.com, yahoo.com).';
  }
  return null;
};

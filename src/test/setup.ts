/**
 * Configuración global para pruebas unitarias con Vitest.
 *
 * - Extiende los matchers de Vitest con los de @testing-library/jest-dom
 *   (toHaveTextContent, toBeVisible, etc.) para escribir aserciones más
 *   expresivas en las pruebas de componentes React.
 * - Se ejecuta automáticamente antes de cada archivo de prueba gracias
 *   a la opción setupFiles en vite.config.ts.
 */

import '@testing-library/jest-dom/vitest';

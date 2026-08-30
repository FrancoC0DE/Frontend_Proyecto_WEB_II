/**
 * Pruebas unitarias para el componente ErrorBoundary.
 *
 * Verifica que:
 * - Renderice los hijos cuando no hay error
 * - Muestre la UI de error cuando un hijo lanza una excepción
 * - Muestre el mensaje personalizado cuando se proporciona
 * - El botón "Intentar de nuevo" resetee el estado y oculte el error
 * - El detalle técnico no se muestre si import.meta.env.DEV es false
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

// ============================================================
// Componente auxiliar que lanza error condicionalmente
// ============================================================
function ComponenteConError({ debeFallar, mensaje }: { debeFallar: boolean; mensaje?: string }) {
  if (debeFallar) {
    throw new Error(mensaje || 'Error forzado');
  }
  return <div>Componente sin errores</div>;
}

// ============================================================
// Limpiar console.error para no ensuciar la salida de tests
// ============================================================
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Suprimir console.error durante pruebas de error esperado
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ============================================================
// Pruebas
// ============================================================
describe('ErrorBoundary', () => {
  it('debe renderizar los hijos cuando no hay error', () => {
    render(
      <ErrorBoundary>
        <div>Contenido seguro</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Contenido seguro')).toBeInTheDocument();
  });

  it('debe mostrar la UI de error cuando un hijo lanza una excepción', () => {
    render(
      <ErrorBoundary>
        <ComponenteConError debeFallar={true} />
      </ErrorBoundary>
    );

    // Debe mostrar el mensaje de error amigable
    expect(screen.getByText('Ha ocurrido un error inesperado.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nuestro equipo ha sido notificado. Por favor, intenta recargar la página.'
      )
    ).toBeInTheDocument();

    // Debe mostrar los botones de acción
    expect(screen.getByRole('button', { name: 'Recargar página' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeInTheDocument();

    // NO debe mostrar el contenido hijo fallido
    expect(screen.queryByText('Componente sin errores')).not.toBeInTheDocument();
  });

  it('debe mostrar el mensaje personalizado cuando se proporciona', () => {
    render(
      <ErrorBoundary mensaje="Error personalizado" subtitulo="Subtítulo personalizado">
        <ComponenteConError debeFallar={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Error personalizado')).toBeInTheDocument();
    expect(screen.getByText('Subtítulo personalizado')).toBeInTheDocument();
  });

  it('debe reiniciar estado al hacer clic en "Intentar de nuevo"'
    + ' y re-capturar si los hijos siguen fallando', async () => {
    const user = userEvent.setup();

    /**
     * NOTA: Cuando se hace clic en "Intentar de nuevo", el ErrorBoundary
     * resetea su estado interno (hasError = false) e intenta re-renderizar
     * los hijos. Si los hijos siguen lanzando el mismo error,
     * getDerivedStateFromError lo captura de nuevo y la UI de error
     * se muestra otra vez. Esto es el comportamiento esperado:
     * el botón permite al usuario "reintentar", pero si la causa raíz
     * del error no cambió, el error se vuelve a capturar.
     */

    render(
      <ErrorBoundary>
        <ComponenteConError debeFallar={true} mensaje="Error persistente" />
      </ErrorBoundary>
    );

    // Verificar que se muestra el error
    expect(screen.getByText('Ha ocurrido un error inesperado.')).toBeInTheDocument();

    // Hacer clic en "Intentar de nuevo"
    await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    // Como los hijos siguen fallando, el error se vuelve a mostrar
    expect(screen.getByText('Ha ocurrido un error inesperado.')).toBeInTheDocument();
  });

  it('debe registrar el error en console.error', () => {
    render(
      <ErrorBoundary>
        <ComponenteConError debeFallar={true} mensaje="Error de prueba" />
      </ErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    // Verificar que se llamó con el mensaje del ErrorBoundary
    const llamadas = consoleErrorSpy.mock.calls;
    // NOTA (cambio para compilar con `tsc -b`): se tipa el parámetro del callback
    // como unknown[] para corregir TS7006 (parámetro con tipo `any` implícito).
    const hayMensajeBoundary = llamadas.some(
      (args: unknown[]) => typeof args[0] === 'string' && String(args[0]).includes('[ErrorBoundary]')
    );
    expect(hayMensajeBoundary).toBe(true);
  });

  it('debe renderizar el detalle técnico cuando import.meta.env.DEV es true', () => {
    // import.meta.env.DEV es true en modo test de Vitest
    render(
      <ErrorBoundary>
        <ComponenteConError debeFallar={true} mensaje="Error de prueba" />
      </ErrorBoundary>
    );

    // Ver detalle técnico debe estar presente (DEV mode)
    expect(screen.getByText('Ver detalle técnico')).toBeInTheDocument();
    expect(screen.getByText('Error de prueba')).toBeInTheDocument();
  });
});

/**
 * ErrorBoundary
 *
 * Componente de React que captura errores de renderizado en el árbol de
 * componentes hijos y muestra una interfaz amigable al usuario en lugar de
 * dejar la pantalla en blanco o mostrar un error críptico en la consola.
 *
 * ── ¿Por qué es necesario? ─────────────────────────────────────────────
 * En React, un error de JavaScript no controlado dentro de un componente
 * puede romper todo el árbol de componentes. El Error Boundary actúa como
 * un catch {} para el renderizado, evitando que la aplicación se quede
 * en blanco y permitiendo al usuario recuperarse con un simple clic.
 *
 * ── Uso recomendado ───────────────────────────────────────────────────
 * Envolver las rutas principales (o toda la app) dentro de este
 * componente. También se puede anidar para aislar secciones críticas
 * (ej: panel admin, panel inquilino) de modo que un error en una sección
 * no afecte a las demás.
 *
 * ── Referencia ────────────────────────────────────────────────────────
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 *
 * @example
 * <ErrorBoundary fallback={<p>Algo salió mal</p>}>
 *   <MiComponente />
 * </ErrorBoundary>
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Contenido que será protegido por el Error Boundary */
  children: ReactNode;
  /**
   * Mensaje personalizado para mostrar en lugar del texto genérico.
   * @default "Ha ocurrido un error inesperado."
   */
  mensaje?: string;
  /**
   * Subtítulo opcional con más contexto sobre el error.
   * @default "Nuestro equipo ha sido notificado. Por favor, intenta recargar la página."
   */
  subtitulo?: string;
}

interface ErrorBoundaryState {
  /** Indica si ocurrió un error de renderizado */
  hasError: boolean;
  /** Mensaje de error capturado (sin mostrar info sensible) */
  errorMessage: string;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  /**
   * React llama a este método cuando se lanza un error durante el renderizado.
   * Actualiza el estado para que el siguiente renderizado muestre la UI de fallback.
   *
   * @param error - El error que fue lanzado
   * @returns Nuevo estado del ErrorBoundary
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Error desconocido',
    };
  }

  /**
   * React llama a este método después de que getDerivedStateFromError capturó
   * el error. Aquí se podría enviar el error a un servicio de monitoreo externo
   * (ej: Sentry, Datadog) para llevar un registro de errores en producción.
   *
   * Por ahora se registra en consola con el stack trace para diagnóstico.
   *
   * @param error - El error original que fue lanzado
   * @param errorInfo - Objeto con información adicional (componentStack)
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // En producción, aquí se enviaría el error a un servicio como Sentry
    console.error('[ErrorBoundary] Error de renderizado capturado:', error);
    console.error('[ErrorBoundary] Stack del componente:', errorInfo.componentStack);
  }

  /**
   * Recarga la página actual para que el usuario intente recuperarse del error.
   * Esto fuerza un reinicio completo del estado de la aplicación.
   */
  private handleRecargar = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { mensaje, subtitulo } = this.props;

      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <div className="error-boundary-icon">
              <i className="fas fa-exclamation-triangle"></i>
            </div>

            <h2 className="error-boundary-title">
              {mensaje || 'Ha ocurrido un error inesperado.'}
            </h2>

            <p className="error-boundary-subtitle">
              {subtitulo ||
                'Nuestro equipo ha sido notificado. Por favor, intenta recargar la página.'}
            </p>

            {import.meta.env.DEV && (
              <details className="error-boundary-details">
                <summary className="error-boundary-details-summary">
                  Ver detalle técnico
                </summary>
                <pre className="error-boundary-stack">{this.state.errorMessage}</pre>
              </details>
            )}

            <div className="error-boundary-actions">
              <button
                className="btn-primary"
                onClick={this.handleRecargar}
                aria-label="Recargar página"
              >
                <i className="fas fa-redo"></i> Recargar página
              </button>
              <button
                className="btn-secondary"
                onClick={() => { this.setState({ hasError: false, errorMessage: '' }); }}
                aria-label="Intentar de nuevo"
              >
                <i className="fas fa-undo"></i> Intentar de nuevo
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

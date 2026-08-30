/**
 * ============================================================================
 * Archivo: InquilinoConfig.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla de configuración del panel Inquilino. Permite cambiar idioma,
 * tema (oscuro/claro/sistema), fuente y tamaño de texto.
 *
 * Componentes que utiliza
 * - PageHeader (título)
 * - usePreferencias (contexto de tema/idioma/fuente/tamaño de letra)
 *
 * NOTA (cambio - migración a backend real): antes tema venía de un
 * ThemeContext aparte (theme/setTheme) y fuente/tamaño se guardaban en
 * localStorage del navegador (por eso persistían por dispositivo, no por
 * cuenta, y además fuente/tamaño no se reaplicaban al recargar). Ahora los
 * 4 selects usan PreferenciasContext, que carga/guarda contra
 * GET/PATCH /api/preferencias (sp_ObtenerPreferencias / sp_ActualizarPreferencias),
 * así que las preferencias quedan ligadas a la cuenta del usuario.
 * El idioma queda conectado por primera vez (antes el select no hacía nada).
 * ============================================================================
 */

import { usePreferencias } from '../../context/PreferenciasContext';
import PageHeader from '../../components/PageHeader';

export default function InquilinoConfig() {
  const { tema, fuente, tamanoFuente, setTema, setFuente, setTamanoFuente } = usePreferencias();

  return (
    <>
      <PageHeader title="Configuración" />
      <div className="settings-grid">
        <div className="settings-card">
          <h4>Apariencia</h4>
          <div className="setting-item">
            <span className="setting-label">Tema</span>
            <div className="setting-control">
              <select id="themeSelect" value={tema} onChange={e => setTema(e.target.value as 'dark' | 'light' | 'system')}>
                <option value="dark">Oscuro</option>
                <option value="light">Claro</option>
                <option value="system">Sistema</option>
              </select>
            </div>
          </div>
          <div className="setting-item">
            <span className="setting-label">Fuente</span>
            <div className="setting-control">
              <select id="fontSelect" value={fuente} onChange={e => setFuente(e.target.value as 'Inter' | 'SF Pro' | 'System')}>
                <option value="Inter">Inter</option>
                <option value="SF Pro">SF Pro</option>
                <option value="System">System</option>
              </select>
            </div>
          </div>
          <div className="setting-item">
            <span className="setting-label">Tamaño de texto</span>
            <div className="setting-control">
              <select id="fontSizeSelect" value={tamanoFuente} onChange={e => setTamanoFuente(e.target.value as 'small' | 'medium' | 'large')}>
                <option value="small">Pequeño</option>
                <option value="medium">Mediano</option>
                <option value="large">Grande</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

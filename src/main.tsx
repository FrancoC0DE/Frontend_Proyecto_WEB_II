/**
 * ============================================================================
 * Archivo: main.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Es el punto de entrada de la aplicación. Renderiza el componente App dentro
 * del modo estricto de React y carga todos los estilos CSS globales.
 *
 * Orden de carga de estilos (importante):
 * 1. coomon.css  → Estilos compartidos (sidebar, navbar, cards, etc.)
 * 2. login.css   → Estilos de login, 2FA y recuperación
 * 3. admin.css   → Estilos del panel Administrador
 * 4. guarda.css  → Estilos del panel Guardia
 * 5. inquilino.css → Estilos del panel Inquilino
 *
 * ============================================================================
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/coomon.css'
import './styles/login.css'
import './styles/admin.css'
import './styles/guarda.css'
import './styles/inquilino.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

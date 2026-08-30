# Frontend — Boricuas Condominium

SPA en **React + TypeScript + Vite**. Consume la API del backend
(`../backend`) vía `src/services/apiClient.ts`.

---

## Inicio rápido

```bash
npm install
npm run dev          # http://localhost:5173
```

### Variables de entorno (`.env`)

```env
# URL base de la API del backend (con el sufijo /api). Por defecto usa
# http://localhost:4000/api si no se define.
VITE_API_URL=http://localhost:4000/api
```

En producción (Vercel), configurar `VITE_API_URL` apuntando al backend
desplegado, ej. `https://backend-proyecto-web-ii.onrender.com/api`.

### Build / producción

```bash
npm run build     # tsc -b && vite build → dist/
npm run preview   # sirve dist/ localmente para probar el build
```

### Otros scripts

```bash
npm run lint       # ESLint
npm run test       # Vitest (una corrida)
npm run test:watch # Vitest en modo watch
```

---

## Estructura

```
src/
├── pages/
│   ├── admin/       # Panel de Administrador (dashboard, personal, residentes,
│   │                #   contratos, reservas, áreas, pagos, facturación, reportes...)
│   ├── guardia/      # Panel de Guarda (dashboard, visitas)
│   ├── inquilino/    # Panel de Inquilino (reservas, contratos, visitantes, facturas)
│   └── auth/         # Login, 2FA, recuperación de contraseña
├── components/       # Componentes compartidos (Sidebar, Navbar, Toast, Alert...)
├── context/          # AuthContext, DataContext, PreferenciasContext (tema)
├── services/         # Un archivo por módulo de la API (pagosService.ts,
│                      #   facturacionService.ts, inquilinoService.ts...) +
│                      #   apiClient.ts (fetch con JWT automático)
│                      #   payments/ (bankyCheckout.ts, hsmSignCheckout.ts —
│                      #   integraciones con pasarelas externas por popup)
├── hooks/             # useAuth, useLocalDate, etc.
└── styles/            # common.css (compartido) + admin.css / inquilino.css / guarda.css
```

## Navegación

Cada panel (`AdminRouter`/`GuardiaRouter`/`InquilinoRouter` en `App.tsx`) usa
navegación por **hash** (`#dashboard`, `#reservas`, `#facturacion`, etc.) en
vez de rutas anidadas de `react-router-dom` — el hash decide qué página se
renderiza dentro del layout de cada rol. Los roles en sí (`/admin/*`,
`/guardia/*`, `/inquilino/*`) sí son rutas reales, protegidas por
`PrivateRoute` (ver `AuthContext`).

## Integraciones de pago/firma externas

`src/services/payments/`:

- **`bankyCheckout.ts`** — BankyFinanzas (pasarela de pago, ventana emergente
  + `postMessage`). Usado en `NuevaReservaPage.tsx` y `MisContratosPage.tsx`.
- **`hsmSignCheckout.ts`** — HSM Sign CR (firma digital, ventana emergente
  + `postMessage`). Usado en `FacturacionPage.tsx` (panel Administrador) para
  firmar facturas electrónicas antes de enviarlas a Mini Tributación — el PIN
  de firma nunca pasa por este frontend ni por el backend, se escribe
  directo en el popup de HSM Sign CR.

Ambas siguen el mismo patrón: `window.open()` a la pasarela + un listener de
`message` que valida `event.origin` antes de aceptar el resultado.

---

## Backend

Ver `../backend/README.md` — incluye el manual completo de la API,
incluyendo el módulo de Facturación Electrónica para otros equipos
(`/api/facturacion/sitios`, `/api/facturacion/ventas`).

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Express (backend): la ampliación global de tipos (req.user/req.pool)
      // usa `declare namespace`, que son declaraciones ambientales válidas,
      // no namespaces de runtime. Se permiten para no romper la aug. de tipos.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      // Providers de contexto: exportan su componente + su hook (useX) en el
      // mismo archivo. El fast refresh sigue funcionando para el componente;
      // se permite el nombre del hook explícitamente.
      'react-refresh/only-export-components': ['error', {
        allowExportNames: ['useAlert', 'useToast', 'useTheme', 'useData'],
      }],
    },
  },
])

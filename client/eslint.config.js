import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    // Override react-refresh/only-export-components to allow exporting hooks
    // and other constant bindings. Without this, the rule (set to `error`
    // by TypeScript's strict config) flags files like AuthContext.tsx that
    // export both a Provider component AND a useAuth hook.
    //
    // `allowConstantExport: true` is the standard Vite template setting —
    // it permits `export const hookName = ...` patterns.
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
    },
  },
])

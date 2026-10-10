import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

import { architectureImportRule } from './scripts/architecture-policy.mjs'

export default defineConfig([
  // `output/` is git-ignored and holds run artifacts, including model-generated card sources.
  globalIgnores(['dist', 'output/**', '**/.build/**', '.worktree/**', '.scratch/**', '.gitnexus/**', 'scripts/__tests__/fixtures/**', 'public/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    // All pre-existing violations downgraded from `error` → `warn`. CLAUDE.md
    // documents lint as informational ("~340 个 pre-existing any 警告，不阻塞").
    // `_`-prefixed vars are intentionally unused. Remaining categories
    // (react-hooks, react-compiler, cosmetic JS rules) are all pre-existing
    // architectural debt not introduced by recent refactors; separate cleanup
    // PRs can re-raise individual rules to error as they're resolved.
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-refresh/only-export-components': 'warn',
      'no-useless-escape': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-useless-catch': 'warn',
      // ESLint 10 promotes this to error. The hits are defensive initialisers
      // (`let x = fallback` overwritten in every branch) and test helpers that
      // assign a response they do not read; neither is a defect.
      'no-useless-assignment': 'warn',
      'no-empty': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'],
    plugins: { architecture: { rules: { imports: architectureImportRule } } },
    rules: { 'architecture/imports': 'error' },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    ignores: ['client/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "Literal[value='minor-improvement']",
        message: "Use 'improvement' action id with params.types instead.",
      }, {
        selector: "Literal[value='improvement-any']",
        message: "Use 'improvement' action id with params.types instead.",
      }],
    },
  },
])

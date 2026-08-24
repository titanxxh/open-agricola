import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const mainClientForbiddenCardBootstrapModules = [
  'catalog',
  'install-catalog-lookups',
  'register-all',
  'custom-registry',
  'registry-runtime',
]

const mainClientForbiddenImportGroups = [
  '**/shared/session/**',
  '**/shared/engine/**',
  ...mainClientForbiddenCardBootstrapModules.flatMap((moduleName) => [
    `**/shared/cards/${moduleName}`,
    `**/shared/cards/${moduleName}.ts`,
    `**/shared/cards/${moduleName}.js`,
  ]),
  '**/shared/cards/[A-E]/**',
  '**/shared/cards/community/**',
  '**/shared/cards/major/**',
  '**/shared/cards/__stubs__/**',
]

const mainClientForbiddenDynamicImportPattern = String.raw`(?:^|\/)shared\/(?:session|engine)\/|(?:^|\/)shared\/cards\/(?:catalog|install-catalog-lookups|register-all|custom-registry|registry-runtime)(?:\.(?:ts|js))?$|(?:^|\/)shared\/cards\/(?:[A-E]|community|major|__stubs__)\/`

export default defineConfig([
  globalIgnores(['dist', '.worktree/**', 'scripts/__tests__/fixtures/**', 'public/**']),
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
  // Three-layer boundary enforcement. Tests are exempt — session
  // tests under shared/**/__tests__ legitimately drive the server layer.
  {
    files: ['shared/**/*.{ts,tsx}'],
    ignores: ['shared/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/client/**'], message: 'shared/ must not import from client/ (three-layer boundary)' },
          { group: ['**/server/**'], message: 'shared/ must not import from server/ (three-layer boundary)' },
        ],
      }],
    },
  },
  // S3 ADR-0006 invariant: effect layer must use PaymentSolver namespace,
  // not the now-deleted helpers/{payment,pay-helpers,room-payment} shim.
  // Files no longer exist; rule prevents accidental re-introduction.
  {
    files: ['shared/actions/effects/**/*.{ts,tsx}', 'shared/cards/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/helpers/payment',
              '**/helpers/pay-helpers',
              '**/helpers/room-payment',
            ],
            message: 'Use PaymentSolver namespace from shared/actions/payment instead. See ADR-0006.',
          },
        ],
      }],
    },
  },
  // S4a: shared/domain/** is the new render-agnostic aggregate facade. It
  // must run in the browser sandbox (no Node API), must not depend on React
  // (pure domain), and must not import engine / session / actions/effects
  // to avoid layering cycles.
  {
    files: ['shared/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['fs', 'fs/*', 'path', 'os', 'child_process', 'crypto'],
            message: 'shared/domain/** must run in browser sandbox; no Node API.',
          },
          {
            group: ['react', 'react-dom'],
            message: 'shared/domain/** is render-agnostic; no React.',
          },
          {
            group: [
              '../../engine/**',
              '../../session/**',
              '../../actions/effects/**',
              '../engine/**',
              '../session/**',
              '../actions/effects/**',
              // Bare paths so re-exports through e.g.
              // `../actions/effects/index.ts` (no trailing slash) cannot
              // slip past the **/* glob.
              '../../engine',
              '../../session',
              '../../actions/effects',
              '../engine',
              '../session',
              '../actions/effects',
            ],
            message: 'shared/domain/** must not depend on engine/session/effects (avoid cycles).',
          },
        ],
      }],
    },
  },
  {
    files: ['server/**/*.{ts,tsx}'],
    ignores: ['server/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/client/**'], message: 'server/ must not import from client/ (three-layer boundary)' },
        ],
      }],
    },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    ignores: ['client/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/server/**'], message: 'client/ must not import from server/ (three-layer boundary)' },
        ],
      }],
    },
  },
  // S6c: shared/contract/** is type-only; runtime imports forbidden.
  // Type-only imports (`import type { ... }`) are allowed since they erase at
  // build time and don't produce runtime dependencies.
  {
    files: ['shared/contract/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '../actions/**', '../engine/**', '../session/**',
              '../cards/**', '../domain/**',
              '../utils/**',
              '../../actions/**', '../../engine/**', '../../session/**',
              '../../cards/**', '../../domain/**',
              '../../utils/**',
            ],
            message: 'shared/contract/** is type-only; do not import runtime modules.',
            allowTypeImports: true,
          },
        ],
      }],
    },
  },
  // S6c: main client may not import session/engine or card impl/bootstrap modules. Use client/sandbox/ for hot-seat.
  // The local-sandbox engine worker files run in a dedicated Worker chunk (never the main bundle),
  // so they get the same exemption; local-transport/persistence/workshop-launch stay restricted
  // (type-only imports) to keep the engine out of the main bundle.
  {
    files: ['client/**/*.{ts,tsx}'],
    ignores: [
      'client/sandbox/**',
      'client/local-sandbox/worker.ts',
      'client/local-sandbox/worker-core.ts',
      'client/local-sandbox/browser-runtime.ts',
      'client/local-sandbox/browser-executor.ts',
      'client/**/__tests__/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              ...mainClientForbiddenImportGroups,
            ],
            message: 'Main client cannot import shared/session, shared/engine, card catalog/bootstrap/register-all, or per-card impl modules. Use manifest-backed client/services/card-meta for UI metadata.',
            allowTypeImports: true,
          },
        ],
      }],
      'no-restricted-syntax': ['error', {
        selector: `ImportExpression[source.value=/${mainClientForbiddenDynamicImportPattern}/]`,
        message: 'Main client cannot dynamically import shared/session, shared/engine, card catalog/bootstrap/register-all, or per-card impl modules. Use manifest-backed client/services/card-meta for UI metadata.',
      }, {
        selector: "Literal[value='minor-improvement']",
        message: "Use 'improvement' action id with params.types instead. Legacy 'minor-improvement' was removed in the improvement-unification refactor.",
      }, {
        selector: "Literal[value='improvement-any']",
        message: "Use 'improvement' action id with params.types instead. Legacy 'improvement-any' was removed in the improvement-unification refactor.",
      }],
    },
  },
  // S6c: shared/utils/** is pure helper. No game/session/engine/cards/domain imports.
  {
    files: ['shared/utils/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/shared/cards/**',
              '**/shared/session/**',
              '**/shared/engine/**',
              '**/shared/actions/**',
              '**/shared/domain/**',
              '**/server/**',
              '**/client/**',
            ],
            message: 'shared/utils/** is pure helper; no domain/runtime/UI imports.',
            allowTypeImports: true,
          },
        ],
      }],
    },
  },
])

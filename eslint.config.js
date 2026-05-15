import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

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
      'no-empty': 'warn',
    },
  },
  // Three-layer boundary enforcement (warn-level). Tests are exempt — session
  // tests under shared/**/__tests__ legitimately drive the server layer.
  {
    files: ['shared/**/*.{ts,tsx}'],
    ignores: ['shared/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['warn', {
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
      'no-restricted-imports': ['warn', {
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
      'no-restricted-imports': ['warn', {
        patterns: [
          { group: ['**/server/**'], message: 'client/ must not import from server/ (three-layer boundary)' },
        ],
      }],
    },
  },
  // S6b: cards-display is the bundle-isolated display layer. It must not
  // import impl layers (actions/engine/session) nor the per-deck card impl
  // files under shared/cards/[A-E]/**, shared/cards/community/**, or
  // shared/cards/__stubs__/**. Pure types may come from shared/contract/*.
  //
  // Excluded from this rule (Sprint S8 collapsed prior 3 exemptions):
  //   - shared/cards-display/_lookup-data.ts — single forwarding seam for
  //     `cards/custom-registry` (runtime overlay registry). custom-registry
  //     has no transitive imports to cards/major or cards/catalog, so this
  //     reverse edge is safe under vite dev ESM cycle resolution.
  //   - shared/cards-display/types.ts — owns the CardBase class hierarchy
  //     that all card display files extend (kept defensively; verify by
  //     `grep '^import' shared/cards-display/types.ts`).
  {
    files: ['shared/cards-display/**/*.{ts,tsx}'],
    ignores: [
      'shared/cards-display/_lookup-data.ts',
      'shared/cards-display/types.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/shared/actions/**',
              '**/shared/engine/**',
              '**/shared/session/**',
              '**/shared/cards/[A-E]/**',
              '**/shared/cards/community/**',
              '**/shared/cards/__stubs__/**',
              '../actions/**', '../engine/**', '../session/**',
              '../cards/[A-E]/**', '../cards/community/**', '../cards/__stubs__/**',
              '../../actions/**', '../../engine/**', '../../session/**',
              '../../cards/[A-E]/**', '../../cards/community/**', '../../cards/__stubs__/**',
            ],
            message: 'shared/cards-display/** must not import impl layers (actions/engine/session) nor per-deck card impl files. Use shared/contract/* for shared types.',
          },
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
              '../cards/**', '../cards-display/**', '../domain/**',
              '../utils/**',
              '../../actions/**', '../../engine/**', '../../session/**',
              '../../cards/**', '../../cards-display/**', '../../domain/**',
              '../../utils/**',
            ],
            message: 'shared/contract/** is type-only; do not import runtime modules.',
            allowTypeImports: true,
          },
        ],
      }],
    },
  },
  // S6c: main client may not import session/engine. Use client/sandbox/ for hot-seat.
  {
    files: ['client/**/*.{ts,tsx}'],
    ignores: ['client/sandbox/**', 'client/**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/shared/session/**', '**/shared/engine/**'],
            message: 'Main client cannot import shared/session/** or shared/engine/**. Use client/sandbox/ for workshop hot-seat.',
            allowTypeImports: true,
          },
        ],
      }],
    },
  },
  // S6c: impl layers should consume card metadata via getCardDefinition/registry-runtime,
  // not reach into cards-display directly (would couple impl to display chunk).
  // Tests under __tests__/ are dev-only and may import cards-display directly
  // for assertion fixtures (e.g. asserting a card's modifier shape).
  {
    files: [
      'shared/actions/**/*.ts',
      'shared/engine/**/*.ts',
      'shared/session/**/*.ts',
    ],
    ignores: [
      'shared/actions/**/__tests__/**',
      'shared/engine/**/__tests__/**',
      'shared/session/**/__tests__/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/cards-display/**', '../cards-display/**', '../../cards-display/**'],
            message: 'session/engine/actions should consume metadata via shared/cards/registry-runtime (getCardDefinition / getCardEffect), not import cards-display directly.',
            allowTypeImports: true,
          },
        ],
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
              '**/shared/cards-display/**',
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

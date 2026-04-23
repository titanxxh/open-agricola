import { defineConfig, defaultExclude, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// React component tests under client/ that touch the DOM (use @testing-library/react's
// `render()`, expect `document`/`window`, etc.) MUST opt in to jsdom by adding this pragma
// at the top of the .test.tsx file:
//
//   // @vitest-environment jsdom
//
// Symptom if missing: "ReferenceError: document is not defined" / "window is not defined".
// (Vitest 4 removed `environmentMatchGlobs` — see https://vitest.dev/guide/migration .)
// Static-render tests using `renderToStaticMarkup` from `react-dom/server` do NOT need
// the pragma (e.g. client/components/common/__tests__/PlayerCard.test.tsx).

// Per-card session tests (server/__tests__/<Deck><Number>_<Name>-session.test.ts)
// are heavy and live in the `slow` project. The default CI runs `--project fast`;
// the daily `CI Full` workflow runs everything. See
// docs/superpowers/specs/2026-04-23-ci-test-tiering-design.md for the rationale.
const SLOW_INCLUDE = ['server/__tests__/[A-E][0-9]*_*-session.test.ts']
const FAST_INCLUDE = [
  'shared/**/*.test.ts',
  'shared/**/*.test.tsx',
  'client/**/*.test.ts',
  'client/**/*.test.tsx',
  'tests/**/*.test.ts',
  'scripts/**/__tests__/*.test.ts',
  'server/__tests__/*.test.ts',
  'server/game/__tests__/*.test.ts',
  'server/workshop-pr/__tests__/*.test.ts',
]
const SHARED_EXCLUDE = [...defaultExclude, '**/.worktree/**', 'tests/llm-card-gen/**']
const FAST_EXCLUDE = [...SHARED_EXCLUDE, ...SLOW_INCLUDE]
const SHARED_SETUP = [
  './shared/cards/__tests__/setup-register-all.ts',
  './client/__tests__/setup.ts',
]

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: SHARED_EXCLUDE,
      setupFiles: SHARED_SETUP,
      projects: [
        {
          extends: true,
          test: {
            name: 'fast',
            include: FAST_INCLUDE,
            exclude: FAST_EXCLUDE,
            setupFiles: SHARED_SETUP,
          },
        },
        {
          extends: true,
          test: {
            name: 'slow',
            include: SLOW_INCLUDE,
            exclude: SHARED_EXCLUDE,
            setupFiles: SHARED_SETUP,
          },
        },
      ],
    },
  }),
)

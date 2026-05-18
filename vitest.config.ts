import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'
import {
  BASE_EXCLUDE,
  FAST_CARD_RUNTIME_INCLUDE,
  FAST_CARDS_INCLUDE,
  FAST_CLIENT_INCLUDE,
  FAST_EXCLUDE,
  FAST_SCRIPTS_INCLUDE,
  FAST_SERVER_INCLUDE,
  FAST_SHARED_EXCLUDE,
  FAST_SHARED_INCLUDE,
  FAST_TESTS_EXCLUDE,
  FAST_TESTS_INCLUDE,
  LLM_INCLUDE,
  SHARED_EXCLUDE,
  SLOW_INCLUDE,
} from './scripts/test-project-globs'

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

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Top-level exclude is inherited by every project's exclude (vitest
      // concatenates parent + project). Keep it minimal so the `llm` project
      // can opt back in by setting its own exclude that doesn't drop LLM
      // tests. Per-project excludes below add LLM_GLOB where needed.
      exclude: BASE_EXCLUDE,
      projects: [
        {
          extends: true,
          test: {
            name: 'fast-shared',
            include: FAST_SHARED_INCLUDE,
            exclude: FAST_SHARED_EXCLUDE,
            setupFiles: [],
          },
        },
        {
          extends: true,
          test: {
            name: 'fast-cards',
            include: FAST_CARDS_INCLUDE,
            exclude: FAST_EXCLUDE,
            setupFiles: ['./shared/cards/__tests__/setup-register-all.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'fast-card-runtime',
            include: FAST_CARD_RUNTIME_INCLUDE,
            exclude: FAST_EXCLUDE,
            setupFiles: ['./shared/cards/__tests__/setup-register-all.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'fast-client',
            include: FAST_CLIENT_INCLUDE,
            exclude: FAST_EXCLUDE,
            setupFiles: [
              './client/__tests__/setup.ts',
              './client/__tests__/setup-card-manifest.ts',
            ],
          },
        },
        {
          extends: true,
          test: {
            name: 'fast-server',
            include: FAST_SERVER_INCLUDE,
            exclude: FAST_EXCLUDE,
            setupFiles: ['./shared/cards/__tests__/setup-register-all.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'fast-scripts',
            include: FAST_SCRIPTS_INCLUDE,
            exclude: FAST_EXCLUDE,
            setupFiles: [],
          },
        },
        {
          extends: true,
          test: {
            name: 'fast-tests',
            include: FAST_TESTS_INCLUDE,
            exclude: FAST_TESTS_EXCLUDE,
            setupFiles: ['./shared/cards/__tests__/setup-register-all.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'slow',
            include: SLOW_INCLUDE,
            exclude: SHARED_EXCLUDE,
            setupFiles: ['./shared/cards/__tests__/setup-register-all.ts'],
            isolate: false,
          },
        },
        {
          extends: true,
          test: {
            name: 'llm',
            include: LLM_INCLUDE,
            exclude: BASE_EXCLUDE,
            setupFiles: [],
          },
        },
      ],
    },
  }),
)

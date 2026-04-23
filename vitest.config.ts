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
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...defaultExclude, '**/.worktree/**'],
      setupFiles: [
        './shared/cards/__tests__/setup-register-all.ts',
        './client/__tests__/setup.ts',
      ],
    },
  }),
)

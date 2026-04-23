import { defineConfig, defaultExclude, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// React component tests under client/ that need DOM should add the pragma:
//   // @vitest-environment jsdom
// at the top of the .test.tsx file. (Vitest 4 removed environmentMatchGlobs.)
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...defaultExclude, '**/.worktree/**'],
      setupFiles: ['./shared/cards/__tests__/setup-register-all.ts'],
    },
  }),
)

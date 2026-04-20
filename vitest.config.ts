import { defineConfig, defaultExclude, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...defaultExclude, '**/.worktree/**'],
      setupFiles: ['./shared/cards/__tests__/setup-register-all.ts'],
    },
  }),
)

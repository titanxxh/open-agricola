import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    exclude: [...configDefaults.exclude, 'scripts/**', 'e2e-tests/**'],
  },
})

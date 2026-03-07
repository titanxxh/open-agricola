import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-tests',
  timeout: 120_000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    baseURL: 'http://localhost:5173',
  },
  outputDir: './output/playwright',
})

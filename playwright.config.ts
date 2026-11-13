import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-tests',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}',
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    viewport: { width: 1920, height: 1080 },
    baseURL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    ...(process.env.RELEASE_SMOKE_PROXY ? {
      proxy: { server: process.env.RELEASE_SMOKE_PROXY, bypass: 'localhost,127.0.0.1,[::1],*.agricola.test' },
    } : {}),
  },
  outputDir: './output/playwright',
})

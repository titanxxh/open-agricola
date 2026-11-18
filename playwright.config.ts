import { defineConfig } from '@playwright/test'
import { pinnedAssetHostArgs } from './e2e-tests/helpers/pinned-asset-host'

export default defineConfig({
  testDir: './e2e-tests',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  // With E2E_PUBLIC_ASSET_DIR, Chromium loads the asset site from the pinned checkout (e2e-tests/helpers/pinned-asset-host.ts).
  globalSetup: './e2e-tests/helpers/pinned-asset-host.ts',
  // Repeated viewport, locale and device variants (e2e-tests/helpers/extended.ts) run only on request.
  ...(process.env.E2E_EXTENDED === '1' ? {} : { grepInvert: /@extended/ }),
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}',
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    viewport: { width: 1920, height: 1080 },
    baseURL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    launchOptions: { args: pinnedAssetHostArgs() },
    ...(process.env.RELEASE_SMOKE_PROXY ? {
      proxy: { server: process.env.RELEASE_SMOKE_PROXY, bypass: 'localhost,127.0.0.1,[::1],*.agricola.test' },
    } : {}),
  },
  outputDir: './output/playwright',
})

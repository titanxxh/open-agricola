import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { loadPublicAssetConfig, publicAssetUrls } from '../scripts/public-assets.ts'
import { loadBrowserDataDefines } from '../scripts/browser-data.ts'

const root = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(root, '..')
const publicAssets = await loadPublicAssetConfig({ rootDir: repoRoot, allowLocal: false })
const browserDataDefines = process.argv.includes('build') && process.env.VITEST !== 'true'
  ? loadBrowserDataDefines(repoRoot)
  : {}

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(root, '../public'),
  plugins: [
    react(),
    publicAssetUrls(publicAssets, ['/', './', '../']),
  ],
  define: {
    ...browserDataDefines,
    'import.meta.env.VITE_PUBLIC_ASSET_BASE_URL': JSON.stringify(publicAssets.baseUrl),
    'import.meta.env.VITE_PUBLIC_ASSET_VERSION': JSON.stringify(publicAssets.version),
  },
  build: {
    outDir: resolve(root, '.build'),
    emptyOutDir: true,
    sourcemap: false,
  },
})

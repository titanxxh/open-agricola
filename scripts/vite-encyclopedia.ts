import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { loadBrowserDataDefines } from './browser-data.ts'
import { loadPublicAssetConfig, publicAssetUrls } from './public-assets.ts'

const repoRoot = resolve(import.meta.dirname, '..')
const base = '/encyclopedia/'
const publicAssets = await loadPublicAssetConfig({ rootDir: repoRoot, allowLocal: false })
const browserDataDefines = process.argv.includes('build') ? loadBrowserDataDefines(repoRoot, { languageList: true }) : {}

export default defineConfig({
  root: resolve(repoRoot, 'client/encyclopedia-static'),
  base,
  publicDir: false,
  plugins: [react(), publicAssetUrls(publicAssets, [base, '/'])],
  define: {
    ...browserDataDefines,
    'import.meta.env.VITE_PUBLIC_ASSET_BASE_URL': JSON.stringify(publicAssets.baseUrl),
  },
  build: {
    outDir: resolve(repoRoot, 'dist-pages/encyclopedia'),
    emptyOutDir: true,
  },
})

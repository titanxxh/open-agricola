import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { loadPublicAssetConfig, publicAssetUrls } from '../scripts/public-assets'
import {
  bgaAssetUrls,
  DEFAULT_BGA_CDN_BASE_URL,
} from '../scripts/bga-asset-urls'

const root = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(root, '..')
const publicAssets = await loadPublicAssetConfig({ rootDir: repoRoot, allowLocal: false })
const bgaCdnBaseUrl = process.env.BGA_CDN_BASE_URL || DEFAULT_BGA_CDN_BASE_URL

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(root, '../public'),
  plugins: [
    react(),
    publicAssetUrls(publicAssets, ['/', './', '../']),
    bgaAssetUrls(bgaCdnBaseUrl),
  ],
  define: {
    'import.meta.env.VITE_PUBLIC_ASSET_BASE_URL': JSON.stringify(publicAssets.baseUrl),
    'import.meta.env.VITE_PUBLIC_ASSET_VERSION': JSON.stringify(publicAssets.version),
  },
  build: {
    outDir: resolve(root, '.build'),
    emptyOutDir: true,
    sourcemap: false,
  },
})

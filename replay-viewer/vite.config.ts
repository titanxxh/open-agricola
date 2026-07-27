import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const bgaBase = process.env.BGA_CDN_BASE_URL
  ?? 'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260329-0408/img'

const pinBgaAssets = (): PluginOption => ({
  name: 'pin-bga-assets',
  enforce: 'pre',
  transform(code) {
    return code.includes('/bga-img')
      ? { code: code.replaceAll('/bga-img', bgaBase), map: null }
      : null
  },
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type !== 'asset' || typeof file.source !== 'string') continue
      file.source = file.source.replaceAll('/bga-img', bgaBase)
    }
  },
})

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(root, '../public'),
  plugins: [react(), pinBgaAssets()],
  build: {
    outDir: resolve(root, '.build'),
    emptyOutDir: true,
    sourcemap: false,
  },
})

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { cpSync, existsSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(root, '..')
const bgaImageCandidates = process.env.BGA_IMAGE_DIR
  ? [resolve(repoRoot, process.env.BGA_IMAGE_DIR)]
  : [
      resolve(repoRoot, '../bga-agricola/img'),
      resolve(repoRoot, '../../../bga-agricola/img'),
    ]
const bgaImageDir = bgaImageCandidates.find(existsSync) ?? bgaImageCandidates[0]!
const allowMissingBgaArt = process.env.REPLAY_VIEWER_ALLOW_MISSING_BGA_ART === '1'

const bundleBgaAssets = (): PluginOption => ({
  name: 'bundle-bga-assets',
  enforce: 'pre',
  transform(code, id) {
    return /\.[cm]?[jt]sx?$/.test(id) && code.includes('/bga-img')
      ? { code: code.replaceAll('/bga-img', './bga-img'), map: null }
      : null
  },
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (
        file.type !== 'asset'
        || !file.fileName.endsWith('.css')
        || typeof file.source !== 'string'
      ) continue
      file.source = file.source.replaceAll('/bga-img', '../bga-img')
    }
  },
  closeBundle() {
    if (!existsSync(bgaImageDir)) {
      if (allowMissingBgaArt) return
      throw new Error(`BGA image directory is unavailable: ${bgaImageDir}`)
    }
    cpSync(bgaImageDir, resolve(root, '.build', 'bga-img'), { recursive: true })
  },
})

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(root, '../public'),
  plugins: [react(), bundleBgaAssets()],
  build: {
    outDir: resolve(root, '.build'),
    emptyOutDir: true,
    sourcemap: false,
  },
})

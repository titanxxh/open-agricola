import { defineConfig, type PluginOption, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'node:http'

const BGA_IMAGE_DIR = process.env.BGA_IMAGE_DIR || '../bga-agricola/img'
const bgaImagePath = path.resolve(__dirname, BGA_IMAGE_DIR)
const BGA_CDN_BASE = process.env.BGA_CDN_BASE_URL || 'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260329-0408/img'

const serveBgaImages = (imageDir: string) => ({
  name: 'serve-bga-images',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/bga-img', async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      const filePath = path.join(imageDir, req.url || '')
      // Local first
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.createReadStream(filePath).pipe(res)
        return
      }
      // CDN fallback
      try {
        const cdnUrl = `${BGA_CDN_BASE}${req.url || ''}`
        const cdnRes = await fetch(cdnUrl)
        if (cdnRes.ok) {
          const contentType = cdnRes.headers.get('content-type') || 'application/octet-stream'
          res.setHeader('Content-Type', contentType)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          const buf = await cdnRes.arrayBuffer()
          res.end(Buffer.from(buf))
          return
        }
      } catch {
        // CDN unreachable, fall through
      }
      next()
    })
  },
})

// Build-time plugin: replace /bga-img with CDN URL.
// `transform` covers JS modules and CSS imported via JS. CSS pulled in via
// `@import` (e.g. App.css aggregator) is inlined by postcss-import without
// going through `transform`, so we also patch the final bundled .css assets
// in `generateBundle`.
const replaceBgaBase = (cdnBase: string) => {
  const NEEDLE = '/bga-img'
  return {
    name: 'replace-bga-base',
    apply: 'build' as const,
    enforce: 'pre' as const,
    transform(code: string) {
      if (!code.includes(NEEDLE)) return null
      return { code: code.replaceAll(NEEDLE, cdnBase), map: null }
    },
    generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue
        if (typeof file.source !== 'string' || !file.source.includes(NEEDLE)) continue
        file.source = file.source.replaceAll(NEEDLE, cdnBase)
      }
    },
  }
}

const plugins: PluginOption[] = [react(), serveBgaImages(bgaImagePath)]
if (process.env.BGA_CDN_BASE_URL) {
  plugins.push(replaceBgaBase(process.env.BGA_CDN_BASE_URL))
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins,
  server: {
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: `http://${process.env.BACKEND_HOST || 'localhost'}:${process.env.BACKEND_PORT || '5175'}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://${process.env.BACKEND_HOST || 'localhost'}:${process.env.BACKEND_PORT || '5175'}`,
        ws: true,
      },
    },
  },
  define: {
    'import.meta.env.VITE_BGA_IMAGE_DIR': JSON.stringify(
      process.env.BGA_CDN_BASE_URL || '/bga-img'
    ),
  },
})

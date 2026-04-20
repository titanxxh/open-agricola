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

// Build-time plugin: replace /bga-img with CDN URL early in the transform
// phase so that content hashes reflect the actual URLs and Vite won't
// emit "didn't resolve at build time" warnings for /bga-img/* paths.
const replaceBgaBase = (cdnBase: string) => ({
  name: 'replace-bga-base',
  apply: 'build' as const,
  enforce: 'pre' as const,
  transform(code: string) {
    if (!code.includes('/bga-img')) return null
    return { code: code.replaceAll('/bga-img', cdnBase), map: null }
  },
})

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
        target: `http://${process.env.BACKEND_HOST || 'localhost'}:5175`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://${process.env.BACKEND_HOST || 'localhost'}:5175`,
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

import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const BGA_IMAGE_DIR = process.env.BGA_IMAGE_DIR || '../bga-agricola/img'
const bgaImagePath = path.resolve(__dirname, BGA_IMAGE_DIR)
const BGA_CDN_BASE = process.env.BGA_CDN_BASE_URL || 'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260329-0408/img'

const serveBgaImages = (imageDir: string) => ({
  name: 'serve-bga-images',
  configureServer(server: any) {
    server.middlewares.use('/bga-img', async (req: any, res: any, next: any) => {
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

// Build-time plugin: replace /bga-img with CDN URL in all output CSS/JS
const replaceBgaBase = (cdnBase: string) => ({
  name: 'replace-bga-base',
  apply: 'build' as const,
  renderChunk(code: string) {
    return { code: code.replaceAll('/bga-img', cdnBase), map: null }
  },
  generateBundle(_: unknown, bundle: Record<string, any>) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'asset' && typeof file.source === 'string') {
        file.source = file.source.replaceAll('/bga-img', cdnBase)
      }
    }
  },
})

const plugins: PluginOption[] = [react(), serveBgaImages(bgaImagePath)]
if (process.env.BGA_CDN_BASE_URL) {
  plugins.push(replaceBgaBase(process.env.BGA_CDN_BASE_URL))
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), serveBgaImages(bgaImagePath)],
  server: {
    fs: {
      allow: ['..'],
    },
  },
  define: {
    'import.meta.env.VITE_BGA_IMAGE_DIR': JSON.stringify('/bga-img'),
  },
})

import { defineConfig, type PluginOption, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  loadPublicAssetConfig,
  publicAssetUrls,
} from './scripts/public-assets'
import {
  bgaAssetUrls,
  DEFAULT_BGA_CDN_BASE_URL,
} from './scripts/bga-asset-urls'

const BGA_IMAGE_DIR = process.env.BGA_IMAGE_DIR || '../bga-agricola/img'
const bgaImagePath = path.resolve(__dirname, BGA_IMAGE_DIR)
const BGA_CDN_BASE = process.env.BGA_CDN_BASE_URL || DEFAULT_BGA_CDN_BASE_URL
const publicAssets = await loadPublicAssetConfig({
  allowLocal: !process.argv.includes('build') && !process.env.CI,
  validateRemote: process.env.VITEST !== 'true',
})

const servePublicAssets = (assetRoot: string) => {
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }
  return {
    name: 'serve-public-assets',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        '/__public-assets__',
        (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
          const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
          const filePath = path.resolve(assetRoot, `.${pathname}`)
          if (
            !filePath.startsWith(`${assetRoot}${path.sep}`)
            || !fs.existsSync(filePath)
            || !fs.statSync(filePath).isFile()
          ) {
            next()
            return
          }
          res.setHeader('Content-Type', contentTypes[path.extname(filePath)] || 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        },
      )
    },
  }
}

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

const plugins: PluginOption[] = [
  react(),
  publicAssetUrls(publicAssets, [process.env.VITE_BASE_PATH ?? '/', '/']),
  serveBgaImages(bgaImagePath),
]
if (publicAssets.localDir) {
  plugins.push(servePublicAssets(publicAssets.localDir))
}
if (process.env.BGA_CDN_BASE_URL) {
  plugins.push(bgaAssetUrls(process.env.BGA_CDN_BASE_URL))
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
      '/replay-viewers': {
        target: `http://${process.env.BACKEND_HOST || 'localhost'}:${process.env.BACKEND_PORT || '5175'}`,
        changeOrigin: true,
      },
      '/replay-assets': {
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
    'import.meta.env.VITE_PUBLIC_ASSET_BASE_URL': JSON.stringify(publicAssets.baseUrl),
    'import.meta.env.VITE_PUBLIC_ASSET_VERSION': JSON.stringify(publicAssets.version),
    'import.meta.env.VITE_BGA_IMAGE_DIR': JSON.stringify(
      process.env.BGA_CDN_BASE_URL || '/bga-img'
    ),
  },
})

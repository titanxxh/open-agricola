import { defineConfig, type PluginOption, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  loadPublicAssetConfig,
  publicAssetUrls,
} from './scripts/public-assets.ts'

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

const plugins: PluginOption[] = [
  react(),
  publicAssetUrls(publicAssets, [process.env.VITE_BASE_PATH ?? '/', '/']),
]
if (publicAssets.localDir) {
  plugins.push(servePublicAssets(publicAssets.localDir))
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins,
  server: {
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/ops': {
        target: `http://${process.env.BACKEND_HOST || 'localhost'}:${process.env.BACKEND_PORT || '5175'}`,
        changeOrigin: true,
      },
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
  },
})

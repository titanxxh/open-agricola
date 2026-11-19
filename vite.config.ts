import { defineConfig, type PluginOption, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { browserCardTestsPlugin, preparedSandboxWorkerPlugin } from './scripts/vite-browser-card-tests.ts'
import { serviceWorkerPlugin, OFFLINE_ENCYCLOPEDIA_ENABLED, PUBLIC_ASSET_CACHE_ENABLED } from './scripts/vite-service-worker.ts'
import { loadBrowserDataDefines } from './scripts/browser-data.ts'
import {
  isViteDevServerCli,
  loadPublicAssetConfig,
  publicAssetUrls,
} from './scripts/public-assets.ts'

const pagesWorker = process.env.OPEN_AGRICOLA_FRONTEND_TARGET === 'stable-pages'
  && process.argv.includes('build') && process.env.VITEST !== 'true'
const publicAssets = await loadPublicAssetConfig({
  allowLocal: !process.argv.includes('build') && !process.env.CI,
  devServer: isViteDevServerCli(),
  validateRemote: process.env.VITEST !== 'true',
  includeDigests: pagesWorker && PUBLIC_ASSET_CACHE_ENABLED,
})
const browserDataDefines = process.argv.includes('build') && process.env.VITEST !== 'true'
  ? loadBrowserDataDefines(import.meta.dirname)
  : {}

const servePublicAssets = (assetRoot: string, missingIsNotFound: boolean) => {
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
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
            // A pinned checkout is the whole asset site: answer like it does instead of the app's HTML fallback.
            if (missingIsNotFound) { res.statusCode = 404; res.end() } else next()
            return
          }
          res.setHeader('Content-Type', contentTypes[path.extname(filePath)] || 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        },
      )
    },
  }
}

const preparedWorkers = process.env.RELEASE_CHANNEL === 'prerelease' && process.env.OPEN_AGRICOLA_FRONTEND_TARGET === 'prerelease-hosted'
  ? process.env.OA_PREPARED_FRONTEND_WORKERS : undefined
const plugins: PluginOption[] = [
  react(),
  browserCardTestsPlugin(preparedWorkers),
  ...(preparedWorkers ? [preparedSandboxWorkerPlugin(preparedWorkers)] : []),
  publicAssetUrls(publicAssets, [process.env.VITE_BASE_PATH ?? '/', '/']),
]
if (publicAssets.localDir) {
  plugins.push(servePublicAssets(publicAssets.localDir, publicAssets.pinned === true))
}
if (pagesWorker) plugins.push(serviceWorkerPlugin(publicAssets))

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins,
  optimizeDeps: {
    include: ['@noble/hashes/hmac.js', 'typescript'],
  },
  build: {
    rolldownOptions: {
      input: {
        index: path.resolve(import.meta.dirname, 'index.html'),
        workshopGame: path.resolve(import.meta.dirname, 'workshop-game.html'),
      },
    },
  },
  server: {
    watch: {
      // Scope the exclusion to this checkout so worktree development still watches its own source.
      ignored: [path.resolve(import.meta.dirname, '.worktree/**')],
    },
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
    ...browserDataDefines,
    'import.meta.env.VITE_GAME_BUILD_ID': JSON.stringify(process.env.GAME_BUILD_ID ?? 'development'),
    'import.meta.env.VITE_RELEASE_CHANNEL': JSON.stringify(process.env.RELEASE_CHANNEL ?? 'stable'),
    'import.meta.env.VITE_PUBLIC_ASSET_BASE_URL': JSON.stringify(publicAssets.baseUrl),
    'import.meta.env.VITE_STABLE_PAGES_WORKER': JSON.stringify(pagesWorker ? '1' : '0'),
    'import.meta.env.VITE_OFFLINE_ENCYCLOPEDIA': JSON.stringify(pagesWorker && OFFLINE_ENCYCLOPEDIA_ENABLED ? '1' : '0'),
  },
})

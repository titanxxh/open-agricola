import { expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { startReleaseAppProxy } from './hosted-release-app'

/** The API origin baked into the artifact; nothing answers there unless a test routes it. */
export const PAGES_API_ORIGIN = 'https://api.agricola.test'

let built: { directory: string; gameBuildId: string; apiOrigin: string } | undefined

/** Builds the GitHub Pages artifact once per worker with the same script the deploy workflow runs. */
export function buildPagesFrontend(apiOrigin = PAGES_API_ORIGIN) {
  if (built?.apiOrigin !== apiOrigin) {
    const wsUrl = new URL('/ws', apiOrigin)
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    execFileSync('pnpm', ['run', 'build:pages-frontend'], { stdio: 'pipe', maxBuffer: 256 * 1024 * 1024, env: {
      ...process.env, RELEASE_CHANNEL: 'stable', VITE_API_BASE: apiOrigin, VITE_WS_BASE: wsUrl.href,
    } })
    const directory = resolve('dist-pages')
    const metadata: unknown = JSON.parse(readFileSync(join(directory, 'frontend-build.json'), 'utf8'))
    if (!metadata || typeof metadata !== 'object' || !('gameBuildId' in metadata) || typeof metadata.gameBuildId !== 'string' || !metadata.gameBuildId) {
      throw new Error('Pages build requires its game build identity')
    }
    expect(metadata).toEqual({ format: 1, gameBuildId: metadata.gameBuildId, basePath: '/', releaseChannel: 'stable', deploymentTarget: 'stable-pages' })
    built = { directory, gameBuildId: metadata.gameBuildId, apiOrigin }
  }
  return built
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
}

/** Serves the artifact from the site root like a static host: files as built, 404 for everything else. */
export async function servePagesFrontend(
  directory: string,
  backend?: { backendUrl: string; frontendOrigin: string },
  override?: (request: IncomingMessage, response: ServerResponse) => boolean,
) {
  const serveFrontend = (request: IncomingMessage, response: ServerResponse) => {
    if (override?.(request, response)) return true
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://pages.invalid').pathname)
    const file = resolve(directory, `.${path.endsWith('/') ? `${path}index.html` : path}`)
    if (!file.startsWith(`${directory}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
      return false
    }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' })
    response.end(readFileSync(file))
    return true
  }
  if (backend) return startReleaseAppProxy({ ...backend, serveFrontend })
  const server = createServer((request, response) => {
    if (serveFrontend(request, response)) return
    response.writeHead(404, { 'Content-Type': 'text/plain' })
    response.end('Not found')
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done, reject) => {
      server.close(error => error ? reject(error) : done())
      server.closeAllConnections()
    }),
  }
}

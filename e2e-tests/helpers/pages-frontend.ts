import { expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'

/** The API origin baked into the artifact; nothing answers there unless a test routes it. */
export const PAGES_API_ORIGIN = 'https://api.agricola.test'

let built: { directory: string; gameBuildId: string } | undefined

/** Builds the GitHub Pages artifact once per worker with the same script the deploy workflow runs. */
export function buildPagesFrontend() {
  if (!built) {
    execFileSync('pnpm', ['run', 'build:pages-frontend'], { stdio: 'pipe', maxBuffer: 256 * 1024 * 1024, env: {
      ...process.env, VITE_API_BASE: PAGES_API_ORIGIN, VITE_WS_BASE: 'wss://api.agricola.test/ws',
    } })
    const directory = resolve('dist-pages')
    const metadata: unknown = JSON.parse(readFileSync(join(directory, 'frontend-build.json'), 'utf8'))
    expect(metadata).toEqual({ format: 1, gameBuildId: expect.any(String), basePath: '/' })
    built = { directory, gameBuildId: (metadata as { gameBuildId: string }).gameBuildId }
  }
  return built
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
}

/** Serves the artifact from the site root like a static host: files as built, 404 for everything else. */
export async function servePagesFrontend(directory: string) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://pages.invalid').pathname)
    const file = resolve(directory, `.${path.endsWith('/') ? `${path}index.html` : path}`)
    if (!file.startsWith(`${directory}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain' })
      response.end('Not found')
      return
    }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' })
    response.end(readFileSync(file))
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

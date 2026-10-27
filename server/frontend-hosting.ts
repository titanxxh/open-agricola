import { readFileSync, realpathSync, statSync } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, extname, join, resolve, sep } from 'node:path'
import { HOSTED_APP_PATH, type AppLocationResponse, type FrontendBuild } from '../shared/contract/protocol/app-location'

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

function configuredUrl(value: string | undefined, key: string): URL | undefined {
  if (!value) return undefined
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`Invalid ${key}`) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`Invalid ${key}`)
  }
  return url
}

const inside = (directory: string, file: string): boolean => file.startsWith(`${directory}${sep}`)

function requiredFile(directory: string, name: string): string {
  let file: string
  try { file = realpathSync(join(directory, name)) } catch { throw new Error(`Hosted frontend is missing ${name}`) }
  if (!inside(directory, file) || !statSync(file).isFile()) throw new Error(`Invalid hosted frontend ${name}`)
  return file
}

function readBuild(file: string): FrontendBuild {
  let value: unknown
  try { value = JSON.parse(readFileSync(file, 'utf8')) } catch { throw new Error('Invalid hosted frontend build metadata') }
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 1
    || !('gameBuildId' in value) || typeof value.gameBuildId !== 'string' || !value.gameBuildId
    || !('basePath' in value) || value.basePath !== HOSTED_APP_PATH) {
    throw new Error('Invalid hosted frontend build metadata')
  }
  return { format: 1, gameBuildId: value.gameBuildId, basePath: value.basePath }
}

function isMissing(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'ELOOP')
}

function finish(req: IncomingMessage, res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(body)),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

function immutable(relativePath: string): boolean {
  return relativePath.startsWith('assets/') && /-[\w-]{8,}\.[\w]+$/.test(basename(relativePath))
    || relativePath.startsWith('i18n/') && /\.[a-f0-9]{16,}\.json$/.test(basename(relativePath))
}

export function createFrontendHosting(env: NodeJS.ProcessEnv = process.env): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const app = configuredUrl(env.PUBLIC_APP_ORIGIN, 'PUBLIC_APP_ORIGIN')
  const api = configuredUrl(env.PUBLIC_API_BASE, 'PUBLIC_API_BASE')
  let directory: string | undefined
  let location: AppLocationResponse = { mode: 'disabled' }
  if (env.FRONTEND_ROOT && app && api && app.origin === api.origin && api.pathname === '/' && app.pathname === HOSTED_APP_PATH) {
    try { directory = realpathSync(resolve(env.FRONTEND_ROOT)) } catch { throw new Error('Hosted frontend directory is missing') }
    if (!statSync(directory).isDirectory() || directory === resolve(directory, '..')) throw new Error('Invalid hosted frontend directory')
    requiredFile(directory, 'index.html')
    const build = readBuild(requiredFile(directory, 'frontend-build.json'))
    if (!env.GAME_BUILD_ID || build.gameBuildId !== env.GAME_BUILD_ID) throw new Error('Hosted frontend build identity does not match GAME_BUILD_ID')
    location = { mode: 'canonical', appUrl: app.href, buildId: build.gameBuildId }
  }

  return async (req, res) => {
    const rawPath = (req.url ?? '').split('?', 1)[0] ?? ''
    if (rawPath === '/api/app-location') {
      const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        finish(req, res, 405, JSON.stringify({ error: 'Method not allowed' }), { ...headers, Allow: 'GET, HEAD' })
      } else finish(req, res, 200, JSON.stringify(location), headers)
      return true
    }
    if (!directory || rawPath !== HOSTED_APP_PATH.slice(0, -1) && !rawPath.startsWith(HOSTED_APP_PATH)) return false
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      finish(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' })
      return true
    }
    let pathname: string
    try { pathname = decodeURIComponent(rawPath) } catch {
      finish(req, res, 400, 'Invalid path')
      return true
    }
    if (/[\\\0]/.test(pathname) || pathname.split('/').some(segment => segment.startsWith('.'))) {
      finish(req, res, 400, 'Invalid path')
      return true
    }
    if (rawPath === HOSTED_APP_PATH.slice(0, -1)) {
      const query = (req.url ?? '').slice(rawPath.length)
      finish(req, res, 308, '', { Location: `${HOSTED_APP_PATH}${query}` })
      return true
    }
    const relativePath = pathname.slice(HOSTED_APP_PATH.length) || 'index.html'
    try {
      const file = await realpath(join(directory, relativePath))
      if (!inside(directory, file) || !(await stat(file)).isFile()) {
        finish(req, res, 404, 'Not found')
        return true
      }
      const body = req.method === 'HEAD' ? undefined : await readFile(file)
      const size = body?.length ?? (await stat(file)).size
      res.writeHead(200, {
        'Content-Type': contentTypes[extname(relativePath)] ?? 'application/octet-stream',
        'Content-Length': String(size),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': immutable(relativePath) ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      res.end(body)
    } catch (error) {
      if (!isMissing(error)) throw error
      finish(req, res, 404, 'Not found')
    }
    return true
  }
}

// Chromium browser tests answer the public asset site from the pinned checkout (#1779). Compiled pages (the hosted
// frontend, Pages builds and Replay Viewer builds) keep their Pages URLs, so E2E_PUBLIC_ASSET_DIR alone, which only the
// development server honours, left them loading fonts and art over the network: one stalled request held a page's
// load event until the test timed out. With the variable set, Playwright's global setup starts a loopback HTTPS server
// for that checkout and Chromium resolves the asset host to it, trusting only this run's key. URLs are unchanged. Pages
// under test are loopback origins; Chrome's Private Network Access would stop a public origin from loading the host.
import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey } from 'node:crypto'
import { createReadStream, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import type { FullConfig } from '@playwright/test'
import { publicAssetBaseUrl } from '../../scripts/public-assets'

export const PINNED_ASSET_HOST_PORT = 'PINNED_ASSET_HOST_PORT'
export const PINNED_ASSET_HOST_SPKI = 'PINNED_ASSET_HOST_SPKI'
/** Why a run with E2E_PUBLIC_ASSET_DIR keeps the asset site, so the guard spec skips instead of failing. */
export const PINNED_ASSET_HOST_DECLINED = 'PINNED_ASSET_HOST_DECLINED'
/** Marks every answer, so a browser test can tell the pinned host from the asset site itself. */
export const PINNED_ASSET_HEADER = 'x-open-agricola-pinned-assets'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
}

/** Chromium launch arguments that resolve the asset host to this run's pinned host; none outside such a run. */
export function pinnedAssetHostArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  const port = env[PINNED_ASSET_HOST_PORT], spki = env[PINNED_ASSET_HOST_SPKI]
  if (!port || !spki) return []
  return [`--host-resolver-rules=MAP ${new URL(publicAssetBaseUrl()).hostname} 127.0.0.1:${port}`, `--ignore-certificate-errors-spki-list=${spki}`]
}

/**
 * Launch options for a browser a spec starts itself. Every launch in a test run inherits the configuration's launch
 * arguments, and the mapping arguments are Chromium flags WebKit refuses to launch with, so other engines start with
 * none. A spec that passes its own `args` replaces the inherited ones.
 */
export function ownLaunchOptions(engine: 'chromium' | 'firefox' | 'webkit'): { args?: string[] } {
  return engine === 'chromium' ? {} : { args: [] }
}

/** Serves the checkout under the asset site's path with its CORS and cache headers; any other path is 404, like Pages. */
export function pinnedAssetHandler(root: string, version: string) {
  const prefix = new URL(publicAssetBaseUrl()).pathname
  return (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader(PINNED_ASSET_HEADER, version)
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return }
    let file: string | null = null
    try {
      const pathname = new URL(request.url ?? '/', 'https://pinned.invalid').pathname
      if (pathname.startsWith(prefix)) file = resolve(root, decodeURIComponent(pathname.slice(prefix.length)))
    } catch { file = null }
    let size = -1
    try { if (file?.startsWith(`${root}${sep}`)) { const stat = statSync(file); if (stat.isFile()) size = stat.size } } catch { size = -1 }
    if (!file || size < 0) { response.writeHead(404).end(); return }
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': size, 'access-control-allow-origin': '*', 'cache-control': 'max-age=600' })
    if (request.method === 'HEAD') { response.end(); return }
    // A failed read must close the response; a response left open would hold the page's load event again.
    createReadStream(file).on('error', () => response.destroy()).pipe(response)
  }
}

/** Starts the loopback HTTPS host with a fresh key for the asset host name; returns its port and key pin. */
export async function startPinnedAssetHost(root: string): Promise<{ port: number; spki: string; close(): Promise<void> }> {
  const checkout = resolve(root), host = new URL(publicAssetBaseUrl()).hostname
  const version = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim()
  const directory = mkdtempSync(join(tmpdir(), 'pinned-asset-host-'))
  let key: Buffer, cert: Buffer
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
      '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-days', '1',
      '-subj', `/CN=${host}`, '-addext', `subjectAltName=DNS:${host}`], { stdio: 'ignore' })
    key = readFileSync(join(directory, 'key.pem')); cert = readFileSync(join(directory, 'cert.pem'))
  } finally { rmSync(directory, { recursive: true, force: true }) }
  const spki = createHash('sha256').update(createPublicKey(key).export({ type: 'spki', format: 'der' })).digest('base64')
  const server = createServer({ key, cert }, pinnedAssetHandler(checkout, version))
  await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Pinned asset host has no port')
  return { port: address.port, spki, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()) }) }
}

/**
 * Playwright global setup: with E2E_PUBLIC_ASSET_DIR in a Chromium run, start the pinned host and export its port and
 * key pin for the configuration's launch arguments. Launch arguments are shared by every project, and WebKit refuses
 * to launch with host mapping, so a run that includes another engine (`--browser=webkit` or `all`) keeps the asset
 * site and says so.
 */
export default async function globalSetup(config: FullConfig): Promise<(() => Promise<void>) | undefined> {
  const root = process.env.E2E_PUBLIC_ASSET_DIR
  if (!root) return undefined
  if (config.projects.some(project => (project.use.browserName ?? 'chromium') !== 'chromium')) {
    process.env[PINNED_ASSET_HOST_DECLINED] = 'the run includes a browser other than Chromium'
    return undefined
  }
  const host = await startPinnedAssetHost(root)
  process.env[PINNED_ASSET_HOST_PORT] = String(host.port)
  process.env[PINNED_ASSET_HOST_SPKI] = host.spki
  return host.close
}

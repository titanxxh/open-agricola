import { expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { hostedFrontendEnvironment, PAGES_FRONTEND_CACHE, viteDotenv } from '../../scripts/verify-lanes'
import { startReleaseAppProxy } from './hosted-release-app'

/** The API origin baked into the artifact; nothing answers there unless a test routes it. */
export const PAGES_API_ORIGIN = 'https://api.agricola.test'

type PagesBuild = { directory: string; gameBuildId: string; apiOrigin: string }

let built: PagesBuild | undefined
const builds = new Map<string, PagesBuild>()
const owned: string[] = []
let ownedCount = 0
process.once('exit', () => { for (const directory of owned) rmSync(directory, { recursive: true, force: true }) })

const ownedDirectory = () => {
  const directory = resolve('output/pages-frontend', `${process.pid}-${ownedCount++}`)
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(dirname(directory), { recursive: true })
  owned.push(directory)
  return directory
}

const socketOrigin = (origin: string) => {
  const url = new URL(origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.origin.replace(/^https?:/, url.protocol)
}

/**
 * The GitHub Pages artifact for an API origin. It runs `build:pages-frontend`, the script the deploy workflow runs, at
 * most once per process, or once per Chromium task when `verify:parallel` names a shared cache in
 * VERIFY_PAGES_FRONTEND_CACHE (the first lane builds under a lock, the others reuse it). The build bakes in
 * PAGES_API_ORIGIN; another origin gets a copy whose API and WebSocket origin literals are replaced, the only bytes
 * `VITE_API_BASE` / `VITE_WS_BASE` change (#1955).
 */
export function buildPagesFrontend(apiOrigin = PAGES_API_ORIGIN): PagesBuild {
  const origin = new URL(apiOrigin).origin
  const cached = builds.get(origin)
  if (cached) return cached
  const base = built ??= pagesBuild()
  if (origin === base.apiOrigin) { builds.set(origin, base); return base }
  const directory = ownedDirectory()
  cpSync(base.directory, directory, { recursive: true })
  const replacements: [string, string][] = [[base.apiOrigin, origin], [socketOrigin(base.apiOrigin), socketOrigin(origin)]]
  let replaced = 0
  // The Pages Worker embeds each hashed file's SHA-256, so rewritten files keep matching digests in `sw.js`.
  const digests: [string, string][] = []
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
  const rewrite = (folder: string) => {
    for (const name of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, name.name)
      if (name.isDirectory()) { rewrite(path); continue }
      if (!['.js', '.html', '.json', '.css', '.webmanifest'].includes(extname(name.name))) continue
      const text = readFileSync(path, 'utf8')
      let next = text
      for (const [from, to] of replacements) next = next.replaceAll(from, to)
      if (next === text) continue
      writeFileSync(path, next)
      digests.push([sha256(text), sha256(next)])
      replaced++
    }
  }
  rewrite(directory)
  if (!replaced) throw new Error(`The Pages build does not contain its API origin ${base.apiOrigin}`)
  const worker = join(directory, 'sw.js')
  if (existsSync(worker)) {
    let source = readFileSync(worker, 'utf8')
    for (const [from, to] of digests) source = source.replaceAll(from, to)
    writeFileSync(worker, source)
  }
  const artifact = { directory, gameBuildId: base.gameBuildId, apiOrigin: origin }
  builds.set(origin, artifact)
  return artifact
}

function pagesBuild(): PagesBuild {
  const env = { ...process.env, RELEASE_CHANNEL: 'stable', VITE_API_BASE: PAGES_API_ORIGIN, VITE_WS_BASE: `${socketOrigin(PAGES_API_ORIGIN)}/ws` }
  const build = (target: string) => {
    const started = Date.now()
    execFileSync('pnpm', ['run', 'build:pages-frontend'], { stdio: 'pipe', maxBuffer: 256 * 1024 * 1024, env })
    rmSync(target, { recursive: true, force: true })
    renameSync(resolve('dist-pages'), target)
    console.log(`[pages-frontend] built in ${Math.round((Date.now() - started) / 1000)} s`)
  }
  const cache = process.env[PAGES_FRONTEND_CACHE]
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  let directory: string
  // A lane is a clean worktree of the task's commit; anything else builds for itself.
  if (cache && !git('status', '--porcelain', '--untracked-files=all')) {
    const key = createHash('sha256').update(JSON.stringify({
      head: git('rev-parse', 'HEAD'), environment: hostedFrontendEnvironment(env), dotenv: viteDotenv(process.cwd()),
    })).digest('hex').slice(0, 24)
    directory = join(resolve(cache), key)
    withLock(`${directory}.lock`, () => {
      if (existsSync(join(directory, 'frontend-build.json'))) { console.log('[pages-frontend] reused the task build'); return }
      const staging = `${directory}.${process.pid}`
      build(staging)
      renameSync(staging, directory)
    })
  } else build(directory = ownedDirectory())
  const metadata: unknown = JSON.parse(readFileSync(join(directory, 'frontend-build.json'), 'utf8'))
  if (!metadata || typeof metadata !== 'object' || !('gameBuildId' in metadata) || typeof metadata.gameBuildId !== 'string' || !metadata.gameBuildId) {
    throw new Error('Pages build requires its game build identity')
  }
  expect(metadata).toEqual({ format: 1, gameBuildId: metadata.gameBuildId, basePath: '/', releaseChannel: 'stable', deploymentTarget: 'stable-pages' })
  return { directory, gameBuildId: metadata.gameBuildId, apiOrigin: PAGES_API_ORIGIN }
}

/** Runs `critical` while holding a directory lock shared by the lanes' worker processes; a dead holder's lock is taken over. */
function withLock(lock: string, critical: () => void) {
  mkdirSync(dirname(lock), { recursive: true })
  const deadline = Date.now() + 15 * 60_000
  for (;;) {
    try { mkdirSync(lock); break } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    let holder = NaN
    try { holder = Number(readFileSync(join(lock, 'pid'), 'utf8')) } catch { /* the holder is still writing its pid */ }
    if (Number.isInteger(holder) && !alive(holder)) { rmSync(lock, { recursive: true, force: true }); continue }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for the Pages build lock ${lock}`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  try {
    writeFileSync(join(lock, 'pid'), String(process.pid))
    critical()
  } finally { rmSync(lock, { recursive: true, force: true }) }
}

function alive(pid: number) {
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
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
  return serveStatic(serveFrontend)
}

async function serveStatic(serveFrontend: (request: IncomingMessage, response: ServerResponse) => boolean) {
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

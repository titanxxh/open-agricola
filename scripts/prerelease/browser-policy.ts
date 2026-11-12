import { createHash } from 'node:crypto'
import { request } from 'node:https'
import type { LookupFunction } from 'node:net'
import { BROWSER_AUTH_VERSION, type BrowserAuthPolicy } from '../../shared/contract/browser-auth.ts'

export type FormalOrigins = Pick<BrowserAuthPolicy, 'appOrigin' | 'apiOrigin'>
export type FormalTlsOptions = { ca?: Buffer; lookup?: LookupFunction }
export type FormalBrowserScope = { targetId: string; targetFingerprint: string; origin: string; buildId: string; generation: string; operationId: string }

function exactHttpsOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('Expected an exact formal HTTPS origin')
  return value
}

function read(url: URL, maxBytes: number, options: FormalTlsOptions): Promise<Buffer> {
  return new Promise((done, reject) => {
    const outgoing = request(url, { ca: options.ca, lookup: options.lookup, timeout: 5000, signal: AbortSignal.timeout(5000), headers: { 'Cache-Control': 'no-cache' } }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Formal browser policy readback failed')); return }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) outgoing.destroy(new Error('Formal browser policy response exceeds its limit'))
        else chunks.push(chunk)
      })
      response.on('end', () => done(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    outgoing.on('timeout', () => outgoing.destroy(new Error('Formal browser policy request timed out')))
    outgoing.on('error', () => reject(new Error('Formal browser policy connection failed')))
    outgoing.end()
  })
}

/** Public metadata only. No cookies, service keys, redirects or request-derived origins. */
export async function readBrowserAuthPolicy(formal: FormalOrigins, options: FormalTlsOptions = {}): Promise<BrowserAuthPolicy> {
  exactHttpsOrigin(formal.appOrigin)
  const bytes = await read(new URL('/api/auth/browser-policy', exactHttpsOrigin(formal.apiOrigin)), 16 * 1024, options)
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== BROWSER_AUTH_VERSION
    || !('buildId' in value) || typeof value.buildId !== 'string' || !/^[a-f0-9]{40}$/.test(value.buildId)
    || !('appOrigin' in value) || value.appOrigin !== formal.appOrigin
    || !('apiOrigin' in value) || value.apiOrigin !== formal.apiOrigin) throw new Error('Formal browser authentication policy is incompatible')
  return { version: BROWSER_AUTH_VERSION, buildId: value.buildId, ...formal }
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/** Bind the running API to the actual Pages marker, HTML and module entry bytes. */
export async function readFormalBrowserDeployment(formal: FormalOrigins, options: FormalTlsOptions = {}) {
  const policy = await readBrowserAuthPolicy(formal, options)
  const [marker, html] = await Promise.all([
    read(new URL('/frontend-build.json', formal.appOrigin), 16 * 1024, options),
    read(new URL('/', formal.appOrigin), 1024 * 1024, options),
  ])
  const build: unknown = JSON.parse(marker.toString('utf8'))
  if (!build || typeof build !== 'object' || !('gameBuildId' in build) || build.gameBuildId !== policy.buildId
    || !('format' in build) || build.format !== 1 || !('basePath' in build) || build.basePath !== '/'
    || !('deploymentTarget' in build) || build.deploymentTarget !== 'stable-pages'
    || !('releaseChannel' in build) || build.releaseChannel !== 'stable') throw new Error('Formal Pages and API build identities differ')
  const entries = [...html.toString('utf8').matchAll(/<script\b([^>]*)>/gi)]
    .map(match => match[1]).filter(attributes => /\btype=["']module["']/i.test(attributes))
    .map(attributes => /\bsrc=["']([^"']+)["']/i.exec(attributes)?.[1])
  const entryPath = entries[0]
  if (entries.length !== 1 || !entryPath || !/^\/assets\/[A-Za-z0-9_.-]+\.js$/.test(entryPath)) throw new Error('Formal Pages has no unique same-origin module entry')
  const entry = await read(new URL(entryPath, formal.appOrigin), 16 * 1024 * 1024, options)
  const current = await readBrowserAuthPolicy(formal, options)
  if (current.buildId !== policy.buildId) throw new Error('Formal build changed during browser policy verification')
  return { ...policy, pages: { markerSha256: sha256(marker), htmlSha256: sha256(html), entryPath, entrySha256: sha256(entry) } }
}

export async function verifyFormalBrowserAcceptance(formal: FormalOrigins, proof: unknown, scope: FormalBrowserScope, options: FormalTlsOptions = {}) {
  if (!proof || typeof proof !== 'object' || !('format' in proof) || proof.format !== 1
    || Object.entries(scope).some(([key, value]) => Reflect.get(proof, key) !== value)
    || !('observedAt' in proof) || typeof proof.observedAt !== 'number' || !Number.isSafeInteger(proof.observedAt)
    || proof.observedAt > Date.now() || Date.now() - proof.observedAt > 30 * 60_000
    || !('deployment' in proof) || !proof.deployment || typeof proof.deployment !== 'object') throw new Error('Formal browser proof belongs to a different or expired acceptance')
  const live = await readFormalBrowserDeployment(formal, options), observed = proof.deployment
  if (['version', 'buildId', 'appOrigin', 'apiOrigin'].some(key => Reflect.get(observed, key) !== Reflect.get(live, key))
    || !('pages' in observed) || !observed.pages || typeof observed.pages !== 'object') throw new Error('Formal browser deployment changed after acceptance')
  const pages = observed.pages
  if (Object.entries(live.pages).some(([key, value]) => Reflect.get(pages, key) !== value)) throw new Error('Formal browser deployment changed after acceptance')
  return live
}

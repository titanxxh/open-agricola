import { expect, type BrowserContext } from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, appendFile, rm } from 'node:fs/promises'
import { createServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { createConnection } from 'node:net'
import type { Duplex } from 'node:stream'
import { PostgresDatabase } from '../../server/database/postgres'
import { createPrereleaseAuthorityHandler } from '../../server/prerelease-authority-routes'
import { readCookie } from '../../server/auth-cookies'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseEnv } from 'node:util'
import { startHostedReleaseApp, type HostedReleaseApp } from './hosted-release-app'

const exec = promisify(execFile)
export type BetaAccessApp = HostedReleaseApp & {
  environment: NodeJS.ProcessEnv
  authenticate(context: BrowserContext, username: string, displayName: string): Promise<void>
}

/** Isolates account qualification and browser state from other specs. */
export async function startHostedReleaseAppWithBetaAccess({ https = false } = {}): Promise<BetaAccessApp> {
  const root = await mkdtemp(join(tmpdir(), 'agricola-beta-'))
  const createEnvironment = { ...process.env }
  for (const key of ['BACKEND_PORT', 'FRONTEND_PORT', 'APP_BASE_PORT']) delete createEnvironment[key]
  await exec(process.execPath, ['--import', 'tsx', 'scripts/test-environment.ts', 'create', root], { env: createEnvironment })
  const envPath = join(root, 'test.env')
  await appendFile(envPath, "LOCAL_DEPENDENCIES_READY='1'\n")
  const environment = { ...process.env, ...parseEnv(await readFile(envPath, 'utf8')) }
  let hosted: HostedReleaseApp | undefined
  let secure: Awaited<ReturnType<typeof httpsQualificationApp>> | undefined
  let closing: Promise<void> | undefined
  const close = () => closing ??= (async () => {
    await secure?.close()
    await hosted?.close()
    await exec('bash', ['./restart-local.sh', '--kill-only'], { env: environment, maxBuffer: 8 * 1024 * 1024 })
    await exec(process.execPath, ['--import', 'tsx', 'scripts/test-environment.ts', 'cleanup', root], { env: environment })
    await rm(root, { recursive: true, force: true })
  })()
  try {
    await exec('bash', ['./restart-local.sh'], { env: environment, maxBuffer: 8 * 1024 * 1024 })
    hosted = await startHostedReleaseApp({ backendUrl: environment.BACKEND_URL!, frontendOrigin: environment.FRONTEND_URL! })
    if (https) secure = await httpsQualificationApp(hosted, environment, root)
    const app = secure ?? hosted
    return { ...app, environment, close, async authenticate(context, username, displayName) {
      await context.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'en') })
      const oauth = await context.request.post(`${app.apiUrl}/api/test/oauth/github/callback`, {
        data: { providerUserId: `beta-${username}`, providerLogin: username, email: `${username}@example.com`, displayName },
      })
      expect(oauth.ok(), await oauth.text()).toBe(true)
      const result: unknown = await oauth.json()
      if (result && typeof result === 'object' && 'mode' in result && result.mode === 'login') return
      expect(result).toMatchObject({ mode: 'onboarding' })
      const complete = await context.request.post(`${app.apiUrl}/api/auth/onboarding/complete`, {
        data: { username, displayName, password: 'beta-test-password', confirmPassword: 'beta-test-password' },
      })
      expect(complete.ok(), await complete.text()).toBe(true)
    } }
  } catch (error) {
    await close().catch(() => {})
    throw error
  }
}


async function httpsQualificationApp(hosted: HostedReleaseApp, environment: NodeJS.ProcessEnv, root: string) {
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(root, 'key.pem'),
    '-out', join(root, 'cert.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'])
  const db = new PostgresDatabase({ connectionString: environment.DATABASE_URL, schema: environment.DATABASE_SCHEMA })
  const identity = createPrereleaseAuthorityHandler({ db, getSourceToken: async request => readCookie(request.headers.cookie, 'oa_session') })
  const target = new URL(hosted.apiUrl), sockets = new Set<Duplex>()
  let origin = ''
  const previous = { PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN, PRERELEASE_APP_ORIGIN: process.env.PRERELEASE_APP_ORIGIN, ADMIN_USERS: process.env.ADMIN_USERS }
  const headers = (request: import('node:http').IncomingMessage) => ({ ...request.headers, host: target.host,
    ...(request.headers.origin === origin ? { origin: target.origin } : {}) })
  const server = createServer({ key: await readFile(join(root, 'key.pem')), cert: await readFile(join(root, 'cert.pem')) }, (request, response) => {
    void (async () => {
      if (new URL(request.url ?? '/', origin).pathname.startsWith('/api/prerelease/')) {
        await identity(request, response)
        return
      }
      const upstream = httpRequest(new URL(request.url ?? '/', target), { method: request.method, headers: headers(request) }, result => {
        response.writeHead(result.statusCode ?? 502, result.headers)
        result.pipe(response)
      })
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end() })
      request.pipe(upstream)
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end() })
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  server.on('upgrade', (request, socket, head) => {
    const upstream = createConnection({ host: target.hostname, port: Number(target.port) })
    sockets.add(upstream)
    upstream.on('connect', () => {
      upstream.write(`GET ${request.url} HTTP/1.1\r\n${Object.entries(headers(request)).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n`)
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
    upstream.on('close', () => { sockets.delete(upstream); socket.destroy() })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected HTTPS qualification fixture address')
  origin = `https://127.0.0.1:${address.port}`
  process.env.PUBLIC_APP_ORIGIN = origin
  process.env.PRERELEASE_APP_ORIGIN = ''
  process.env.ADMIN_USERS = environment.ADMIN_USERS
  return { ...hosted, appUrl: `${origin}/open-agricola/`, apiUrl: origin, async close() {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await db.close()
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  } }
}

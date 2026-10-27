import { expect, devices, type BrowserContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer as createHttpServer, request as httpRequest, type IncomingMessage } from 'node:http'
import { createServer } from 'node:https'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Duplex } from 'node:stream'
import { createLocalUserForTests } from '../server/auth'
import { clearSessionCookie, readCookie, serializeSessionCookie, SESSION_COOKIE } from '../server/auth-cookies'
import { getDb } from '../server/db'
import { createFrontendHosting } from '../server/frontend-hosting'
import { HOSTED_APP_PATH } from '../shared/contract/protocol/app-location'
import { BACKEND_URL, FRONTEND_URL, finishHotseatOpening } from './fixtures'
import { test } from './server-fixtures'

type Topology = 'legacy-cross-site' | 'hosted'
type Engine = 'webkit' | 'chromium'
const PASSWORD = 'hosted-password-session-826'

function hostedBuild() {
  const directory = resolve('dist')
  const metadata: unknown = JSON.parse(readFileSync(join(directory, 'frontend-build.json'), 'utf8'))
  if (!metadata || typeof metadata !== 'object' || !('gameBuildId' in metadata) || typeof metadata.gameBuildId !== 'string') {
    throw new Error('Build the production frontend with pnpm run build:hosted-frontend before this spec')
  }
  expect(metadata).toEqual({ format: 1, gameBuildId: metadata.gameBuildId, basePath: HOSTED_APP_PATH })
  return { directory, gameBuildId: metadata.gameBuildId }
}

async function fixture(playwright: PlaywrightWorkerArgs['playwright'], engine: Engine, topology: Topology) {
  expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
  const build = hostedBuild()
  const directory = mkdtempSync(join(tmpdir(), 'agricola-hosted-login-'))
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'),
    '-days', '1', '-subj', '/CN=app.agricola.test',
    '-addext', 'subjectAltName=DNS:app.agricola.test,DNS:app.test,DNS:api.test',
  ], { stdio: 'ignore' })
  const username = `hosted_${randomUUID().slice(0, 8)}`
  const user = await createLocalUserForTests(username, PASSWORD)
  const keys = ['NODE_ENV', 'PUBLIC_APP_ORIGIN', 'PUBLIC_API_BASE', 'CORS_ORIGIN']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const sockets = new Set<Duplex>()
  const errors: string[] = []
  const socketMessages: string[] = []
  let appOrigin = ''
  let apiOrigin = ''
  const backend = new URL(BACKEND_URL)
  const trustedBackendOrigin = new URL(FRONTEND_URL).origin
  const track = (socket: Duplex) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  }
  const forwardedHeaders = (req: IncomingMessage) => {
    const headers = { ...req.headers, host: backend.host }
    if (headers.origin === appOrigin || headers.origin === apiOrigin) headers.origin = trustedBackendOrigin
    return headers
  }
  const server = createServer({
    key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')),
  }, (req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', appOrigin)
      if (topology === 'legacy-cross-site' && req.headers.host === new URL(appOrigin).host) {
        if (url.pathname === '/client/config.ts') {
          res.setHeader('Content-Type', 'text/javascript')
          res.end(`export const API_BASE=${JSON.stringify(apiOrigin)};export const WS_BASE=${JSON.stringify(apiOrigin.replace('https:', 'wss:') + '/ws')};export const SANDBOX_EXECUTOR='browser';`)
          return
        }
        const upstream = await fetch(`${FRONTEND_URL}${req.url}`, { redirect: 'manual' })
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'text/plain' })
        res.end(Buffer.from(await upstream.arrayBuffer()))
        return
      }
      if (await handleFrontend(req, res)) return
      // The restarted backend owns password verification, status/body, opaque token,
      // database session, API authorization and WS. This TLS adapter only maps the
      // known fixture origin and serializes its real session cookie for production HTTPS.
      let cancelled = false
      const upstream = httpRequest(new URL(req.url ?? '/', backend), {
        method: req.method, headers: forwardedHeaders(req),
      }, response => {
        const headers = { ...response.headers,
          'access-control-allow-origin': appOrigin,
          'access-control-allow-credentials': 'true',
        }
        if (response.headers['set-cookie']) {
          headers['set-cookie'] = response.headers['set-cookie'].map(cookie => {
            if (!cookie.startsWith(`${SESSION_COOKIE}=`)) return cookie
            const token = readCookie(cookie, SESSION_COOKIE)
            const options = { backendOrigin: apiOrigin, requestOrigin: req.headers.origin }
            return token ? serializeSessionCookie(token, options) : clearSessionCookie(options)
          })
        }
        res.writeHead(response.statusCode ?? 502, headers)
        response.pipe(res)
      })
      upstream.on('error', error => {
        if (cancelled) return
        errors.push(error.message)
        if (!res.headersSent) res.writeHead(502)
        res.end('Backend unavailable')
      })
      req.on('aborted', () => { cancelled = true; upstream.destroy() })
      res.on('close', () => { if (!res.writableEnded) { cancelled = true; upstream.destroy() } })
      req.pipe(upstream)
    })().catch(error => {
      errors.push(error instanceof Error ? error.message : String(error))
      if (!res.headersSent) res.writeHead(500)
      res.end('HTTPS fixture failed')
    })
  })
  server.on('connection', track)
  server.on('upgrade', (req, socket, head) => {
    if (!/^\/nodes\/[A-Za-z0-9-]+\/ws$/.test(req.url ?? '')) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      return
    }
    let cancelled = false
    const upstream = httpRequest(new URL(req.url ?? '/', backend), { headers: forwardedHeaders(req) })
    upstream.on('upgrade', (response, transport, upstreamHead) => {
      track(transport)
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${response.rawHeaders.reduce((text, value, index, headers) => index % 2 ? text : `${text}${value}: ${headers[index + 1]}\r\n`, '')}\r\n`)
      if (head.length) transport.write(head)
      if (upstreamHead.length) socket.write(upstreamHead)
      socket.on('close', () => transport.destroy())
      transport.on('close', () => socket.destroy())
      socket.pipe(transport).pipe(socket)
    })
    upstream.on('response', response => {
      socket.end(`HTTP/1.1 ${response.statusCode ?? 502} Upgrade Rejected\r\nConnection: close\r\n\r\n`)
      response.resume()
    })
    upstream.on('error', error => { if (!cancelled) errors.push(error.message); socket.destroy() })
    socket.on('close', () => { cancelled = true; upstream.destroy() })
    upstream.end()
  })
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing HTTPS fixture port')
  appOrigin = `https://${topology === 'hosted' ? 'app.agricola.test' : 'app.test'}:${address.port}`
  apiOrigin = topology === 'hosted' ? appOrigin : `https://api.test:${address.port}`
  process.env.NODE_ENV = 'production'
  process.env.PUBLIC_APP_ORIGIN = `${appOrigin}${HOSTED_APP_PATH}`
  process.env.PUBLIC_API_BASE = apiOrigin
  process.env.CORS_ORIGIN = appOrigin
  const handleFrontend = createFrontendHosting({ ...process.env, FRONTEND_ROOT: build.directory, GAME_BUILD_ID: build.gameBuildId })
  const proxy = createHttpServer((_req, res) => { res.writeHead(502); res.end() })
  proxy.on('connect', (req, socket, head) => {
    const target = new URL(`http://${req.url}`)
    const local = ['app.test', 'api.test', 'app.agricola.test'].includes(target.hostname)
    const upstream = connect(local ? address.port : Number(target.port) || 443, local ? '127.0.0.1' : target.hostname, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    track(socket)
    track(upstream)
  })
  await new Promise<void>(resolveListen => proxy.listen(0, '127.0.0.1', resolveListen))
  const proxyAddress = proxy.address()
  if (!proxyAddress || typeof proxyAddress === 'string') throw new Error('Missing proxy fixture port')
  let context: BrowserContext | undefined
  try {
    context = await playwright[engine].launchPersistentContext(join(directory, 'browser-profile'), {
      ...(engine === 'webkit' ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } }),
      ignoreHTTPSErrors: true,
      args: engine === 'webkit' ? ['--enable-itp', '--cookies-policy=no-third-party'] : ['--test-third-party-cookie-phaseout'],
      proxy: { server: `http://127.0.0.1:${proxyAddress.port}` },
    })
    await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    const observe = (page: Page) => {
      page.on('pageerror', error => errors.push(error.stack ?? error.message))
      page.on('websocket', socket => {
        if (!socket.url().startsWith(apiOrigin.replace('https:', 'wss:') + '/nodes/')) return
        socket.on('framereceived', ({ payload }) => {
          if (typeof payload !== 'string') return
          const message: unknown = JSON.parse(payload)
          if (message && typeof message === 'object' && 'type' in message && typeof message.type === 'string') socketMessages.push(message.type)
        })
      })
    }
    return {
      appUrl: `${appOrigin}${HOSTED_APP_PATH}`, apiOrigin, build, username, userId: user.id,
      context, observe, errors, socketMessages,
      close: async () => {
        await context?.close()
        for (const socket of sockets) socket.destroy()
        await new Promise<void>(done => proxy.close(() => done()))
        await new Promise<void>(done => server.close(() => done()))
        await getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
        for (const key of keys) {
          if (previous[key] === undefined) delete process.env[key]
          else process.env[key] = previous[key]
        }
        rmSync(directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(done => proxy.close(() => done()))
    await new Promise<void>(done => server.close(() => done()))
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

async function submitPassword(page: Page, username: string) {
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(PASSWORD)
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login'),
    page.locator('button[type="submit"]').click(),
  ])
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, user: { username } })
}

test('strict WebKit reproduces legacy cross-site password login returning to the form', async ({ playwright }, testInfo) => {
  test.skip(process.platform !== 'linux', 'This red control covers WPE without CHIPS; hosted acceptance runs on every platform')
  const environment = await fixture(playwright, 'webkit', 'legacy-cross-site')
  try {
    const page = await environment.context.newPage()
    environment.observe(page)
    await page.goto(`${environment.appUrl}?page=login&bg=none`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#username')).toBeVisible()
    const rejectedLobby = page.waitForResponse(response => new URL(response.url()).pathname === '/api/lobby/my-rooms')
    await submitPassword(page, environment.username)
    expect((await rejectedLobby).status()).toBe(401)
    await expect(page.locator('#username')).toBeVisible()
    expect((await environment.context.cookies(environment.apiOrigin)).some(cookie => cookie.name === SESSION_COOKIE)).toBe(false)
    expect(environment.errors).toEqual([])
    testInfo.annotations.push({ type: 'limitation', description: 'Linux WPE reproduction is not physical Safari/iPhone acceptance' })
  } finally { await environment.close() }
})

for (const engine of ['webkit', 'chromium'] satisfies Engine[]) {
  test(`${engine} production frontend retains password session through refresh and routed room recovery`, async ({ playwright }, testInfo) => {
    if (engine === 'webkit') testInfo.annotations.push({ type: 'limitation', description: 'Strict WebKit engine coverage does not replace physical Safari/iPhone acceptance' })
    const environment = await fixture(playwright, engine, 'hosted')
    try {
      let page = await environment.context.newPage()
      environment.observe(page)
      const document = await page.goto(`${environment.appUrl}?page=login&bg=none`, { waitUntil: 'domcontentloaded' })
      if (!document) throw new Error('Production app document was not loaded')
      expect(document.status()).toBe(200)
      expect(await document.body()).toEqual(readFileSync(join(environment.build.directory, 'index.html')))
      await expect(page.locator('#username')).toBeVisible()
      const authenticatedLobby = page.waitForResponse(response => new URL(response.url()).pathname === '/api/lobby/my-rooms')
      await submitPassword(page, environment.username)
      expect((await authenticatedLobby).status()).toBe(200)
      await expect(page.getByRole('button', { name: 'Create Multiplayer Game', exact: true })).toBeVisible()
      expect(await environment.context.cookies(environment.apiOrigin)).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: SESSION_COOKIE, secure: true, httpOnly: true, sameSite: 'Lax' }),
      ]))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('button', { name: 'Local Hotseat', exact: true })).toBeVisible()
      const workshopLoads = [
        page.waitForResponse(response => {
          const url = new URL(response.url())
          return url.pathname === '/api/workshop/cards' && !url.searchParams.has('scope') && !url.searchParams.has('featured')
        }),
        page.waitForResponse(response => {
          const url = new URL(response.url())
          return url.pathname === '/api/workshop/cards' && url.searchParams.get('featured') === '1'
        }),
        page.waitForResponse(response => {
          const url = new URL(response.url())
          return url.pathname === '/api/workshop/cards' && url.searchParams.get('scope') === 'mine'
        }),
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/workshop/sandbox'),
      ]
      await page.goto(`${environment.appUrl}?page=workshop`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Card Workshop', exact: true })).toBeVisible()
      for (const response of await Promise.all(workshopLoads)) {
        expect(response.status()).toBe(200)
        expect(await response.json()).toMatchObject({ ok: true })
      }
      await page.goto(environment.appUrl, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: 'Local Hotseat', exact: true }).click()
      await page.getByRole('checkbox', { name: /Snake opening/ }).uncheck()
      await page.getByRole('button', { name: 'Start Hotseat Game', exact: true }).click()
      await finishHotseatOpening(page)
      await expect(page.locator('.game-layout')).toBeVisible()
      await expect.poll(() => environment.socketMessages.includes('commandScope')).toBe(true)
      const roomId = new URL(page.url()).searchParams.get('room')
      if (!roomId) throw new Error('Server did not return a room identity')
      const saved = await getDb().prepare('SELECT state_json, created_by, max_players, hotseat FROM rooms WHERE id = ?')
        .get<{ state_json: string; created_by: string; max_players: number; hotseat: number }>(roomId)
      if (!saved) throw new Error('Authoritative hotseat room was not persisted')
      expect(saved).toMatchObject({ created_by: environment.userId, max_players: 2, hotseat: 1 })
      const savedHash = createHash('sha256').update(saved.state_json).digest('hex')
      const scopes = environment.socketMessages.filter(type => type === 'commandScope').length
      await page.close()
      await expect.poll(async () => (await getDb().prepare('SELECT connected_count FROM room_presence WHERE room_id = ?')
        .get<{ connected_count: number }>(roomId))?.connected_count).toBe(0)
      page = await environment.context.newPage()
      environment.observe(page)
      await page.goto(`${environment.appUrl}?room=${roomId}`, { waitUntil: 'domcontentloaded' })
      await finishHotseatOpening(page)
      await expect(page.locator('.game-layout')).toBeVisible()
      await expect.poll(() => environment.socketMessages.filter(type => type === 'commandScope').length).toBeGreaterThan(scopes)
      const restored = await getDb().prepare('SELECT state_json, created_by FROM rooms WHERE id = ?')
        .get<{ state_json: string; created_by: string }>(roomId)
      if (!restored) throw new Error('Original room disappeared during recovery')
      expect(restored.created_by).toBe(environment.userId)
      expect(createHash('sha256').update(restored.state_json).digest('hex')).toBe(savedHash)
      await page.goto(environment.appUrl, { waitUntil: 'domcontentloaded' })
      expect(await page.evaluate(async id => (await fetch(`/api/rooms/${id}/dissolve`, { method: 'POST', credentials: 'include' })).status, roomId)).toBe(200)
      await expect(page.getByRole('button', { name: 'Create Multiplayer Game', exact: true })).toBeVisible()
      const desktopLogout = page.getByRole('button', { name: 'Sign Out', exact: true })
      if (!await desktopLogout.isVisible()) {
        await page.getByRole('banner').getByRole('button', { name: 'Settings', exact: true }).click()
      }
      const logoutButton = await desktopLogout.isVisible()
        ? desktopLogout
        : page.getByRole('menuitem', { name: 'Sign Out', exact: true })
      await expect(logoutButton).toBeVisible()
      const [logout] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/logout'),
        logoutButton.click(),
      ])
      expect(logout.status()).toBe(200)
      await expect(page.locator('#username')).toBeVisible()
      expect(await page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).status)).toBe(401)
      expect(environment.errors).toEqual([])
      await testInfo.attach('hosted-session-evidence', {
        body: JSON.stringify({ engine, gameBuildId: environment.build.gameBuildId, productionDocumentBytesMatched: true,
          passwordAccepted: true, sessionSurvivedReload: true, routedCommandScope: true, retainedRoomStateSha256: savedHash,
          roomRecovered: true, logoutRejectedSession: true, cookieAdaptation: 'real backend token, production cookie serializer at TLS boundary' }),
        contentType: 'application/json',
      })
    } finally { await environment.close() }
  })
}

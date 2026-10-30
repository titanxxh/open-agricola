import { expect, devices, type BrowserContext, type Page, type PlaywrightWorkerArgs, type Request } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer, request as httpRequest, type IncomingMessage } from 'node:http'
import { createServer } from 'node:https'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'
import type { Duplex } from 'node:stream'
import { createLocalUserForTests } from '../server/auth'
import { clearSessionCookie, readCookie, serializeSessionCookie, SESSION_COOKIE } from '../server/auth-cookies'
import { getDb } from '../server/db'
import { createFrontendHosting } from '../server/frontend-hosting'
import { HOSTED_APP_PATH } from '../shared/contract/protocol/app-location'
import { BACKEND_URL, FRONTEND_URL, finishHotseatOpening } from './fixtures'
import { test } from './server-fixtures'

type Topology = 'legacy-cross-site' | 'same-site-pages'
type Engine = 'webkit' | 'chromium'
const PASSWORD = 'hosted-password-session-826'

let pagesBuilt = false
function frontendBuild(topology: Topology) {
  if (topology === 'same-site-pages' && !pagesBuilt) {
    execFileSync('pnpm', ['run', 'build:pages-frontend'], { stdio: 'pipe', env: {
      ...process.env, VITE_API_BASE: 'https://api.agricola.test', VITE_WS_BASE: 'wss://api.agricola.test/ws',
    } })
    pagesBuilt = true
  }
  const directory = resolve(topology === 'same-site-pages' ? 'dist-pages' : 'dist')
  const metadata: unknown = JSON.parse(readFileSync(join(directory, 'frontend-build.json'), 'utf8'))
  if (!metadata || typeof metadata !== 'object' || !('gameBuildId' in metadata) || typeof metadata.gameBuildId !== 'string') {
    throw new Error('Build the production frontend with pnpm run build:hosted-frontend before this spec')
  }
  expect(metadata).toEqual({ format: 1, gameBuildId: metadata.gameBuildId, basePath: topology === 'same-site-pages' ? '/' : HOSTED_APP_PATH })
  return { directory, gameBuildId: metadata.gameBuildId }
}

async function fixture(playwright: PlaywrightWorkerArgs['playwright'], engine: Engine, topology: Topology) {
  expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
  const build = frontendBuild(topology)
  const directory = mkdtempSync(join(tmpdir(), 'agricola-hosted-login-'))
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'),
    '-days', '1', '-subj', '/CN=app.agricola.test',
    '-addext', 'subjectAltName=DNS:app.agricola.test,DNS:api.agricola.test,DNS:app.test,DNS:api.test',
  ], { stdio: 'ignore' })
  const username = `hosted_${randomUUID().slice(0, 8)}`
  const user = await createLocalUserForTests(username, PASSWORD)
  await getDb().prepare(`
    INSERT INTO sandbox_settings (user_id, player_count, updated_at) VALUES (?, 3, ?)
    ON CONFLICT (user_id) DO UPDATE SET player_count = 3, updated_at = EXCLUDED.updated_at
  `).run(user.id, Date.now())
  const keys = ['NODE_ENV', 'PUBLIC_APP_ORIGIN', 'PUBLIC_API_BASE', 'CORS_ORIGIN']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const sockets = new Set<Duplex>()
  const errors: string[] = []
  const socketMessages: string[] = []
  let latestRoomState: Record<string, unknown> | undefined
  let gameChunkDelayed = false
  let sandboxResponseCount = 0
  let sandboxBodyHeld = false
  type LifecycleDetail = { requestId?: number; status?: number; failure?: string; name?: string; method?: string; resourceType?: string; route?: string }
  const lifecycle: Array<LifecycleDetail & { at: number; pageId: number; event: string; origin: string; path: string }> = []
  const pageIds = new WeakMap<Page, number>()
  let pageSequence = 0
  const note = (page: Page, event: string, detail: LifecycleDetail & { url?: string } = {}) => {
    const { url = page.url(), ...data } = detail
    const location = new URL(url)
    const pageId = pageIds.get(page) ?? ++pageSequence
    pageIds.set(page, pageId)
    lifecycle.push({ at: Date.now(), pageId, event, origin: location.origin, path: location.pathname, route: location.searchParams.get('page') ?? undefined, ...data })
    if (lifecycle.length > 4096) lifecycle.shift()
  }
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
      if (topology === 'same-site-pages' && req.headers.host === new URL(appOrigin).host) {
        const file = resolve(build.directory, `.${url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)}`)
        if (!file.startsWith(`${build.directory}${sep}`)) { res.writeHead(404); res.end(); return }
        const contentTypes: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }
        res.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream')
        if (engine === 'webkit' && !gameChunkDelayed && basename(file).startsWith('GameContainerApi-')) {
          // A lazy route can still be loading after the opening helper's control-poll deadline.
          gameChunkDelayed = true
          await new Promise(resolve => setTimeout(resolve, 6000))
        }
        res.end(readFileSync(file))
        return
      }
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
      const holdSandboxBody = topology === 'same-site-pages' && req.method === 'GET'
        && url.pathname === '/api/workshop/sandbox' && ++sandboxResponseCount === 2
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
        if (topology === 'same-site-pages' && ['/api/rooms', '/api/lobby/my-rooms'].includes(url.pathname)) {
          res.flushHeaders()
          setTimeout(() => response.pipe(res), 500)
        } else if (holdSandboxBody) {
          res.flushHeaders()
          response.once('data', (chunk: Buffer) => {
            response.pause()
            sandboxBodyHeld = true
            res.write(chunk.subarray(0, 1))
            setTimeout(() => {
              sandboxBodyHeld = false
              if (res.destroyed) return
              res.write(chunk.subarray(1))
              response.pipe(res)
              response.resume()
            }, 2000)
          })
        } else response.pipe(res)
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
  appOrigin = topology === 'same-site-pages' ? 'https://app.agricola.test' : `https://app.test:${address.port}`
  apiOrigin = topology === 'same-site-pages' ? 'https://api.agricola.test' : `https://api.test:${address.port}`
  const appPath = topology === 'same-site-pages' ? '/' : HOSTED_APP_PATH
  process.env.NODE_ENV = 'production'
  process.env.PUBLIC_APP_ORIGIN = `${appOrigin}${appPath}`
  process.env.PUBLIC_API_BASE = apiOrigin
  process.env.CORS_ORIGIN = appOrigin
  const handleFrontend = createFrontendHosting({ ...process.env, FRONTEND_ROOT: build.directory, GAME_BUILD_ID: build.gameBuildId })
  const proxy = createHttpServer((_req, res) => { res.writeHead(502); res.end() })
  proxy.on('connect', (req, socket, head) => {
    const target = new URL(`http://${req.url}`)
    const local = ['app.test', 'api.test', 'app.agricola.test', 'api.agricola.test'].includes(target.hostname)
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
  const openContext = async () => {
    const browserContext = await playwright[engine].launchPersistentContext(join(directory, 'browser-profile'), {
      ...(engine === 'webkit' ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } }),
      ignoreHTTPSErrors: true,
      args: engine === 'webkit' ? ['--enable-itp', '--cookies-policy=no-third-party'] : ['--test-third-party-cookie-phaseout'],
      proxy: { server: `http://127.0.0.1:${proxyAddress.port}` },
    })
    await browserContext.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    return browserContext
  }
  try {
    context = await openContext()
    const lobbyRequests = new WeakMap<Page, Set<Request>>()
    const isLobby = (request: Request) => new URL(request.url()).origin === apiOrigin
      && ['/api/rooms', '/api/lobby/my-rooms'].includes(new URL(request.url()).pathname)
    const observe = (page: Page) => {
      latestRoomState = undefined
      const requests = new Map<Request, number>()
      const pending = new Set<Request>()
      lobbyRequests.set(page, pending)
      let requestSequence = 0
      note(page, 'observed')
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) note(page, 'navigation', { url: frame.url() }) })
      page.on('close', () => note(page, 'close'))
      const onPageError = (error: Error) => { errors.push(error.stack ?? error.message); note(page, 'pageerror', { name: error.name }) }
      page.on('pageerror', onPageError)
      page.on('request', request => {
        if (isLobby(request)) pending.add(request)
        requests.set(request, ++requestSequence)
        note(page, 'request-start', { requestId: requestSequence, url: request.url(), method: request.method(), resourceType: request.resourceType() })
      })
      page.on('response', response => { const requestId = requests.get(response.request()); if (requestId) note(page, 'request-status', { requestId, status: response.status(), url: response.url() }) })
      page.on('requestfinished', request => { const requestId = requests.get(request); if (requestId) note(page, 'request-finish', { requestId, url: request.url() }); requests.delete(request); pending.delete(request) })
      const onRequestFailed = (request: Request) => {
        pending.delete(request)
        const requestId = requests.get(request)
        if (!requestId) return
        note(page, 'request-failure', { requestId, url: request.url(), failure: request.failure()?.errorText.replace(/https?:\/\/[^\s]+/g, '[url]') })
        if (topology === 'same-site-pages' && isLobby(request)) errors.push('Lobby request interrupted')
        requests.delete(request)
      }
      page.on('requestfailed', onRequestFailed)
      page.on('websocket', socket => {
        if (!socket.url().startsWith(apiOrigin.replace('https:', 'wss:') + '/nodes/')) return
        socket.on('framereceived', ({ payload }) => {
          if (typeof payload !== 'string') return
          const message: unknown = JSON.parse(payload)
          if (message && typeof message === 'object' && 'type' in message && typeof message.type === 'string') socketMessages.push(message.type)
          if (message && typeof message === 'object' && 'type' in message && message.type === 'stateUpdate'
            && 'payload' in message && message.payload && typeof message.payload === 'object'
            && 'state' in message.payload && message.payload.state && typeof message.payload.state === 'object') {
            const state = message.payload.state
            latestRoomState = { phase: 'phase' in state ? state.phase : undefined,
              roundPhase: 'roundPhase' in state ? state.roundPhase : undefined,
              currentPlayerIndex: 'currentPlayerIndex' in state ? state.currentPlayerIndex : undefined,
              playerIds: 'players' in state && Array.isArray(state.players)
                ? state.players.map((player: unknown) => player && typeof player === 'object' && 'id' in player ? player.id : null) : undefined,
              forest: 'actionSpaces' in state && Array.isArray(state.actionSpaces)
                ? state.actionSpaces.find((space: unknown) => space && typeof space === 'object' && 'id' in space && space.id === 'forest') : undefined,
              payloadKeys: Object.keys(message.payload),
              interaction: 'interaction' in message.payload ? message.payload.interaction : undefined }
          }
        })
      })
      return () => { note(page, 'observer-retired'); page.off('pageerror', onPageError); page.off('requestfailed', onRequestFailed) }
    }
    const loadLobby = async (page: Page, navigate: () => Promise<unknown>) => {
      const responses = Promise.all(['/api/rooms', '/api/lobby/my-rooms'].map(path => page.waitForResponse(`${apiOrigin}${path}`)))
      const [, loaded] = await Promise.all([navigate(), responses])
      for (const response of loaded) {
        expect(response.status()).toBe(200)
        expect(await response.json()).toMatchObject({ ok: true })
      }
      await expect(page.getByRole('button', { name: 'Create Multiplayer Game', exact: true })).toBeVisible()
      await expect.poll(() => lobbyRequests.get(page)?.size).toBe(0)
    }
    const waitForStartedRoom = async () => {
      await expect.poll(() => latestRoomState?.phase, { timeout: 30_000 }).toBe('playing')
    }
    return {
      appUrl: `${appOrigin}${appPath}`, apiOrigin, build, username, userId: user.id,
      get context() { if (!context) throw new Error('Browser context is not open'); return context },
      get latestRoomState() { return latestRoomState },
      get sandboxBodyHeld() { return sandboxBodyHeld },
      restartBrowser: async () => { await context?.close(); context = await openContext() },
      observe, loadLobby, waitForStartedRoom, errors, socketMessages, lifecycle, note,
      close: async () => {
        for (const page of context?.pages() ?? []) note(page, 'intent-context-close')
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
    if (environment.errors.length) console.error('[hosted-login-lifecycle]', JSON.stringify({ engine: 'webkit', topology: 'legacy-cross-site', events: environment.lifecycle }))
    expect(environment.errors).toEqual([])
    testInfo.annotations.push({ type: 'limitation', description: 'Linux WPE reproduction is not physical Safari/iPhone acceptance' })
  } finally {
    writeFileSync(testInfo.outputPath('session-lifecycle.json'), JSON.stringify(environment.lifecycle, null, 2))
    await environment.close()
  }
})

for (const engine of ['webkit', 'chromium'] satisfies Engine[]) {
  test(`${engine} production frontend retains password session through refresh and routed room recovery`, async ({ playwright }, testInfo) => {
    if (engine === 'webkit') testInfo.annotations.push({ type: 'limitation', description: 'Strict WebKit engine coverage does not replace physical Safari/iPhone acceptance' })
    const environment = await fixture(playwright, engine, 'same-site-pages')
    try {
      let page = await environment.context.newPage()
      const stopObservingPage = environment.observe(page)
      const document = await page.goto(`${environment.appUrl}?page=login&bg=none`, { waitUntil: 'domcontentloaded' })
      if (!document) throw new Error('Production app document was not loaded')
      expect(document.status()).toBe(200)
      expect(await document.body()).toEqual(readFileSync(join(environment.build.directory, 'index.html')))
      expect(new URL(page.url()).origin).toBe(new URL(environment.appUrl).origin)
      expect(new URL(environment.appUrl).origin).not.toBe(environment.apiOrigin)
      await expect(page.locator('#username')).toBeVisible()
      await environment.loadLobby(page, () => submitPassword(page, environment.username))
      expect(await environment.context.cookies(environment.apiOrigin)).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: SESSION_COOKIE, domain: 'api.agricola.test', secure: true, httpOnly: true, sameSite: 'Lax' }),
      ]))
      environment.note(page, 'intent-reload')
      await environment.loadLobby(page, () => page.reload({ waitUntil: 'domcontentloaded' }))
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
      environment.note(page, 'intent-workshop')
      await page.goto(`${environment.appUrl}?page=workshop`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Card Workshop', exact: true })).toBeVisible()
      for (const response of await Promise.all(workshopLoads)) {
        expect(response.status()).toBe(200)
        expect(await response.json()).toMatchObject({ ok: true })
      }
      await expect(page.locator('.ws-section-sandbox').getByText('3 Players', { exact: true })).toBeVisible()
      await expect(page.locator('.ws-loading')).toHaveCount(0)
      environment.note(page, 'intent-workshop-leave')
      await environment.loadLobby(page, () => page.goto(environment.appUrl, { waitUntil: 'domcontentloaded' }))
      const pendingSandbox = page.waitForResponse(response => new URL(response.url()).pathname === '/api/workshop/sandbox')
      await page.goto(`${environment.appUrl}?page=workshop`, { waitUntil: 'domcontentloaded' })
      expect((await pendingSandbox).status()).toBe(200)
      await expect.poll(() => environment.sandboxBodyHeld).toBe(true)
      environment.note(page, 'intent-workshop-early-leave')
      await environment.loadLobby(page, () => page.goto(environment.appUrl, { waitUntil: 'domcontentloaded' }))
      if (engine === 'webkit') {
        await expect.poll(() => environment.lifecycle.some(event =>
          event.event === 'request-failure' && event.path === '/api/workshop/sandbox',
        )).toBe(true)
      }
      await page.getByRole('button', { name: 'Local Hotseat', exact: true }).click()
      await page.getByRole('checkbox', { name: /Snake opening/ }).uncheck()
      await page.getByRole('button', { name: 'Start Hotseat Game', exact: true }).click()
      await environment.waitForStartedRoom()
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
      if (environment.errors.length) console.error('[hosted-login-lifecycle]', JSON.stringify({ engine, topology: 'same-site-pages', events: environment.lifecycle }))
      expect(environment.errors).toEqual([])
      // Closing the document can cancel sampled telemetry in WebKit.
      stopObservingPage()
      environment.note(page, 'intent-page-close')
      await page.close()
      await expect.poll(async () => (await getDb().prepare('SELECT connected_count FROM room_presence WHERE room_id = ?')
        .get<{ connected_count: number }>(roomId))?.connected_count).toBe(0)
      await environment.restartBrowser()
      page = await environment.context.newPage()
      environment.observe(page)
      await page.goto(`${environment.appUrl}?room=${roomId}`, { waitUntil: 'domcontentloaded' })
      await environment.waitForStartedRoom()
      await finishHotseatOpening(page)
      await expect(page.locator('.game-layout')).toBeVisible()
      await expect.poll(() => environment.socketMessages.filter(type => type === 'commandScope').length).toBeGreaterThan(scopes)
      const restored = await getDb().prepare('SELECT state_json, created_by FROM rooms WHERE id = ?')
        .get<{ state_json: string; created_by: string }>(roomId)
      if (!restored) throw new Error('Original room disappeared during recovery')
      expect(restored.created_by).toBe(environment.userId)
      expect(createHash('sha256').update(restored.state_json).digest('hex')).toBe(savedHash)
      page.once('dialog', dialog => dialog.accept())
      await page.getByRole('button', { name: 'Propose ending the game', exact: true }).click()
      await expect.poll(async () => (await getDb().prepare('SELECT lifecycle FROM game_contexts WHERE room_id = ?')
        .get<{ lifecycle: string }>(roomId))?.lifecycle).toBe('terminated')
      await expect(page.getByRole('heading', { name: 'Ended by agreement', exact: true })).toBeVisible()
      await environment.loadLobby(page, () => page.goto(environment.appUrl, { waitUntil: 'domcontentloaded' }))
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
      expect(await page.evaluate(async origin => (await fetch(`${origin}/api/auth/me`, { credentials: 'include' })).status, environment.apiOrigin)).toBe(401)
      await page.goto(`${environment.apiOrigin}/open-agricola/?page=login&bg=none&token=private#onboardingTicket=private`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#username')).toBeVisible()
      expect(page.url()).toBe(`${environment.appUrl}?page=login&bg=none#`)
      if (environment.errors.length) console.error('[hosted-login-lifecycle]', JSON.stringify({ engine, topology: 'same-site-pages', events: environment.lifecycle }))
      expect(environment.errors).toEqual([])
      await testInfo.attach('hosted-session-evidence', {
        body: JSON.stringify({ engine, gameBuildId: environment.build.gameBuildId, productionDocumentBytesMatched: true,
          appOrigin: new URL(environment.appUrl).origin, apiOrigin: environment.apiOrigin,
          passwordAccepted: true, sessionSurvivedReload: true, sessionSurvivedBrowserRestart: true, routedCommandScope: true, retainedRoomStateSha256: savedHash,
          roomRecovered: true, logoutRejectedSession: true, cookieAdaptation: 'real backend token, production cookie serializer at TLS boundary' }),
        contentType: 'application/json',
      })
    } catch (error) {
      const failedPage = environment.context.pages().findLast(page => new URL(page.url()).origin === new URL(environment.appUrl).origin)
      if (failedPage) {
        writeFileSync(testInfo.outputPath('session-failure.json'), JSON.stringify({
          game: environment.latestRoomState,
          visibleText: await failedPage.locator('body').innerText().catch(() => '<unavailable>'),
          forestElements: await failedPage.locator('[data-action-id="forest"]').count(),
          enabledForestButtons: await failedPage.locator('[data-action-id="forest"] button:enabled').count(),
        }, null, 2))
        await failedPage.screenshot({ path: testInfo.outputPath('session-failure.png'), fullPage: true }).catch(() => undefined)
      }
      throw error
    } finally {
      writeFileSync(testInfo.outputPath('session-lifecycle.json'), JSON.stringify(environment.lifecycle, null, 2))
      await environment.close()
    }
  })
}

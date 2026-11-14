import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { parseEnv } from 'node:util'
import { chromium, webkit, expect, request, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION, BROWSER_WS_PROTOCOL } from '../../shared/contract/browser-auth'
import { GAME_CLIENT_CAPABILITIES } from '../../shared/contract/client-capabilities'
import { isSameSite } from '../../server/http-origin'
import { clearOwnReleaseSession, installReleaseLocale, signOutReleaseSession, submitReleaseLogin } from '../../e2e-tests/helpers/release-browser'
import { observeReleasePage, type ReleaseDiagnosticSnapshot, type ReleasePageDiagnostics } from '../../e2e-tests/helpers/release-diagnostics'
import { createFailureRecorder, writeEvidence, type SmokeCredentials } from './smoke'
import { verifyVisibleReleaseAssets } from './render'
import { installLiveSmokeGuard } from './live-smoke-guard'

export type LiveSmokeConfig = {
  format: 1; appUrl: string; apiUrl: string; expectedBuild: string;
  credentialsFile: string; inventoryFile: string; artifactDirectory: string; outputDirectory: string;
}
type Inventory = { observedAt: number; instances: string[]; replays: Array<{ roomId: string; viewerBuildId: string }> }
type BrowserProof = {
  engine: string; login: boolean; logout: boolean; cookie: boolean; lobby: boolean; routedInstances: number;
  ordinaryRoom: boolean; reconnect: boolean; replay: boolean; renderedAssetCount: number;
  readCommandTypes: string[]; blockedRequests: number; cleanupFailures: string[];
  snapshotBeforeReload?: { sequence: number; documentId: number };
  snapshotAfterReload?: { sequence: number; documentId: number };
  retainedRoom?: { idHash: string; stepBefore: number; stepAfter: number };
  mobileWidth?: { content: number; viewport: number };
}
export type LiveSmokeReport = {
  format: 1; expectedBuild: string; appOrigin: string; apiOrigin: string; startedAt: string; passed: boolean; browsers: BrowserProof[];
  gamesCreated: 0; gameplayCommands: 0; failure?: { stage: string; category: string }; completedAt?: string;
}
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid acceptance object')
  return Object.fromEntries(Object.entries(value))
}
const text = (value: unknown): string => { assert.equal(typeof value, 'string'); assert.ok(typeof value === 'string' && value.length > 0); return value }
const list = (value: unknown): unknown[] => { assert.ok(Array.isArray(value)); return value }
const integer = (value: unknown): number => { assert.ok(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0); return value }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const identifier = (value: unknown): string => { const result = text(value); assert.match(result, /^[A-Za-z0-9-]{1,128}$/); return result }
const sha = (value: unknown): string => { const result = text(value); assert.match(result, /^[a-f0-9]{40}$/); return result }

export function parseLiveSmokeConfig(value: unknown): LiveSmokeConfig {
  const input = object(value)
  const keys = ['format', 'appUrl', 'apiUrl', 'expectedBuild', 'credentialsFile', 'inventoryFile', 'artifactDirectory', 'outputDirectory']
  assert.deepEqual(Object.keys(input).sort(), keys.sort(), 'Unexpected acceptance configuration fields')
  assert.equal(input.format, 1)
  const app = new URL(text(input.appUrl)), api = new URL(text(input.apiUrl))
  for (const url of [app, api]) {
    assert.ok(url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    assert.ok(url.protocol === 'https:' || loopback && url.protocol === 'http:', 'Live acceptance requires HTTPS or isolated loopback')
  }
  assert.ok(isSameSite(app, api), 'The frontend and API must be same-site')
  return { format: 1, appUrl: app.href, apiUrl: api.origin, expectedBuild: sha(input.expectedBuild),
    credentialsFile: resolve(text(input.credentialsFile)), inventoryFile: resolve(text(input.inventoryFile)),
    artifactDirectory: resolve(text(input.artifactDirectory)), outputDirectory: resolve(text(input.outputDirectory)) }
}

export function readPrivateAcceptanceFile(path: string, limit = 1024 * 1024): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = fstatSync(fd)
    assert.ok(info.isFile() && info.nlink === 1 && info.uid === process.getuid?.()
      && (info.mode & 0o077) === 0 && info.size > 0 && info.size <= limit, 'Expected a bounded private owner file')
    const bytes = Buffer.alloc(info.size + 1), length = readSync(fd, bytes, 0, bytes.length, 0)
    assert.equal(length, info.size, 'Acceptance file changed while reading')
    assert.equal(fstatSync(fd).size, info.size, 'Acceptance file changed while reading')
    return bytes.toString('utf8', 0, length)
  } finally { closeSync(fd) }
}
function credentials(path: string): SmokeCredentials {
  const env = parseEnv(readPrivateAcceptanceFile(path, 1024 * 1024))
  return { username: text(env.MY_TEST_USER_ID), password: text(env.MY_TEST_PASSWORD) }
}
function inventory(config: LiveSmokeConfig): Inventory {
  const input = object(JSON.parse(readPrivateAcceptanceFile(config.inventoryFile, 16 * 1024 * 1024)))
  const observedAt = Date.parse(text(input.observedAt))
  assert.ok(Number.isFinite(observedAt) && Date.now() - observedAt <= 600_000 && observedAt <= Date.now() + 60_000, 'Collect a fresh inventory within ten minutes')
  const instances = list(input.instances).map(object).filter(row => row.status === 'ready' && row.lease_valid === true && row.generation === config.expectedBuild)
    .map(row => identifier(row.instance_id))
  assert.equal(new Set(instances).size, 2, 'Identify the two ready target-build instances')
  assert.equal(instances.length, 2)
  const completed = new Set(list(input.contexts).map(object).filter(row => row.lifecycle === 'completed' || row.lifecycle === 'terminated').map(row => identifier(row.room_id)))
  const replays = list(input.replays).map(object).filter(row => completed.has(identifier(row.room_id))).map(row => {
    const viewerBuildId = text(row.viewer_build_id); assert.match(viewerBuildId, /^[a-f0-9]{64}$/)
    return { roomId: identifier(row.room_id), viewerBuildId }
  })
  assert.ok(replays.length > 0, 'Use an existing retained Replay')
  return { observedAt, instances, replays }
}
function build(value: unknown, expectedBuild: string) {
  const input = object(value)
  assert.equal(input.format, 1); assert.equal(input.gameBuildId, expectedBuild); assert.equal(input.basePath, '/')
  assert.equal(input.releaseChannel, 'stable'); assert.equal(input.deploymentTarget, 'stable-pages')
  return input
}
async function jsonGet(client: APIRequestContext, url: string, headers?: Record<string, string>): Promise<unknown> {
  const response = await client.get(url, { headers, maxRedirects: 0 })
  assert.equal(response.status(), 200)
  return response.json()
}
export function liveDiagnosticMetadata(snapshot: ReleaseDiagnosticSnapshot) {
  return { dropped: snapshot.dropped, entries: snapshot.entries.map(entry => {
    const base = { kind: entry.kind, sequence: entry.sequence, at: entry.at, pageId: entry.pageId, documentId: entry.documentId }
    switch (entry.kind) {
      case 'frame': return { ...base, socketId: entry.socketId, direction: entry.direction, messageType: entry.messageType, sync: entry.sync, joinIntent: entry.joinIntent }
      case 'socket-open': case 'socket-close': return { ...base, socketId: entry.socketId }
      case 'request-start': return { ...base, requestId: entry.requestId, navigation: entry.navigation, resourceType: entry.resourceType }
      case 'response': return { ...base, requestId: entry.requestId, status: entry.status }
      case 'request-failed': return { ...base, requestId: entry.requestId, category: entry.category }
      case 'page-error': return { ...base, category: entry.category }
      case 'document-navigation': case 'same-document-navigation': return base
    }
  }) }
}
function errorCategory(error: unknown): string {
  return error instanceof Error && ['AssertionError', 'Error', 'TypeError', 'TimeoutError', 'SyntaxError', 'RangeError', 'ReferenceError'].includes(error.name) ? error.name : 'unknown'
}

export async function runLiveReleaseSmoke(config: LiveSmokeConfig, options: { proxy?: { server: string; username?: string; password?: string } } = {}): Promise<LiveSmokeReport> {
  config = parseLiveSmokeConfig(config)
  assert.ok(!existsSync(config.outputDirectory), 'Preserve prior acceptance attempts in a new output directory')
  const retained = inventory(config), account = credentials(config.credentialsFile)
  const expectedArtifact = build(JSON.parse(readFileSync(join(config.artifactDirectory, 'frontend-build.json'), 'utf8')), config.expectedBuild)
  const headers = { Origin: new URL(config.appUrl).origin, [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION) }
  const report: LiveSmokeReport = { format: 1, expectedBuild: config.expectedBuild, appOrigin: new URL(config.appUrl).origin,
    apiOrigin: new URL(config.apiUrl).origin, startedAt: new Date().toISOString(), passed: false, browsers: [], gamesCreated: 0, gameplayCommands: 0 }
  const observers: ReleasePageDiagnostics[] = []
  const recordFailure = createFailureRecorder(config.outputDirectory, () => observers.map(observer => liveDiagnosticMetadata(observer.snapshot())))
  let stage = 'build-metadata'
  const fail = (error: unknown) => {
    report.failure ??= { stage, category: errorCategory(error) }
    return recordFailure(stage, error).error
  }
  writeEvidence(config.outputDirectory, 'result.json', report)
  const bootstrap = await request.newContext({ timeout: 45_000, proxy: options.proxy, extraHTTPHeaders: headers })
  try {
    const onlineBuild = build(await jsonGet(bootstrap, new URL('frontend-build.json', config.appUrl).href), config.expectedBuild)
    assert.deepEqual(onlineBuild, expectedArtifact)
    const policy = object(await jsonGet(bootstrap, `${config.apiUrl}/api/auth/browser-policy`))
    assert.equal(policy.version, BROWSER_AUTH_VERSION); assert.equal(policy.buildId, config.expectedBuild)
    assert.equal(policy.appOrigin, new URL(config.appUrl).origin); assert.equal(policy.apiOrigin, config.apiUrl)
    const index = await bootstrap.get(config.appUrl, { maxRedirects: 0 }); assert.equal(index.status(), 200)
    assert.equal(hash(await index.body()), hash(readFileSync(join(config.artifactDirectory, 'index.html'))))
    const replay = retained.replays[0]!
    const manifest = object(await jsonGet(bootstrap, `${config.apiUrl}/api/v1/replays/${encodeURIComponent(replay.roomId)}/manifest`))
    assert.equal(manifest.ok, true); assert.equal(manifest.viewerBuildId, replay.viewerBuildId)
    const viewer = await bootstrap.get(`${config.apiUrl}/replay-viewers/${replay.viewerBuildId}/manifest.json`, { maxRedirects: 0 })
    assert.equal(viewer.status(), 200); const viewerBytes = await viewer.body(); assert.equal(hash(viewerBytes), replay.viewerBuildId)
    const viewerDescriptor = object(JSON.parse(viewerBytes.toString())), entry = text(viewerDescriptor.entrypoint)
    assert.ok(!entry.startsWith('/') && !entry.split('/').includes('..') && /^[A-Za-z0-9_./-]+$/.test(entry))
    const entryResponse = await bootstrap.get(`${config.apiUrl}/replay-viewers/${replay.viewerBuildId}/${entry}`, { maxRedirects: 0 })
    assert.equal(entryResponse.status(), 200); assert.equal(hash(await entryResponse.body()), object(viewerDescriptor.files)[entry])
    for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]] satisfies Array<[string, typeof chromium]>) {
      stage = `${engine}:launch`
      const browser = await browserType.launch({ headless: true, proxy: options.proxy })
      let context: BrowserContext | undefined
      let activeGuard: Awaited<ReturnType<typeof installLiveSmokeGuard>> | undefined
      const proof: BrowserProof = { engine, login: false, logout: false, cookie: false, lobby: false, routedInstances: 0,
        ordinaryRoom: false, reconnect: false, replay: false, renderedAssetCount: 0, readCommandTypes: [], blockedRequests: 0, cleanupFailures: [] }
      report.browsers.push(proof)
      let primaryFailure: Error | undefined, authenticated = false
      const diagnostics: ReleasePageDiagnostics[] = []
      try {
        context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
        const activeContext = context
        await installReleaseLocale(activeContext)
        const guard = await installLiveSmokeGuard(activeContext, config.apiUrl); activeGuard = guard
        const errors: string[] = [], assetFailures: string[] = [], httpFailures: number[] = [], assetTasks: Promise<void>[] = []
        const participantRoom: { id: string | null } = { id: null }
        let participantJoined = false
        const observe = (page: Parameters<typeof observeReleasePage>[0]) => {
          const observer = observeReleasePage(page, { capacity: 512 }); observers.push(observer); diagnostics.push(observer)
          page.on('pageerror', error => errors.push(errorCategory(error)))
          page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
            let message: unknown
            try { message = JSON.parse(payload.toString()) } catch { return }
            if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'roomJoined'
              && 'roomId' in message && message.roomId === participantRoom.id) participantJoined = true
          }))
          page.on('response', response => {
            const url = new URL(response.url())
            const expectedDenial = url.origin === config.apiUrl && (response.status() === 401 && url.pathname === '/api/auth/me'
              || response.status() === 403 && url.pathname.endsWith('/creation-configuration'))
            if ([config.apiUrl, new URL(config.appUrl).origin].includes(url.origin) && response.status() >= 400 && !expectedDenial) httpFailures.push(response.status())
            if (url.origin === new URL(config.appUrl).origin && /^\/assets\/[^/]+\.(?:js|css)$/.test(url.pathname) && response.status() === 200) {
              const file = resolve(config.artifactDirectory, url.pathname.slice(1))
              assetTasks.push(response.body().then(bytes => {
                assert.ok(file.startsWith(config.artifactDirectory + sep)); assert.equal(hash(bytes), hash(readFileSync(file)))
              }).catch(() => { assetFailures.push('published-asset-mismatch') }))
            }
          })
          return observer
        }
        const page = await activeContext.newPage(); observe(page)
        stage = `${engine}:login`; await page.goto(`${config.appUrl}?page=login`, { waitUntil: 'domcontentloaded' })
        await submitReleaseLogin(page, config.apiUrl, account); authenticated = true; proof.login = true
        await expect(page.locator('.lobby-page')).toBeVisible({ timeout: 30_000 }); proof.lobby = true
        const cookie = (await activeContext.cookies(config.apiUrl)).find(cookie => cookie.name === '__Host-oa-session')
        assert.ok(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.domain === new URL(config.apiUrl).hostname && cookie.path === '/'); proof.cookie = true
        const own = object(await jsonGet(activeContext.request, `${config.apiUrl}/api/lobby/my-rooms`, headers))
        const rooms = list(own.rooms).map(object)
        await expect(page.locator('.my-game')).toHaveCount(rooms.length)
        await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('.lobby-page')).toBeVisible({ timeout: 30_000 })
        stage = `${engine}:routed-websockets`
        for (const instanceId of retained.instances) {
          const ready = await page.evaluate(({ url, protocol, capabilities }) => new Promise<boolean>(resolve => {
            const socket = new WebSocket(url, protocol)
            const timer = setTimeout(() => { socket.close(); resolve(false) }, 20_000)
            socket.onerror = () => { clearTimeout(timer); socket.close(); resolve(false) }
            socket.onopen = () => socket.send(JSON.stringify({ type: 'getCommandScope', clientCapabilities: capabilities }))
            socket.onmessage = event => {
              let message: unknown
              try { message = JSON.parse(String(event.data)) } catch { clearTimeout(timer); socket.close(); resolve(false); return }
              if (typeof message === 'object' && message !== null && 'type' in message) {
                if (message.type === 'commandScope' || message.type === 'error') {
                  clearTimeout(timer); socket.close()
                  resolve(message.type === 'commandScope' && 'scope' in message && typeof message.scope === 'object' && message.scope !== null)
                }
              }
            }
          }), { url: `${config.apiUrl.replace(/^http/, 'ws')}/nodes/${instanceId}/ws`, protocol: BROWSER_WS_PROTOCOL, capabilities: [...GAME_CLIENT_CAPABILITIES] })
          assert.equal(ready, true); proof.routedInstances++
        }
        stage = `${engine}:retained-participant-room`
        const selected = rooms.find(room => {
          const progress = room.progress
          return room.status === 'playing' && room.hotseat === false && typeof progress === 'object' && progress !== null
            && 'phase' in progress && progress.phase === 'playing'
        })
        assert.ok(selected, 'The account needs an existing ordinary participant game')
        const roomId = identifier(selected.id); participantRoom.id = roomId
        const descriptor = object(await jsonGet(activeContext.request, `${config.apiUrl}/api/v1/game-contexts/${roomId}?intent=resume`, headers))
        assert.equal(descriptor.lifecycle, 'active'); assert.equal(descriptor.playerIndex, selected.player_index)
        const beforeStep = integer(descriptor.stepNo), beforeVersion = integer(descriptor.roomVersion)
        await guard.authorizeParticipantRoom(roomId)
        const roomPage = await activeContext.newPage(), roomObserver = observe(roomPage)
        await roomPage.goto(`${config.appUrl}?context=${roomId}`, { waitUntil: 'domcontentloaded' })
        await expect(roomPage.locator('.game-layout')).toBeVisible({ timeout: 30_000 })
        await expect.poll(() => participantJoined, { timeout: 30_000 }).toBe(true)
        await expect.poll(() => roomObserver.checkpoint()?.roomId, { timeout: 30_000 }).toBe(roomId)
        const checkpoint = roomObserver.checkpoint(); assert.ok(checkpoint)
        proof.ordinaryRoom = true; proof.snapshotBeforeReload = { sequence: checkpoint.sequence, documentId: checkpoint.documentId }
        stage = `${engine}:retained-room-reload`
        await roomPage.reload({ waitUntil: 'domcontentloaded' })
        await expect(roomPage.locator('.game-layout')).toBeVisible({ timeout: 30_000 })
        await expect.poll(() => {
          const next = roomObserver.checkpoint()
          return next?.roomId === roomId && next.sequence > checkpoint.sequence && next.documentId > checkpoint.documentId && next.socketId !== checkpoint.socketId
        }, { timeout: 30_000 }).toBe(true)
        const next = roomObserver.checkpoint(); assert.ok(next)
        proof.snapshotAfterReload = { sequence: next.sequence, documentId: next.documentId }; proof.reconnect = true
        const current = object(await jsonGet(activeContext.request, `${config.apiUrl}/api/v1/game-contexts/${roomId}?intent=resume`, headers))
        assert.equal(integer(current.stepNo), beforeStep, 'The observed game advanced concurrently')
        assert.ok(integer(current.roomVersion) >= beforeVersion)
        proof.retainedRoom = { idHash: hash(roomId), stepBefore: beforeStep, stepAfter: integer(current.stepNo) }
        proof.renderedAssetCount += (await verifyVisibleReleaseAssets(roomPage)).length
        await roomPage.close()
        stage = `${engine}:retained-replay`
        await page.goto(`${config.appUrl}?context=${replay.roomId}&perspective=open&layout=board`, { waitUntil: 'domcontentloaded' })
        const replayFrame = page.frameLocator('.replay-shell--viewer iframe')
        await expect(replayFrame.locator('.replay-stage .replay-board, .replay-stage .replay-setup')).toBeVisible({ timeout: 30_000 }); proof.replay = true
        const iframe = await page.locator('.replay-shell--viewer iframe').elementHandle(), renderedFrame = await iframe?.contentFrame(); assert.ok(renderedFrame)
        proof.renderedAssetCount += (await verifyVisibleReleaseAssets(renderedFrame)).length
        stage = `${engine}:workshop`
        await page.goto(`${config.appUrl}?page=workshop`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { name: 'Card Workshop', exact: true })).toBeVisible({ timeout: 30_000 })
        proof.renderedAssetCount += (await verifyVisibleReleaseAssets(page)).length
        await page.setViewportSize({ width: 390, height: 844 })
        proof.mobileWidth = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }))
        assert.ok(proof.mobileWidth.content <= proof.mobileWidth.viewport)
        stage = `${engine}:assets-and-errors`
        await Promise.all(assetTasks); assert.ok(proof.renderedAssetCount > 0); assert.deepEqual(assetFailures, []); assert.deepEqual(errors, []); assert.deepEqual(httpFailures, [])
        const guardProof = guard.snapshot(); proof.readCommandTypes = guardProof.readCommandTypes; proof.blockedRequests = guardProof.blocked.length
        assert.equal(proof.blockedRequests, 0)
        stage = `${engine}:logout`; await signOutReleaseSession(page, config.appUrl, config.apiUrl)
        authenticated = false; proof.logout = true
      } catch (error) { primaryFailure = fail(error) }
      finally {
        const cleanupErrors: unknown[] = []
        if (activeGuard) {
          const observedGuard = activeGuard.snapshot()
          proof.readCommandTypes = observedGuard.readCommandTypes; proof.blockedRequests = observedGuard.blocked.length
        }
        const finalDiagnostics = diagnostics.map(observer => liveDiagnosticMetadata(observer.snapshot()))
        if (context) {
          const activeContext = context
          const ownsCookie = (await activeContext.cookies(config.apiUrl).catch(() => [])).some(cookie => cookie.name === '__Host-oa-session')
          if (authenticated || ownsCookie) {
            try {
              await clearOwnReleaseSession(activeContext.request, config.apiUrl, headers)
            } catch (error) { proof.cleanupFailures.push('own-session-logout'); cleanupErrors.push(error) }
          }
          for (const observer of diagnostics) observer.dispose()
          try { await activeContext.close() } catch (error) { proof.cleanupFailures.push('browser-context'); cleanupErrors.push(error) }
        }
        try { await browser.close() } catch (error) { proof.cleanupFailures.push('browser'); cleanupErrors.push(error) }
        for (const error of cleanupErrors) { const failure = fail(error); primaryFailure ??= failure }
        writeEvidence(config.outputDirectory, `${engine}-diagnostics.json`, finalDiagnostics)
        writeEvidence(config.outputDirectory, 'result.json', report)
      }
      if (primaryFailure) throw primaryFailure
    }
    assert.ok(report.browsers.every(browser => browser.cleanupFailures.length === 0))
    report.passed = true; report.completedAt = new Date().toISOString(); writeEvidence(config.outputDirectory, 'result.json', report)
    return report
  } catch (error) {
    const primary = fail(error); writeEvidence(config.outputDirectory, 'result.json', report); throw primary
  } finally { await bootstrap.dispose() }
}

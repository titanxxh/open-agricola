// @covers client/app/replay-bridge.ts
// @covers replay-viewer/src/bridge-transport.ts
import { seedPrivateReplay } from './_helpers/prerelease-replay'
// @covers client/app/PrereleaseBoundary.tsx
// @covers client/services/prerelease-runtime.ts
// @covers client/contexts/AuthContext.tsx
// @covers client/app/PageRouter.tsx
// @covers server/prerelease-routes.ts
// @covers server/prerelease-sessions.ts
import { expect, type BrowserContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'
import { execFileSync, spawn } from 'node:child_process'
import { createServer as tlsServer } from 'node:https'
import { createServer, request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Duplex } from 'node:stream'
import { createLocalUserForTests, createSession, validateSession } from '../server/auth'
import { authCookieNames } from '../server/auth-cookies'
import { createPrereleaseAuthorityHandler } from '../server/prerelease-authority-routes'
import { requestSessionToken } from '../server/request-auth'
import { getDb } from '../server/db'
import { releaseAll, releaseQueue } from '../server/__tests__/_helpers/release-all'
import { databaseMaintenance, getTestDatabaseUrl } from '../server/__tests__/_helpers/postgres'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION } from '../shared/contract/browser-auth'
import { createPrereleaseGateway } from '../scripts/prerelease/gateway'
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { test } from './server-fixtures'
import type { ServerEvent } from '../shared/contract/protocol/ws'

const buildId = 'a'.repeat(40)
const reservedPorts = new Set<number>()
async function port(): Promise<number> {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing loopback port')
  await new Promise<void>(done => server.close(() => done()))
  if (reservedPorts.has(address.port)) return port()
  reservedPorts.add(address.port); return address.port
}
const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const envText = (env: Record<string, string>) => Object.entries(env).map(([key, value]) => `${key}=${shell(value)}\n`).join('')
async function command(program: string, args: string[], env: NodeJS.ProcessEnv, log: string): Promise<void> {
  const child = spawn(program, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  const deadline = setTimeout(() => child.kill('SIGTERM'), 120_000)
  let output = ''; child.stdout.on('data', data => { output += String(data) }); child.stderr.on('data', data => { output += String(data) })
  const [code] = await once(child, 'exit'); clearTimeout(deadline); writeFileSync(log, output, { mode: 0o600 })
  if (code !== 0) throw new Error(`Prerelease rehearsal command failed; private log retained at ${log}`)
}

function observeRoomSocket(page: Page) {
  const created: Array<{ roomId: string; playerIndex: number }> = []
  const joined: typeof created = []
  page.on('websocket', socket => socket.on('framereceived', frame => {
    let value: unknown
    try { value = JSON.parse(String(frame.payload)) } catch { return }
    if (!value || typeof value !== 'object' || !('type' in value)) return
    if ((value.type === 'roomCreated' || value.type === 'roomJoined')
      && 'roomId' in value && typeof value.roomId === 'string'
      && 'playerIndex' in value && typeof value.playerIndex === 'number'
      && Number.isInteger(value.playerIndex) && value.playerIndex >= 0) {
      const seats = value.type === 'roomCreated' ? created : joined
      seats.push({ roomId: value.roomId, playerIndex: value.playerIndex })
    }
  }))
  return { created, joined }
}

/** Actual pre application and sessions; the formal fixture uses the real authority protocol. */
async function fixture(playwright: PlaywrightWorkerArgs['playwright'], withPublicSandbox = false) {
  expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
  const acquired = releaseQueue()
  let closeAfterSetup: (() => Promise<void>) | undefined
  try {
    const directory = mkdtempSync(join(tmpdir(), 'oa-pre-session-')), schema = `test_${randomUUID().replaceAll('-', '')}`
    acquired.register(() => { rmSync(join(directory, 'pre.env'), { force: true }); rmSync(join(directory, 'key.pem'), { force: true }) })
    const generationId = randomUUID(), targetId = 'prerelease-main', serviceKey = randomUUID() + randomUUID()
    const backendPort = await port(), frontendPort = await port(), appPort = await port(), gatewayPort = await port()
    let gateway: ReturnType<typeof createPrereleaseGateway> | undefined = undefined
    const dependencyKeys = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']
    const dependencies = Object.fromEntries(dependencyKeys.map(key => { const value = process.env[key]; if (!value) throw new Error(`Missing isolated ${key}`); return [key, value] }))
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'),
      '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' })
    const admin = databaseMaintenance(), databaseUrl = getTestDatabaseUrl()
    acquired.register(() => admin.close())
    await admin.exec(`CREATE SCHEMA "${schema}"`)
    acquired.register(() => admin.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`))
    const additionalUsers: string[] = []
    const source = getDb(), username = `pre_${randomUUID().slice(0, 8)}`
    const user = await createLocalUserForTests(username, 'pre-session-password-926')
    const cleanSourceUser = async () => {
      for (const id of [user.id, ...additionalUsers]) {
        await source.prepare('DELETE FROM sessions WHERE user_id=?').run(id)
        await source.prepare('DELETE FROM users WHERE id=?').run(id)
      }
    }
    acquired.register(cleanSourceUser)
    await source.prepare('INSERT INTO beta_access(user_id,granted_at) VALUES(?,?)').run(user.id, Date.now())
    const sourceToken = await createSession(user.id)
    if (!sourceToken) throw new Error('Could not create the formal fixture session')
    let publicFixture: { cardId: string; versionId: string; ruleId: string; name: string } | undefined
    let publicSourceOnline = true
    const publicRequests: Array<{ path: string; cookie: string | undefined; authorization: string | undefined; origin: string | undefined }> = []
    const cleanPublicFixture = async () => {
      if (!publicFixture) return
      await source.prepare('DELETE FROM object_references WHERE owner_id=? OR owner_id=?').run(publicFixture.cardId, publicFixture.versionId)
      await source.prepare('DELETE FROM workshop_cards WHERE id=?').run(publicFixture.cardId)
      const { getResources } = await import('../server/storage/runtime')
      await getResources().removeUnreferenced([`card-art/${publicFixture.ruleId}.png`])
    }
    if (withPublicSandbox) {
      const { prepareWorkshopDraft } = await import('../server/workshop-draft-validation')
      const { createCard, approveCurrentDraft, publish } = await import('../server/workshop-drafts')
      const { getResources } = await import('../server/storage/runtime')
      const ruleId = `CUSTOM_PublicBrowser_${randomUUID().replaceAll('-', '')}`, name = 'Published browser fixture'
      const effectCode = `const CARD_ID='${ruleId}';const CARD_DEF=MinorImprovement({id:CARD_ID,name:'${name}',desc:['Gain 2 food.'],cost:{},vp:0});const CARD_IMPL={effect:{id:CARD_ID,onBuy:()=>gainLeaf(CARD_ID,{food:2})}}`
      const prepared = await prepareWorkshopDraft({ cardId: ruleId, cardType: 'minor', name, description: 'Gain two food', effectCode,
        cardJson: { id: ruleId, name, deck: 'CUSTOM', number: 0, card_type: 'minor', implemented: true, desc: ['Gain 2 food.'], cost: {}, vp: 0 }, artUrl: `/card-art/${ruleId}.png` })
      if (!prepared.ok) throw new Error(prepared.error)
      await getResources().stage(`card-art/${ruleId}.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jErkAAAAASUVORK5CYII=', 'base64'), 'image/png')
      const card = await createCard(source, { authorId: user.id, draft: prepared.draft })
      const version = await approveCurrentDraft(source, { cardId: card.id, authorId: user.id })
      await publish(source, { cardId: card.id, authorId: user.id, baseRevision: card.revision })
      publicFixture = { cardId: card.id, versionId: version.versionId, ruleId, name }
      acquired.register(cleanPublicFixture)
    }
    const envKeys = ['NODE_ENV', 'PUBLIC_APP_ORIGIN', 'PUBLIC_API_BASE', 'CORS_ORIGIN', 'PRERELEASE_APP_ORIGIN', 'PRERELEASE_IDENTITY_SERVICE_KEY', 'PRERELEASE_ENTRY_ENABLED', 'GAME_BUILD_ID']
    const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
    const sockets = new Set<Duplex>(), requests = new Set<ClientRequest>()
    const track = (socket: Duplex) => { if (sockets.has(socket)) return; sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => socket.destroy()) }
    const trackRequest = (request: ClientRequest) => { requests.add(request); request.once('close', () => requests.delete(request)); request.once('socket', track); return request }
    let formalOrigin = '', preOrigin = '', authority = createPrereleaseAuthorityHandler({ db: source, getSourceToken: async req => requestSessionToken(req) })
    const proxy = tlsServer({ key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')) }, (req, res) => {
      const host = new URL(`https://${req.headers.host}`).hostname
      if (host === 'localhost') {
        const upstream = trackRequest(httpRequest({ hostname: '127.0.0.1', port: gatewayPort, path: req.url, method: req.method, headers: req.headers }, response => {
          res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res)
        }))
        upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
        req.once('aborted', () => upstream.destroy()); res.once('close', () => { if (!res.writableEnded) upstream.destroy() }); req.pipe(upstream); return
      }
      if ((req.url ?? '').startsWith('/api/workshop/public-cards/')) {
        publicRequests.push({ path: req.url ?? '', cookie: req.headers.cookie, authorization: req.headers.authorization, origin: req.headers.origin })
        if (!publicSourceOnline) { res.writeHead(503).end(); return }
        if (req.url === '/api/workshop/public-cards/v1/cards' && publicFixture) {
          // The catalog transport follows the separately delivered formal v1 contract.
          // Immutable snapshots/status below use the native PG/S3 source handler.
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify({ ok: true, protocolVersion: 1, cards: [{ source: { kind: 'workshop-public', authority: 'titanxxh/open-agricola', workshopCardId: publicFixture.cardId, versionId: publicFixture.versionId },
            cardId: publicFixture.ruleId, name: publicFixture.name, cardType: 'minor' }], nextCursor: null })); return
        }
        void import('../server/workshop-public-cards').then(({ handleWorkshopPublicCards }) => handleWorkshopPublicCards(req, res, source))
          .then(handled => { if (!handled) res.writeHead(404).end() }).catch(() => res.writeHead(500).end()); return
      }
      if ((req.url ?? '').startsWith('/api/prerelease/')) {
        void authority(req, res).then(handled => { if (!handled) res.writeHead(404).end() }).catch(() => res.writeHead(500).end()); return
      }
      if (req.url === '/api/auth/browser-policy') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ version: BROWSER_AUTH_VERSION, buildId, appOrigin: formalOrigin, apiOrigin: formalOrigin })); return
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('<!doctype html><title>Formal identity fixture</title><h1>Formal identity fixture</h1>')
    })
    proxy.on('connection', track)
    proxy.on('upgrade', (req, socket, head) => {
      track(socket)
      const path = new URL(req.url ?? '/', preOrigin).pathname
      if (req.headers.host !== new URL(preOrigin).host || !/^\/nodes\/[A-Za-z0-9-]+\/ws$/.test(path)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
      }
      const upstream = trackRequest(httpRequest({ hostname: '127.0.0.1', port: gatewayPort, path: req.url, headers: req.headers }))
      const writeHead = (response: IncomingMessage) => {
        const headers = response.rawHeaders.reduce((text, value, index, values) => index % 2 ? text : `${text}${value}: ${values[index + 1]}\r\n`, '')
        socket.write(`HTTP/${response.httpVersion} ${response.statusCode ?? 502} ${response.statusMessage ?? ''}\r\n${headers}\r\n`)
      }
      upstream.on('upgrade', (response, transport, upstreamHead) => {
        track(transport); writeHead(response)
        if (head.length) transport.write(head)
        if (upstreamHead.length) socket.write(upstreamHead)
        socket.once('close', () => transport.destroy()); transport.once('close', () => socket.destroy())
        socket.pipe(transport).pipe(socket)
      })
      upstream.on('response', response => { response.on('aborted', () => socket.destroy()); response.on('error', () => socket.destroy()); writeHead(response); response.pipe(socket) })
      upstream.on('error', () => socket.destroy()); socket.once('close', () => upstream.destroy()); upstream.end()
    })
    acquired.register(async () => { for (const request of requests) request.destroy(); for (const socket of sockets) socket.destroy(); if (proxy.listening) await new Promise<void>(done => proxy.close(() => done())) })
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening')
    const address = proxy.address(); if (!address || typeof address === 'string') throw new Error('Missing TLS fixture port')
    formalOrigin = `https://127.0.0.1:${address.port}`; preOrigin = `https://localhost:${address.port}`
    acquired.register(() => { for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] } })
    Object.assign(process.env, { NODE_ENV: 'production', PUBLIC_APP_ORIGIN: formalOrigin, PUBLIC_API_BASE: formalOrigin, CORS_ORIGIN: formalOrigin,
      PRERELEASE_APP_ORIGIN: preOrigin, PRERELEASE_IDENTITY_SERVICE_KEY: serviceKey, PRERELEASE_ENTRY_ENABLED: 'true', GAME_BUILD_ID: buildId })
    authority = createPrereleaseAuthorityHandler({ db: source, getSourceToken: async req => requestSessionToken(req) })
    const eraseGeneration = async () => {
        await source.prepare('DELETE FROM prerelease_identity_events WHERE generation_id=?').run(generationId)
        await source.prepare('DELETE FROM prerelease_identity_handoffs WHERE generation_id=?').run(generationId)
        await source.prepare('DELETE FROM prerelease_identity_grants WHERE generation_id=?').run(generationId)
        await source.prepare('UPDATE prerelease_identity_generations SET admission_open=false,audit_operation_id=NULL WHERE id=?').run(generationId)
        await source.prepare('DELETE FROM prerelease_identity_owner_operations WHERE generation_id=?').run(generationId)
        await source.prepare('DELETE FROM prerelease_identity_generations WHERE id=?').run(generationId)
    }
    await source.prepare('INSERT INTO prerelease_identity_generations(id,target_origin,target_id,prepared_at) VALUES(?,?,?,?)').run(generationId, preOrigin, targetId, Date.now())
    acquired.register(eraseGeneration)
    const operationId = randomUUID()
    await source.prepare(`INSERT INTO prerelease_identity_owner_operations(operation_id,generation_id,action,request_hash,completed_at,identity_manifest_sha256,identity_count,verification_receipt_sha256)
      VALUES(?,?,'audit-complete','fixture',?,?,0,?)`).run(operationId, generationId, Date.now(), 'a'.repeat(64), 'b'.repeat(64))
    await source.prepare('UPDATE prerelease_identity_generations SET admission_open=true,audit_operation_id=? WHERE id=?').run(operationId, generationId)
    const root = resolve('output/prerelease-session-frontend'), prefix = `${process.env.S3_PREFIX ?? ''}pre-session-${randomUUID()}/`
    const envFile = join(directory, 'pre.env'), owned = join(directory, 'owned.json')
    const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', RELEASE_CHANNEL: 'prerelease', GAME_BUILD_ID: buildId, VITE_BASE_PATH: '/open-agricola/', VITE_API_BASE: '', VITE_WS_BASE: '' }
    delete childEnv.PRERELEASE_IDENTITY_SERVICE_KEY
    writeFileSync(envFile, envText({ ...dependencies, DATABASE_URL: databaseUrl, DATABASE_SCHEMA: schema, S3_PREFIX: prefix, RELEASE_CHANNEL: 'prerelease', GAME_BUILD_ID: buildId,
      PUBLIC_APP_ORIGIN: preOrigin, PUBLIC_API_BASE: preOrigin, CORS_ORIGIN: preOrigin, FORMAL_APP_ORIGIN: formalOrigin, FORMAL_API_BASE: formalOrigin,
      PRERELEASE_DATA_GENERATION: generationId, PRERELEASE_TARGET_ID: targetId, PRERELEASE_IDENTITY_SERVICE_KEY: serviceKey, FRONTEND_ROOT: root,
      NODE_EXTRA_CA_CERTS: join(directory, 'cert.pem'), SHARED_DATA_DIR: join(directory, 'data'), REPLAY_VIEWER_ROOT: join(directory, 'data/replay-viewers'),
      BACKEND_LOG: join(directory, 'backend.log'), FRONTEND_LOG: join(directory, 'frontend.log'), OWNED_PROCESSES_FILE: owned, BACKEND_PORT: String(backendPort),
      FRONTEND_PORT: String(frontendPort), APP_BASE_PORT: String(appPort), OBSERVABILITY_ENABLED: 'false' }), { mode: 0o600 })
    const launchEnv: NodeJS.ProcessEnv = { ...process.env, LOCAL_ENV_FILE: envFile }
    delete launchEnv.REPLAY_VIEWER_BUILD_ID
    const close = () => releaseAll([
      async () => { await gateway?.close() },
      async () => { if (existsSync(owned)) await command('bash', ['./restart-local.sh', '--kill-only'], launchEnv, join(directory, 'stop.log')) },
      async () => {
        for (const request of requests) request.destroy()
        for (const socket of sockets) socket.destroy()
        await new Promise<void>(done => proxy.close(() => done()))
      },
      async () => { try { await admin.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`) } finally { await admin.close() } },
      async () => {
        const s3 = new S3Client({ endpoint: dependencies.S3_ENDPOINT, region: dependencies.S3_REGION, forcePathStyle: true,
          credentials: { accessKeyId: dependencies.S3_ACCESS_KEY_ID, secretAccessKey: dependencies.S3_SECRET_ACCESS_KEY } })
        try {
          let continuation: string | undefined
          do {
            const listing = await s3.send(new ListObjectsV2Command({ Bucket: dependencies.S3_BUCKET, Prefix: prefix, ContinuationToken: continuation }))
            const objects = listing.Contents?.flatMap(row => row.Key ? [{ Key: row.Key }] : []) ?? []
            if (objects.length) await s3.send(new DeleteObjectsCommand({ Bucket: dependencies.S3_BUCKET, Delete: { Objects: objects } }))
            continuation = listing.NextContinuationToken
          } while (continuation)
        } finally { s3.destroy() }
      },
      async () => {
        await eraseGeneration()
        await cleanPublicFixture()
        await cleanSourceUser()
      },
      () => {
        for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] }
        rmSync(root, { recursive: true, force: true }); rmSync(envFile, { force: true }); rmSync(join(directory, 'key.pem'), { force: true })
      },
    ])
    closeAfterSetup = close
    await command('pnpm', ['exec', 'vite', 'build', '--outDir', root], childEnv, join(directory, 'build.log'))
    writeFileSync(join(root, 'frontend-build.json'), JSON.stringify({ format: 1, gameBuildId: buildId, basePath: '/open-agricola/', releaseChannel: 'prerelease', deploymentTarget: 'prerelease-hosted' }) + '\n')
    await command('bash', ['./restart-local.sh'], launchEnv, join(directory, 'launcher.log'))
    const healthyCycle = randomUUID(), observedAt = Date.now(), stateFile = join(directory, 'gate.json')
    writeFileSync(join(directory, 'storage-guard.json'), JSON.stringify({ format: 1, targetId, fingerprint: 'f'.repeat(64),
      status: 'healthy', healthyCycle, observedAt, validUntil: observedAt + 120_000, operationsAllowed: true }))
    writeFileSync(stateFile, JSON.stringify({ format: 1, targetId, channel: 'prerelease', mode: 'open', buildId,
      generation: generationId, acceptance: { healthyCycle, formalBuildId: buildId } }))
    gateway = createPrereleaseGateway({ stateFile, targetId, origin: preOrigin, upstream: `http://127.0.0.1:${backendPort}`,
      formal: { appOrigin: formalOrigin, apiOrigin: formalOrigin }, ca: readFileSync(join(directory, 'cert.pem')) })
    await new Promise<void>(resolve => gateway!.server.listen(gatewayPort, '127.0.0.1', resolve))
    await gateway.refreshBrowserPolicy()
    const enter = async (context: BrowserContext, principal = user) => {
      const page = await context.newPage()
      await page.goto(`${preOrigin}/open-agricola/auth/start`)
      await expect(page.getByRole('heading', { name: 'Formal identity fixture' })).toBeVisible()
      const fragment = new URL(page.url()).hash
      const input = Object.fromEntries(new URLSearchParams(fragment.slice(1)))
      const issued = await page.evaluate(async ({ formal, input, header, version }) => {
        const response = await fetch(`${formal}/api/prerelease/handoffs`, { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', [header]: String(version) },
          body: JSON.stringify({ protocolVersion: 1, channel: 'prerelease', targetOrigin: input.targetOrigin, browserChallenge: input.browserChallenge, returnTo: input.returnTo }) })
        if (!response.ok) throw new Error('Formal authority refused browser handoff')
        return response.json()
      }, { formal: formalOrigin, input, header: BROWSER_AUTH_HEADER, version: BROWSER_AUTH_VERSION })
      const callback = new URL(issued.callbackUrl)
      callback.hash = new URLSearchParams({ protocolVersion: '1', code: issued.code, state: input.state!, browserChallenge: input.browserChallenge!, returnTo: issued.returnTo }).toString()
      await page.goto(callback.href)
      await expect(page.locator('.prerelease-banner')).toContainText('Prerelease aaaaaaaaaaaa')
      await expect(page.getByRole('heading', { name: 'Formal identity fixture' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible()
      await expect(page.locator('.lobby-user-pill')).toHaveText(principal.displayName)
      return page
    }
    const browser = await playwright.chromium.launch()
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' })
    await context.addInitScript(() => { if (window.top === window) localStorage.setItem('open-agricola-locale-v2', 'en') })
    const formalCookieName = authCookieNames().session
    await context.addCookies([{ name: formalCookieName, value: sourceToken, url: formalOrigin, httpOnly: true, secure: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600 }])
    const assertPrincipal = async (page: Page) => {
      const result: unknown = await page.evaluate(async ({ build, generation, header, version }) => {
        const response = await fetch('/api/auth/me', { credentials: 'include', headers: {
          [header]: String(version), 'x-oa-pre-build': build, 'x-oa-pre-generation': generation,
        } })
        return response.json()
      }, { build: buildId, generation: generationId, header: BROWSER_AUTH_HEADER, version: BROWSER_AUTH_VERSION })
      expect(result).toMatchObject({ ok: true, user: { id: user.id, username: user.username, displayName: user.displayName } })
    }
    const assertFormalSession = async () => { expect(await validateSession(sourceToken)).toMatchObject({ id: user.id, username: user.username }) }
    const createParticipant = async () => {
      const participant = await createLocalUserForTests(`team_${randomUUID().slice(0, 8)}`, 'team-session-password-926')
      additionalUsers.push(participant.id)
      await source.prepare('INSERT INTO beta_access(user_id,granted_at) VALUES(?,?)').run(participant.id, Date.now())
      const token = await createSession(participant.id)
      const other = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' })
      await other.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
      await other.addCookies([{ name: formalCookieName, value: token, url: formalOrigin, httpOnly: true, secure: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600 }])
      return { context, browser, close, enter, createParticipant, retainedRoom, assertPrincipal, assertFormalSession, formalOrigin, formalCookieName, preOrigin, user, source, generationId,
      seedReplay: (evidence = false) => seedPrivateReplay({ databaseUrl, schema, prefix, dependencies, userId: user.id, evidence }),
      publicFixture, publicRequests, setPublicSourceOnline: (value: boolean) => { publicSourceOnline = value } }
  } catch (error) {
    try { if (closeAfterSetup) await closeAfterSetup(); else await acquired.release() }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Prerelease fixture setup and cleanup failed', { cause: cleanupError }) }
    throw error
  }
}

test('real prerelease HTTP and room WebSocket restore the same principal after reload and browser restart', async ({ playwright }) => {
  test.setTimeout(300_000)
  const environment = await fixture(playwright)
  let failure: { error: unknown } | undefined
  try {
    const page = await environment.enter(environment.context)
    const wire = observeRoomSocket(page)
    await page.getByRole('button', { name: 'Create Multiplayer Game', exact: true }).click()
    await page.getByRole('button', { name: 'Create Game', exact: true }).click()
    await expect.poll(() => wire.created.length).toBeGreaterThan(0)
    await environment.assertPrincipal(page)
    const originalSeat = wire.created[0]!
    const roomId = originalSeat.roomId
    await expect(page).toHaveURL(new RegExp(`room=${roomId}`))
    const roomUrl = page.url()
    const cookie = (await environment.context.cookies(environment.preOrigin)).find(row => row.name === '__Host-oa-pre-session')
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, path: '/', sameSite: 'Lax' })
    expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000)
    expect(await page.evaluate(() => document.cookie)).not.toContain('__Host-oa-pre-session')
    const joinedBeforeReload = wire.joined.length
    await page.reload()
    await expect.poll(() => wire.joined.length).toBeGreaterThan(joinedBeforeReload)
    await expect.poll(() => wire.joined.slice(joinedBeforeReload)).toContainEqual(originalSeat)
    await environment.assertPrincipal(page)
    const state = await environment.context.storageState()
    await environment.context.close(); await environment.browser.close()
    const reopened = await playwright.chromium.launch(), restored = await reopened.newContext({ ignoreHTTPSErrors: true, storageState: state })
    try {
      const resumed = await restored.newPage(), restoredWire = observeRoomSocket(resumed)
      await resumed.goto(roomUrl)
      await expect.poll(() => restoredWire.joined).toContainEqual(originalSeat)
      await environment.assertPrincipal(resumed)
      const settings = await restored.newPage()
      await settings.goto(`${environment.preOrigin}/open-agricola/?page=settings`)
      await expect(settings.locator('input[type=password]')).toHaveCount(0)
      await expect(settings.locator('.prerelease-access-screen')).toContainText('Return to production')
      await environment.assertFormalSession()
      expect((await restored.cookies(environment.formalOrigin)).some(row => row.name === environment.formalCookieName)).toBe(true)
      const signOut = await restored.newPage()
      await signOut.goto(`${environment.preOrigin}/open-agricola/`)
      await expect(signOut.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible()
      const signedOut = signOut.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/logout' && response.request().method() === 'POST')
      await signOut.getByRole('button', { name: 'Sign Out', exact: true }).click()
      expect((await signedOut).status()).toBe(200)
      await expect(signOut.locator('.prerelease-access-screen')).toContainText('Return to production')
      await expect(signOut.locator('input[type=password]')).toHaveCount(0)
      await expect(signOut.locator('a[href*="/api/auth/oauth/"]')).toHaveCount(0)
      expect((await restored.cookies(environment.preOrigin)).some(row => row.name === '__Host-oa-pre-session')).toBe(false)
      expect((await restored.cookies(environment.formalOrigin)).some(row => row.name === environment.formalCookieName)).toBe(true)
      await environment.assertFormalSession()
      const reentered = await environment.enter(restored), reenteredWire = observeRoomSocket(reentered)
      await reentered.goto(roomUrl)
      await expect.poll(() => reenteredWire.joined).toContainEqual(originalSeat)
      await environment.assertPrincipal(reentered)
      await environment.source.prepare('DELETE FROM beta_access WHERE user_id=?').run(environment.user.id)
      await expect(reentered.getByText('Your login or Beta access is no longer valid. Return to production to sign in and enter again.')).toBeVisible({ timeout: 35_000 })
      await expect(reentered.getByRole('link', { name: 'Return to production', exact: true })).toBeVisible()
    } finally { await restored.close(); await reopened.close() }
  } catch (error) { failure = { error } }
  try {
    await releaseAll([
      () => environment.context.close(),
      () => environment.browser.close(),
      () => environment.close(),
    ])
  } catch (error) {
    if (failure) throw new AggregateError([failure.error, error], 'Prerelease browser test and cleanup failed', { cause: error })
    throw error
  }
  if (failure) throw failure.error
})


test('private replay uses an authenticated parent bridge and clears idle display on source revocation', async ({playwright}, testInfo) => {
  test.setTimeout(300_000)
  const environment = await fixture(playwright)
  try {
    const page = await environment.enter(environment.context)
    const replay = await environment.seedReplay()
    const debug: unknown[] = []
    page.on('console', message => { if(message.type() === 'error') debug.push({kind:'console',text:message.text()}) })
    page.on('pageerror', error => debug.push({kind:'pageerror',text:error.message}))
    page.on('response', response => { if(response.url().includes('/replay-viewers/')) debug.push({kind:'response',url:response.url(),status:response.status()}) })
    const iframeRequests: Array<{url:string;cookie:string|undefined}> = []
    page.on('request', request => {
      if (request.frame() !== page.mainFrame()) iframeRequests.push({url:request.url(),cookie:request.headers().cookie})
    })
    await page.addInitScript(() => {
      const revoked: string[] = []
      Object.defineProperty(window,'__revokedReplayBlobs',{value:revoked})
      const original = URL.revokeObjectURL
      URL.revokeObjectURL = url => { revoked.push(url); original(url) }
    })
    await page.goto(`${environment.preOrigin}/open-agricola/?room=${replay.roomId}&perspective=p1`)
    const frame = page.frameLocator('iframe')
    try { await expect(frame.locator('.replay-app')).toBeVisible() } catch(error) {
      debug.push(await page.locator('iframe').getAttribute('src').catch(()=>null))
      for(const child of page.frames()) debug.push({url:child.url(),text:await child.locator('body').innerText().catch(()=>'(unavailable)')})
      writeFileSync(testInfo.outputPath('replay-bridge-debug.json'),JSON.stringify(debug,null,2))
      throw error
    }
    await expect(page.locator('iframe')).toHaveAttribute('sandbox','allow-scripts')
    await expect(page.locator('iframe')).toHaveAttribute('credentialless','')
    await expect(frame.locator('[data-card-anchor="CUSTOM_PRIVATE_REPLAY"]')).toBeVisible()
    await expect.poll(async () => frame.locator('[data-card-anchor="CUSTOM_PRIVATE_REPLAY"] .card-icon').first().evaluate(element => getComputedStyle(element).backgroundImage)).toContain('blob:')
    expect(iframeRequests.filter(request => /\/api\/v1\/|\/replay-assets\//.test(request.url))).toEqual([])
    expect(iframeRequests.some(request => request.cookie?.includes('__Host-oa-pre-session'))).toBe(false)
    await frame.locator('.replay-transport button').nth(2).click()
    await expect(frame.locator('.replay-transport output')).toContainText('1 / 1')
    await frame.locator('.replay-header select').selectOption('open')
    const direct = await page.evaluate(async ({room,hash}) => {
      const response = await fetch(`/api/v1/replays/${room}/assets/${hash}`,{headers:{range:'bytes=0-1','if-none-match':'*'}})
      return {status:response.status,cache:response.headers.get('cache-control')}
    },{room:replay.roomId,hash:replay.assetHash})
    expect(direct).toEqual({status:426,cache:'no-store'})
    await page.evaluate(() => {
      const original = MessagePort.prototype.postMessage
      MessagePort.prototype.postMessage = function(data: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        if (data && typeof data === 'object' && 'type' in data && data.type === 'lease') return
        Reflect.apply(original,this,options === undefined ? [data] : [data,options])
      }
    })
    await expect(frame.locator('.replay-app')).toHaveCount(0,{timeout:5_000})
    await expect.poll(() => frame.locator('html').evaluate(() => '__revokedReplayBlobs' in window && Array.isArray(window.__revokedReplayBlobs) ? window.__revokedReplayBlobs.length : 0)).toBeGreaterThan(0)
    await page.reload()
    await expect(frame.locator('.replay-app')).toBeVisible()
    const evidence = await environment.seedReplay(true)
    const evidenceReply = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/game-contexts/${evidence.roomId}/evidence/0`)
    await page.goto(`${environment.preOrigin}/open-agricola/?room=${evidence.roomId}&step=0&frame=${evidence.firstHash}`)
    const evidenceHttp = await evidenceReply
    expect(await evidenceHttp.json()).toMatchObject({ok:true,kind:'reportedEvidence',perspective:'p1'})
    expect(evidenceHttp.status()).toBe(200)
    await expect(frame.locator('.replay-app--board')).toBeVisible()
    await expect(frame.locator('[data-hand-anchor="p1"] [data-card-anchor="CUSTOM_PRIVATE_REPLAY"]')).toBeVisible()
    await expect(frame.locator('[data-hand-anchor="p2"]')).toHaveCount(0)
    await expect(frame.locator('.replay-header select')).toHaveCount(0)
    expect(iframeRequests.filter(request => /\/api\/v1\/|\/replay-assets\//.test(request.url))).toEqual([])
    await environment.source.prepare('DELETE FROM beta_access WHERE user_id=?').run(environment.user.id)
    await expect(page.locator('iframe')).toHaveCount(0,{timeout:35_000})
    await expect(page.locator('.prerelease-access-screen')).toBeVisible()
  } finally {
    await releaseAll([()=>environment.context.close(),()=>environment.browser.close(),()=>environment.close()])
  }
})

for (const mode of ['server', 'browser']) test(`prerelease public sandbox rejects malformed registration metadata in ${mode} mode`, async ({ playwright }) => {
  test.setTimeout(180_000)
  const environment = await fixture(playwright, true)
  try {
    const card = environment.publicFixture
    if (!card) throw new Error('Missing published fixture')
    await environment.source.prepare("UPDATE workshop_card_versions SET card_json=jsonb_set(card_json::jsonb,'{modifiers}','{\"type\":\"bonus\"}'::jsonb)::text WHERE id=?").run(card.versionId)
    const page = await environment.enter(environment.context), dialogs: string[] = []
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept() })
    await page.goto(`${environment.preOrigin}/open-agricola/?page=workshop`)
    await page.getByLabel(card.name, { exact: true }).check()
    await page.getByRole('combobox', { name: 'Run game' }).selectOption(mode)
    const started = mode === 'server' ? page.waitForResponse(response => new URL(response.url()).pathname === '/api/game/new-sandbox' && response.request().method() === 'POST') : undefined
    await page.getByRole('button', { name: 'Start Sandbox', exact: true }).click()
    if (started) {
      expect((await started).status()).toBe(400)
      await expect(page.getByRole('alert')).toContainText('modifiers')
    } else {
      await expect.poll(() => dialogs.join('\n'), { timeout: 5000 }).toContain('modifiers')
      await expect(page.frameLocator('iframe.sandbox-embed-frame').locator('.action-board')).toHaveCount(0)
    }
  } finally { await releaseAll([() => environment.context.close(), () => environment.browser.close(), () => environment.close()]) }
})

test('prerelease public sandbox displays the HTTP compiler refusal', async ({ playwright }) => {
  test.setTimeout(180_000)
  const environment = await fixture(playwright, true)
  try {
    const card = environment.publicFixture
    if (!card) throw new Error('Missing published fixture')
    await environment.source.prepare("UPDATE workshop_card_versions SET card_json=jsonb_set(card_json::jsonb,'{_code}',to_jsonb(?::text))::text WHERE id=?")
      .run(`const CARD_ID='${card.ruleId}';const CARD_IMPL={effect:{id:CARD_ID,unsupportedCapability:()=>1}}`, card.versionId)
    const page = await environment.enter(environment.context)
    await page.goto(`${environment.preOrigin}/open-agricola/?page=workshop`)
    await page.getByLabel(card.name, { exact: true }).check()
    await page.getByRole('button', { name: 'Start Sandbox', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('unsupported')
    await expect(page.locator('iframe.sandbox-embed-frame')).toHaveCount(0)
  } finally { await releaseAll([() => environment.context.close(), () => environment.browser.close(), () => environment.close()]) }
})

test('prerelease public sandbox renders fixed art and executes dynamic effects in both modes, then stops idle execution on disable', async ({ playwright }, testInfo) => {
  test.setTimeout(300_000)
  const environment = await fixture(playwright, true)
  const diagnostics: unknown[] = []
  try {
    const fixtureCard = environment.publicFixture
    if (!fixtureCard) throw new Error('Missing published fixture')
    const modifier = { type: 'bonus', cardId: fixtureCard.ruleId, appliesTo: ['construct'], discount: { wood: 1 } }
    await environment.source.prepare("UPDATE workshop_card_versions SET card_json=jsonb_set(card_json::jsonb,'{modifiers}',?::jsonb)::text WHERE id=?")
      .run(JSON.stringify([modifier]), fixtureCard.versionId)
    const page = await environment.enter(environment.context), workers: string[] = []
    page.on('console', message => { if (message.type() === 'error') diagnostics.push({ console: message.text() }) })
    page.on('response', response => {
      if (new URL(response.url()).pathname.includes('/public-sandbox/')) void response.text().then(body => diagnostics.push({ url: response.url(), status: response.status(), body }))
    })
    page.on('worker', worker => workers.push(worker.url()))
    await page.goto(`${environment.preOrigin}/open-agricola/?page=workshop`)
    await expect(page.getByRole('heading', { name: 'Public card sandbox' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Design|Generate|Publish/i })).toHaveCount(0)
    await page.getByLabel(fixtureCard.name, { exact: true }).check()
    const modes = ['server', 'browser']
    let serverWorkerCount = 0
    for (const mode of modes) {
      await page.getByRole('combobox', { name: 'Run game' }).selectOption(mode)
      const started = mode === 'server' ? page.waitForResponse(response => new URL(response.url()).pathname === '/api/game/new-sandbox' && response.request().method() === 'POST') : undefined
      await page.getByRole('button', { name: 'Start Sandbox', exact: true }).click()
      if (started) { const response = await started; expect(response.status(), await response.text()).toBe(200) }
      await expect(page.getByRole('img', { name: fixtureCard.name, exact: true })).toBeVisible()
      await expect.poll(() => page.getByRole('img', { name: fixtureCard.name, exact: true }).evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1)
      const frame = page.frameLocator('iframe.sandbox-embed-frame')
      await expect(frame.locator('.action-board').first()).toBeVisible({ timeout: 30_000 })
      await expect(frame.locator('[data-player-resource-anchor="p1"] [aria-label="Food: 2"]').first()).toBeVisible()
      await frame.locator('.dev-field', { hasText: 'Card ID' }).getByRole('textbox').fill(fixtureCard.ruleId)
      const played = mode === 'server' ? page.waitForResponse(response => new URL(response.url()).pathname === '/api/game/dev/play-card' && response.request().method() === 'POST') : undefined
      await frame.getByRole('button', { name: 'Play Card', exact: true }).click()
      if (played) expect((await (await played).json()).state.players[0].activeModifiers).toContainEqual(modifier)
      await expect(frame.locator('[data-player-resource-anchor="p1"] [aria-label="Food: 4"]').first()).toBeVisible()
      if (mode === 'server') {
        serverWorkerCount = workers.length
        await page.getByRole('button', { name: 'Close Sandbox', exact: true }).click()
      }
    }
    expect(workers.length).toBeGreaterThan(serverWorkerCount)
    const frame = page.frameLocator('iframe.sandbox-embed-frame')
    const frameUrl = await page.locator('iframe.sandbox-embed-frame').getAttribute('src')
    expect(frameUrl).toContain('localSandbox=1')
    await expect.poll(() => page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
      const opening = indexedDB.open('open-agricola-local-sandbox', 1)
      opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const db = opening.result, tx = db.transaction('games', 'readonly'), request = tx.objectStore('games').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
      }
    }))).toEqual(expect.arrayContaining([expect.objectContaining({ serializedState: expect.objectContaining({ state: expect.objectContaining({
      players: expect.arrayContaining([expect.objectContaining({ id: 'p1', resources: expect.objectContaining({ food: 4 }), activeModifiers: expect.arrayContaining([modifier]) })]),
    }) }) })]))
    await environment.source.prepare('UPDATE workshop_cards SET live=0 WHERE id=?').run(fixtureCard.cardId)
    const resumed = page.waitForEvent('dialog').then(dialog => dialog.accept())
    const navigated = page.waitForEvent('framenavigated', candidate => new URL(candidate.url()).pathname === '/open-agricola/workshop-game.html')
    await page.locator('iframe.sandbox-embed-frame').evaluate((element: HTMLIFrameElement) => element.contentWindow?.location.reload())
    await navigated; await resumed
    await expect(frame.locator('[data-player-resource-anchor="p1"] [aria-label="Food: 4"]').first()).toBeVisible({ timeout: 30_000 })
    await expect(frame.locator('.action-board').first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('sandbox-restored.png'), fullPage: true })
    await environment.source.prepare('UPDATE workshop_public_versions SET disabled_at=? WHERE card_id=?').run(Date.now(), fixtureCard.cardId)
    await expect(frame.getByText('This playtest is paused. Check access and card availability before continuing.', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(frame.locator('.action-board')).toHaveCount(0)
    const resume = async () => {
      const confirmed = page.waitForEvent('dialog').then(dialog => dialog.accept())
      const navigation = page.waitForEvent('framenavigated', candidate => new URL(candidate.url()).pathname === '/open-agricola/workshop-game.html')
      await frame.getByRole('button', { name: 'Retry', exact: true }).click()
      await navigation; await confirmed
      await expect(frame.locator('[data-player-resource-anchor="p1"] [aria-label="Food: 4"]').first()).toBeVisible({ timeout: 30_000 })
    }
    await environment.source.prepare('UPDATE workshop_public_versions SET disabled_at=NULL WHERE card_id=?').run(fixtureCard.cardId)
    await resume()
    environment.setPublicSourceOnline(false)
    await expect(frame.getByText('This playtest is paused. Check access and card availability before continuing.', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(frame.locator('.action-board')).toHaveCount(0)
    environment.setPublicSourceOnline(true)
    await resume()
    await environment.assertPrincipal(page)
    for (const request of environment.publicRequests) {
      expect(request.cookie).toBeUndefined(); expect(request.authorization).toBeUndefined(); expect(request.origin).toBeUndefined()
      expect(request.path).toMatch(/^\/api\/workshop\/public-cards\/v1\/cards(?:$|\/)/)
    }
  } finally {
    writeFileSync(testInfo.outputPath('public-sandbox-responses.json'), JSON.stringify(diagnostics, null, 2))
    await testInfo.attach('public-sandbox-responses', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' })
    await releaseAll([() => environment.context.close(), () => environment.browser.close(), () => environment.close()])
  }
})

test('real prerelease Multihand binds two seats per principal and survives browser reentry without losing the game', async ({ playwright }) => {
  test.setTimeout(300_000)
  const environment = await fixture(playwright)
  let other: Awaited<ReturnType<typeof environment.createParticipant>> | undefined
  let failure: { error: unknown } | undefined
  try {
    const host = await environment.enter(environment.context)
    other = await environment.createParticipant()
    const guest = await environment.enter(other.context, other.user)
    const observe = (page: Page) => {
      const states: Array<Extract<ServerEvent, { type: 'stateUpdate' }>> = []
      const joins: Array<Extract<ServerEvent, { type: 'roomJoined' }>> = []
      page.on('websocket', socket => socket.on('framereceived', frame => {
        const event: ServerEvent = JSON.parse(String(frame.payload))
        if (event.type === 'stateUpdate') states.push(event)
        if (event.type === 'roomJoined') joins.push(event)
      }))
      return { states, joins, latest: () => states.at(-1) }
    }
    const hostWire = observe(host), guestWire = observe(guest)
    await host.getByRole('button', { name: 'Multihand game', exact: true }).click()
    await host.getByRole('button', { name: 'Create Game', exact: true }).click()
    await expect(host.locator('.team-waiting-room')).toBeVisible()
    await expect(host.getByRole('button', { name: 'Start game', exact: true })).toBeDisabled()
    const roomUrl = host.url(), roomId = new URL(roomUrl).searchParams.get('room')
    expect(roomId).toMatch(/^[a-f0-9-]{36}$/)
    await guest.goto(roomUrl)
    await expect(guest.locator('.team-waiting-room')).toContainText('4/4 seats filled')
    await expect(host.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled()
    expect(hostWire.latest()).toBeUndefined()
    expect(guestWire.latest()).toBeUndefined()
    await host.getByRole('button', { name: 'Start game', exact: true }).click()
    await expect.poll(() => hostWire.joins.at(-1)?.controlledPlayerIndexes).toEqual([0, 2])
    await expect.poll(() => guestWire.joins.at(-1)?.controlledPlayerIndexes).toEqual([1, 3])
    await expect.poll(() => hostWire.latest()?.payload.state.team?.playerTeams).toEqual([0, 1, 0, 1])
    const pages = [host, guest]
    const wires = [hostWire, guestWire]
    const acted = new Set<number>()
    for (let step = 0; step < 4; step++) {
      const state = hostWire.latest()!
      const actor = state.payload.interaction.stateId === 'wait'
        ? state.payload.interaction.playerIndex : state.payload.state.currentPlayerIndex
      const side = actor % 2, page = pages[side]!, wire = wires[side]!
      await expect(page.locator(`.multihand-operation[data-operation-player-id="p${actor + 1}"]`).first()).toBeVisible()
      const before = wire.latest()!.version
      const action = page.locator(['forest', 'clay-pit', 'reed-bank', 'grain-seeds']
        .map(id => `[data-action-id="${id}"] button:enabled`).join(', ')).first()
      await expect(action).toBeVisible()
      await action.click()
      await expect.poll(() => wire.latest()!.version).toBeGreaterThan(before)
      acted.add(actor)
      const confirm = page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true })
      if (await confirm.isVisible()) {
        const previous = wire.latest()!.version
        await confirm.click()
        await expect.poll(() => wire.latest()!.version).toBeGreaterThan(previous)
      }
      await expect.poll(() => hostWire.latest()?.version).toBe(wire.latest()!.version)
    }
    expect([...acted].sort()).toEqual([0, 1, 2, 3])
    const persisted = await environment.retainedRoom(roomId!)
    await host.reload()
    await expect.poll(() => hostWire.joins.at(-1)?.controlledPlayerIndexes).toEqual([0, 2])
    await expect(host.locator('.multihand-seat-controls')).toBeVisible()
    await expect(host.getByRole('button', { name: 'View your hand', exact: true })).toBeVisible()
    await host.getByRole('button', { name: 'View your hand', exact: true }).click()
    await expect(host.locator('.multihand-hand-dialog select option')).toHaveCount(2)
    await host.locator('.multihand-hand-dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await environment.source.prepare('DELETE FROM beta_access WHERE user_id=?').run(environment.user.id)
    await expect(host.getByText('Your login or Beta access is no longer valid. Return to production to sign in and enter again.')).toBeVisible({ timeout: 35_000 })
    expect(await environment.retainedRoom(roomId!)).toEqual(persisted)
    await environment.source.prepare('INSERT INTO beta_access(user_id,granted_at) VALUES(?,?)').run(environment.user.id, Date.now())
    const returned = await environment.enter(environment.context)
    const returnedWire = observe(returned)
    await returned.goto(roomUrl)
    await expect.poll(() => returnedWire.joins.at(-1)?.controlledPlayerIndexes).toEqual([0, 2])
    await expect(returned.locator('.multihand-seat-controls')).toBeVisible()
  } catch (error) { failure = { error } }
  try {
    await releaseAll([
      async () => { await other?.context.close() },
      () => environment.context.close(), () => environment.browser.close(), () => environment.close(),
    ])
  } catch (error) {
    if (failure) throw new AggregateError([failure.error, error], 'Team browser test and cleanup failed', { cause: error })
    throw error
  }
  if (failure) throw failure.error
})

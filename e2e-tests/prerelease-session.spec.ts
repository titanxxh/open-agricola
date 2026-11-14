// @covers client/app/replay-bridge.ts
// @covers replay-viewer/src/bridge-transport.ts
// @covers scripts/prerelease/gateway.ts
// @covers scripts/prerelease/owner-browser.ts
import { seedPrivateReplay } from './_helpers/prerelease-replay'
// @covers client/app/PrereleaseBoundary.tsx
// @covers client/services/prerelease-runtime.ts
// @covers client/contexts/AuthContext.tsx
// @covers client/app/PageRouter.tsx
// @covers server/prerelease-routes.ts
// @covers server/prerelease-sessions.ts
// @covers client/components/interaction/MarketplacePanel.tsx
// @covers server/game/room.ts
// @covers server/game/room-committer.ts
// @covers client/app/MultihandSeatControls.tsx
// @covers client/app/TeamWaitingRoom.tsx
// @covers client/app/LobbyPage.tsx
// @covers client/app/GameContainerApi.tsx
// @covers shared/actions/effects/internal/select-target-farm.ts
import { expect, type BrowserContext, type Page, type PlaywrightWorkerArgs, type PlaywrightWorkerOptions } from '@playwright/test'
import { execFileSync, spawn } from 'node:child_process'
import { createServer as tlsServer } from 'node:https'
import { createServer, request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http'
import { once } from 'node:events'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
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
import { createPrereleaseGateway, OWNER_VERIFICATION_COOKIE } from '../scripts/prerelease/gateway'
import { configureOwnerVerification } from '../scripts/prerelease/owner-browser'
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { test } from './server-fixtures'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import { PostgresDatabase } from '../server/database/postgres'
import { RoomDirectory } from '../server/game/room-directory'
import { PostgresRoomPersistence } from '../server/game/persistence/postgres-adapter'
import { ExecutionAccess } from '../server/game/execution-access'
import { serializeSessionSnapshot } from '../shared/session/serialization'
import type { GameSession } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { canonicalJson, frameHash } from '../server/game/replay-codec'
import { REPLAY_SCHEMA_VERSION } from '../server/game/room-committer'

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

function observeGameSocket(page: Page) {
  const states: Array<Extract<ServerEvent, { type: 'stateUpdate' }>> = []
  const joins: Array<Extract<ServerEvent, { type: 'roomJoined' }>> = []
  page.on('websocket', socket => socket.on('framereceived', frame => {
    const event: ServerEvent = JSON.parse(String(frame.payload))
    if (event.type === 'stateUpdate') states.push(event)
    if (event.type === 'roomJoined') joins.push(event)
  }))
  return { states, joins, latest: () => states.at(-1) }
}

/** Actual pre application and sessions; the formal fixture uses the real authority protocol. */
async function fixture(playwright: PlaywrightWorkerArgs['playwright'], withPublicSandbox = false,
  options: { browserName?: PlaywrightWorkerOptions['browserName']; ownerVerification?: boolean } = {}) {
  expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
  const acquired = releaseQueue()
  let closeAfterSetup: (() => Promise<void>) | undefined
  try {
    const directory = mkdtempSync(join(tmpdir(), 'oa-pre-session-')), schema = `test_${randomUUID().replaceAll('-', '')}`
    acquired.register(() => { for (const name of ['pre.env', 'key.pem', 'owner-token']) rmSync(join(directory, name), { force: true }) })
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
    const upstreamReads: Array<{ path: string; method: string; cookieNames: string[]; authorization: boolean; status: number; contentType: string; bytes: number; sha256: string }> = []
    let observer: ReturnType<typeof createServer> | undefined
    const track = (socket: Duplex) => { if (sockets.has(socket)) return; sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => socket.destroy()) }
    const trackRequest = (request: ClientRequest) => { requests.add(request); request.once('close', () => requests.delete(request)); request.once('socket', track); return request }
    let formalOrigin = '', preOrigin = '', authority = createPrereleaseAuthorityHandler({ db: source, getSourceToken: async req => requestSessionToken(req) })
    let beforeNextExchange: (() => Promise<void>) | undefined
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
        const before = req.url === '/api/prerelease/exchange' ? beforeNextExchange : undefined
        if (before) beforeNextExchange = undefined
        void Promise.resolve().then(() => before?.()).then(() => authority(req, res))
          .then(handled => { if (!handled) res.writeHead(404).end() }).catch(() => res.writeHead(500).end()); return
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
        await Promise.all([proxy, ...(observer ? [observer] : [])].map(server => new Promise<void>(done => {
          if (!server.listening) { done(); return }
          server.close(() => done())
        })))
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
        rmSync(root, { recursive: true, force: true }); rmSync(envFile, { force: true }); rmSync(join(directory, 'key.pem'), { force: true }); rmSync(join(directory, 'owner-token'), { force: true })
      },
    ])
    closeAfterSetup = close
    await command('pnpm', ['exec', 'vite', 'build', '--outDir', root], childEnv, join(directory, 'build.log'))
    writeFileSync(join(root, 'frontend-build.json'), JSON.stringify({ format: 1, gameBuildId: buildId, basePath: '/open-agricola/', releaseChannel: 'prerelease', deploymentTarget: 'prerelease-hosted' }) + '\n')
    await command('bash', ['./restart-local.sh'], launchEnv, join(directory, 'launcher.log'))
    const healthyCycle = randomUUID(), observedAt = Date.now(), stateFile = join(directory, 'gate.json')
    let upstreamPort = backendPort
    if (options.ownerVerification) {
      observer = createServer((req, res) => {
        const path = req.url ?? '/', capture = /^\/(?:replay-viewers\/|api\/v1\/(?:replays\/|game-contexts\/))/.test(path)
          ? { path, method: req.method ?? '', cookieNames: (req.headers.cookie ?? '').split(';').map(value => value.trim().split('=')[0]).filter(Boolean),
            authorization: req.headers.authorization !== undefined, status: 0, contentType: '', bytes: 0, sha256: '' } : undefined
        if (capture) upstreamReads.push(capture)
        const outgoing = trackRequest(httpRequest({ hostname: '127.0.0.1', port: backendPort, path, method: req.method, headers: req.headers }, response => {
          if (capture) { capture.status = response.statusCode ?? 0; capture.contentType = String(response.headers['content-type'] ?? '') }
          const digest = createHash('sha256')
          response.on('data', (chunk: Buffer) => { if (capture) { capture.bytes += chunk.length; digest.update(chunk) } })
          response.on('end', () => { if (capture) capture.sha256 = digest.digest('hex') })
          res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res)
        }))
        outgoing.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
        req.once('aborted', () => outgoing.destroy()); res.once('close', () => { if (!res.writableEnded) outgoing.destroy() }); req.pipe(outgoing)
      })
      observer.on('connection', track)
      observer.on('upgrade', (req, socket, head) => {
        track(socket)
        const outgoing = trackRequest(httpRequest({ hostname: '127.0.0.1', port: backendPort, path: req.url, headers: req.headers }))
        outgoing.on('upgrade', (response, transport, upstreamHead) => {
          track(transport)
          socket.write(`HTTP/${response.httpVersion} ${response.statusCode ?? 502} ${response.statusMessage ?? ''}\r\n${response.rawHeaders.reduce((text, value, index, values) => index % 2 ? text : `${text}${value}: ${values[index + 1]}\r\n`, '')}\r\n`)
          if (head.length) transport.write(head)
          if (upstreamHead.length) socket.write(upstreamHead)
          socket.once('close', () => transport.destroy()); transport.once('close', () => socket.destroy()); socket.pipe(transport).pipe(socket)
        })
        outgoing.on('response', response => { response.destroy(); socket.destroy() })
        outgoing.on('error', () => socket.destroy()); socket.once('close', () => outgoing.destroy()); outgoing.end()
      })
      await new Promise<void>(done => observer!.listen(0, '127.0.0.1', done))
      const address = observer.address(); if (!address || typeof address === 'string') throw new Error('Missing native upstream observer port')
      upstreamPort = address.port
    }
    const ownerToken = options.ownerVerification ? randomBytes(32).toString('base64url') : undefined
    const tokenFile = join(directory, 'owner-token'), expiresAt = Date.now() + 600_000
    if (ownerToken) {
      writeFileSync(tokenFile, ownerToken, { mode: 0o600 })
      writeFileSync(join(directory, 'verification.json'), JSON.stringify({ targetId, buildId, generation: generationId, healthyCycle,
        tokenHash: createHash('sha256').update(ownerToken).digest('hex'), expiresAt }), { mode: 0o600 })
    }
    writeFileSync(join(directory, 'storage-guard.json'), JSON.stringify({ format: 1, targetId, fingerprint: 'f'.repeat(64),
      status: 'healthy', healthyCycle, observedAt, validUntil: observedAt + 120_000, operationsAllowed: true }))
    writeFileSync(stateFile, JSON.stringify({ format: 1, targetId, channel: 'prerelease', mode: options.ownerVerification ? 'maintenance' : 'open', buildId,
      generation: generationId, acceptance: options.ownerVerification ? null : { healthyCycle, formalBuildId: buildId } }))
    gateway = createPrereleaseGateway({ stateFile, targetId, origin: preOrigin, upstream: `http://127.0.0.1:${upstreamPort}`,
      formal: { appOrigin: formalOrigin, apiOrigin: formalOrigin }, ca: readFileSync(join(directory, 'cert.pem')) })
    await new Promise<void>(resolve => gateway!.server.listen(gatewayPort, '127.0.0.1', resolve))
    await gateway.refreshBrowserPolicy()
    const enter = async (context: BrowserContext, principal = user, expected?: 'paused') => {
      const page = await context.newPage()
      const responses: Array<Promise<{ at: number; path: string; status: number; code?: string }>> = []
      page.on('response', response => {
        const path = new URL(response.url()).pathname
        if (!['/api/prerelease/session', '/api/auth/me'].includes(path)) return
        const at = Date.now()
        responses.push(response.json().then((body: unknown) => ({ at, path, status: response.status(),
          ...(body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? { code: body.code } : {}),
        }), () => ({ at, path, status: response.status() })))
      })
      try {
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
        const initialResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/prerelease/session' && response.request().method() === 'POST')
        await page.goto(callback.href)
        await expect(page.locator('.prerelease-banner')).toContainText('Prerelease aaaaaaaaaaaa')
        await expect(page.getByRole('heading', { name: 'Formal identity fixture' })).toHaveCount(0)
        const response = await initialResponse
        if (expected === 'paused') expect(response.status()).toBe(503)
        if (response.status() === 503) {
          expect(await response.json()).toEqual({ ok: false, code: 'prerelease_access_paused' })
          await expect(page.locator('.prerelease-access-screen')).toContainText('Access is paused')
          await page.getByRole('button', { name: 'Retry', exact: true }).click()
        }
        await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible()
        await expect(page.locator('.lobby-user-pill')).toHaveText(principal.displayName)
        return page
      } finally {
        const events = await source.prepare('SELECT kind,created_at,acknowledged_at FROM prerelease_identity_events WHERE target_origin=? AND user_id=? ORDER BY created_at,id').all(preOrigin, principal.id)
        const path = test.info().outputPath(`prerelease-entry-observations-${randomUUID()}.json`)
        writeFileSync(path, JSON.stringify({ responses: await Promise.all(responses), events }, null, 2), { mode: 0o600 })
        await test.info().attach('prerelease-entry-observations', { path, contentType: 'application/json' })
      }
    }
    const browser = await playwright[options.browserName ?? 'chromium'].launch()
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' })
    await context.addInitScript(() => { if (window.top === window) localStorage.setItem('open-agricola-locale-v2', 'en') })
    const formalCookieName = authCookieNames().session
    await context.addCookies([{ name: formalCookieName, value: sourceToken, url: formalOrigin, httpOnly: true, secure: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600 }])
    if (options.ownerVerification) {
      try { await configureOwnerVerification(context, preOrigin, tokenFile) }
      catch (error) { await releaseAll([() => context.close(), () => browser.close()]); throw error }
    }
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
      if (!token) throw new Error('Could not create the participant formal session')
      const other = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' })
      await other.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
      await other.addCookies([{ name: formalCookieName, value: token, url: formalOrigin, httpOnly: true, secure: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600 }])
      return { context: other, user: participant }
    }
    // A prepared native snapshot is restored before this owner has loaded the room. No browser command can mutate its setup.
    const prepareRetainedRoom = async (session: GameSession, seatUserIds: string[]) => {
      const db = new PostgresDatabase({ connectionString: databaseUrl, schema })
      try {
        const state = session.state, team = state.team
        if (!team || state.players.length !== seatUserIds.length) throw new Error('Expected explicit Team seat ownership')
        const viewer = await db.prepare('SELECT build_id FROM replay_viewer_builds ORDER BY created_at DESC LIMIT 1').get<{ build_id: string }>()
        if (!viewer) throw new Error('The actual prerelease app has not installed its immutable viewer')
        const roomId = randomUUID(), directory = new RoomDirectory(db)
        const { owner } = await directory.claim(roomId)
        const executionStamp = await new ExecutionAccess(db).capture([], seatUserIds)
        const teamMembers = [...new Set(seatUserIds)].map(userId => {
          const playerIndex = seatUserIds.indexOf(userId), player = state.players[playerIndex], teamIndex = team.playerTeams[playerIndex]
          if (!player || teamIndex === undefined) throw new Error('Missing native Team member')
          return { memberId: randomUUID(), userId, name: player.name, teamIndex,
            seatCount: seatUserIds.filter(id => id === userId).length }
        })
        const serialized = session.withCtx(() => serializeSessionSnapshot(state, session)), createdAt = Date.now()
        expect(await new PostgresRoomPersistence(db, directory).commitReplay({
          roomId, serialized, meta: {
            createdBy: seatUserIds[0] ?? null, startedAt: createdAt, status: 'playing', maxPlayers: state.players.length,
            customCardDbIds: [], replayRecording: true, replayViewerBuildId: viewer.build_id, replayGameBuildId: buildId,
            teamMembers, players: seatUserIds.map((userId, playerIndex) => ({ userId, playerIndex })), owner, executionStamp,
          }, header: { schemaVersion: REPLAY_SCHEMA_VERSION, viewerBuildId: viewer.build_id,
            gameBuildId: buildId, missingPrefix: false, customCardsJson: '[]' },
          step: { stepNo: 0, roomVersion: 0, checkpointStepNo: 0, playerIndex: null, commandType: 'initial',
            intentJson: '{}', payloadKind: 'checkpoint', payloadGzip: gzipSync(canonicalJson(serialized.frame)),
            frameHash: frameHash(serialized.frame), createdAt },
        })).toEqual({ kind: 'committed' })
        return roomId
      } finally { await db.close() }
    }
    const retainedRoom = async (roomId: string) => admin.prepare(`SELECT status,state_json,team_members_json FROM "${schema}".rooms WHERE id=?`).get(roomId)
    const waitForIdentityEvents = () => expect.poll(async () => (await source.prepare('SELECT count(*)::int AS pending FROM prerelease_identity_events WHERE target_origin=? AND user_id=? AND acknowledged_at IS NULL')
      .get<{ pending: number }>(preOrigin, user.id))?.pending).toBe(0)
    return { context, browser, close, enter, createParticipant, retainedRoom, prepareRetainedRoom, assertPrincipal, assertFormalSession, formalOrigin, formalCookieName, preOrigin, user, source, generationId,
      upstreamReads, verificationBinding: { targetId, buildId, generation: generationId, healthyCycle, expiresAt, mode: options.ownerVerification ? 'maintenance' : 'open' },
      seedReplay: (evidence = false) => seedPrivateReplay({ databaseUrl, schema, prefix, dependencies, userId: user.id, evidence }),
      publicFixture, publicRequests, setPublicSourceOnline: (value: boolean) => { publicSourceOnline = value },
      waitForIdentityEvents,
      beforeNextExchange: (callback: () => Promise<void>) => { beforeNextExchange = callback } }
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


test('private replay uses an authenticated parent bridge and clears idle display on source revocation', async ({ playwright, browserName }, testInfo) => {
  test.setTimeout(300_000)
  const environment = await fixture(playwright, false, { browserName, ownerVerification: true })
  const ordinary = await environment.browser.newContext({ ignoreHTTPSErrors: true })
  const probes: Array<{ path: string; status: number }> = []
  const iframeRequests: Array<Promise<{ url: string; cookieNames: string[]; authorization: boolean }>> = []
  let viewerUrl: string | null = null
  try {
    expect(environment.verificationBinding.mode).toBe('maintenance')
    expect((await environment.context.cookies(environment.preOrigin)).find(cookie => cookie.name === OWNER_VERIFICATION_COOKIE))
      .toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
    const page = await environment.enter(environment.context)
    const replay = await environment.seedReplay()
    for (const path of ['/', '/api/auth/me', `/api/v1/replays/${replay.roomId}/manifest`,
      `/api/v1/replays/${replay.roomId}/assets/${replay.assetHash}`, `/replay-assets/${replay.assetHash}`]) {
      const response = await ordinary.request.get(environment.preOrigin + path)
      probes.push({ path, status: response.status() })
      expect(response.status(), path).toBe(503)
    }
    const debug: unknown[] = []
    page.on('console', message => { if(message.type() === 'error') debug.push({kind:'console',text:message.text()}) })
    page.on('pageerror', error => debug.push({kind:'pageerror',text:error.message}))
    page.on('response', response => { if(response.url().includes('/replay-viewers/')) debug.push({kind:'response',url:response.url(),status:response.status()}) })
    page.on('request', request => {
      if (request.frame() !== page.mainFrame()) iframeRequests.push(request.allHeaders().then(headers => ({ url: request.url(),
        cookieNames: (headers.cookie ?? '').split(';').map(value => value.trim().split('=')[0]).filter(Boolean),
        authorization: headers.authorization !== undefined })))
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
    viewerUrl = await page.locator('iframe').getAttribute('src')
    expect(viewerUrl).toMatch(/\/replay-viewers\/[a-f0-9]{64}\/index\.html\?/)
    expect(new URL(viewerUrl!, environment.preOrigin).searchParams.get('room')).toBe(replay.roomId)
    await expect(frame.locator('[data-card-anchor="CUSTOM_PRIVATE_REPLAY"]')).toBeVisible()
    await expect.poll(async () => frame.locator('[data-card-anchor="CUSTOM_PRIVATE_REPLAY"] .card-icon').first().evaluate(element => getComputedStyle(element).backgroundImage)).toContain('blob:')
    const browserRequests = await Promise.all(iframeRequests)
    expect(browserRequests.filter(request => /\/api\/v1\/|\/replay-assets\//.test(request.url))).toEqual([])
    if (await page.evaluate(() => 'credentialless' in HTMLIFrameElement.prototype)) {
      expect(browserRequests.some(request => request.cookieNames.includes('__Host-oa-pre-session') || request.cookieNames.includes(OWNER_VERIFICATION_COOKIE))).toBe(false)
    }
    await expect.poll(() => environment.upstreamReads.some(read => /\/replay-viewers\/.+\/index\.html$/.test(read.path) && read.status === 200 && read.bytes > 0)).toBe(true)
    await expect.poll(() => environment.upstreamReads.some(read => /\/replay-viewers\/.+\.js$/.test(read.path) && read.status === 200 && read.bytes > 0)).toBe(true)
    const programs = environment.upstreamReads.filter(read => read.path.startsWith('/replay-viewers/'))
    expect(programs.every(read => read.cookieNames.length === 0 && !read.authorization && !read.path.includes('?'))).toBe(true)
    expect(environment.upstreamReads.some(read => read.path.startsWith(`/api/v1/replays/${replay.roomId}/`) && read.status === 200 && read.cookieNames.includes('__Host-oa-pre-session'))).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('owner-maintenance-replay.png'), fullPage: true })
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
    expect((await Promise.all(iframeRequests)).filter(request => /\/api\/v1\/|\/replay-assets\//.test(request.url))).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('owner-maintenance-evidence.png'), fullPage: true })
    await environment.source.prepare('DELETE FROM beta_access WHERE user_id=?').run(environment.user.id)
    await expect(page.locator('iframe')).toHaveCount(0,{timeout:35_000})
    await expect(page.locator('.prerelease-access-screen')).toBeVisible()
  } finally {
    const path = testInfo.outputPath('owner-maintenance-replay-http.json')
    writeFileSync(path, JSON.stringify({ browserName, verification: environment.verificationBinding, viewerUrl, ordinary: probes,
      browserRequests: await Promise.all(iframeRequests), upstreamReads: environment.upstreamReads }, null, 2), { mode: 0o600 })
    await testInfo.attach('owner-maintenance-replay-http', { path, contentType: 'application/json' })
    await releaseAll([() => ordinary.close(),()=>environment.context.close(),()=>environment.browser.close(),()=>environment.close()])
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
    const hostWire = observeGameSocket(host), guestWire = observeGameSocket(guest)
    await host.getByRole('button', { name: 'Multihand game', exact: true }).click()
    const cooperation = host.getByRole('checkbox', { name: 'Official cooperation rules', exact: true })
    await expect(cooperation).not.toBeChecked()
    await cooperation.check()
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
    expect(hostWire.latest()?.payload.state.team?.configuration.cooperationRules).toBe(true)
    const pages = [host, guest]
    const wires = [hostWire, guestWire]
    for (let opening = 0; opening < 8; opening++) {
      const current = hostWire.latest()!
      if (current.payload.interaction.stateId === 'idle') break
      if (current.payload.interaction.stateId !== 'wait') throw new Error('Expected a pending opening interaction')
      expect(current.payload.state).toMatchObject({ phase: 'playing', round: 1, roundPhase: 'preparation' })
      const actor = current.payload.interaction.playerIndex, side = actor % 2
      const page = pages[side]!, wire = wires[side]!
      await expect.poll(() => wire.latest()?.version).toBe(current.version)
      const interaction = wire.latest()!.payload.interaction
      if (interaction.stateId !== 'wait') throw new Error('Expected an owned opening interaction')
      const request = interaction.request
      const control = request.kind === 'choice' && request.options.some(option => option.value === '__skip__' && !option.disabled)
        ? page.locator('.interaction-bar [data-choice-value="__skip__"]')
        : request.kind === 'confirm-player-switch'
          ? page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true })
          : undefined
      if (!control) throw new Error(`Unexpected opening interaction: ${request.kind}`)
      await expect(control).toBeEnabled()
      await control.click()
      await expect.poll(() => wire.latest()?.version ?? -1).toBeGreaterThan(current.version)
      await expect.poll(() => hostWire.latest()?.version).toBe(wire.latest()!.version)
    }
    await expect.poll(() => hostWire.latest()?.payload.interaction.stateId).toBe('idle')
    expect(hostWire.latest()?.payload.state.actionSpaces.flatMap(space => space.takenBy)).toEqual([])
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
      const pending = wire.latest()!.payload.interaction
      if (pending.stateId === 'wait' && (pending.request.kind === 'confirm-next-player' || pending.request.kind === 'confirm-player-switch')) {
        await expect(confirm).toBeVisible()
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
    environment.beforeNextExchange(async () => {
      await environment.source.prepare('DELETE FROM beta_access WHERE user_id=?').run(environment.user.id)
      await environment.source.prepare('INSERT INTO beta_access(user_id,granted_at) VALUES(?,?)').run(environment.user.id, Date.now())
      await environment.waitForIdentityEvents()
    })
    const returned = await environment.enter(environment.context, environment.user, 'paused')
    const returnedWire = observeGameSocket(returned)
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


test('real retained cooperative Marketplace charges the giver once and resumes after reloading the pending switch', async ({ playwright }) => {
  test.setTimeout(300_000)
  const environment = await fixture(playwright)
  let other: Awaited<ReturnType<typeof environment.createParticipant>> | undefined
  let failure: { error: unknown } | undefined
  try {
    const host = await environment.enter(environment.context)
    other = await environment.createParticipant()
    const guest = await environment.enter(other.context, other.user)
    const hostWire = observeGameSocket(host), guestWire = observeGameSocket(guest)
    const guestUser = other.user
    const session = createWorkSession({ options: { playerCount: 4,
      teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', cooperationRules: true },
    }, configure: state => {
      for (const [index, player] of state.players.entries()) player.name = index % 2 === 0 ? environment.user.displayName : guestUser.displayName
    } })
    let roomId: string
    try { roomId = await environment.prepareRetainedRoom(session, [environment.user.id, other.user.id, environment.user.id, other.user.id]) }
    finally { session.dispose() }
    const roomUrl = `${environment.preOrigin}/open-agricola/?room=${roomId}`
    await host.goto(roomUrl)
    await guest.goto(roomUrl)
    await expect.poll(() => hostWire.latest()?.payload.state.players.map(player => player.resources.food)).toEqual([2, 3, 3, 3])
    await expect.poll(() => hostWire.joins.at(-1)?.controlledPlayerIndexes).toEqual([0, 2])
    await host.locator('[data-action-id="marketplace"] button').click()
    const food = host.locator('[data-marketplace-resource="food"]')
    await expect(food).toBeVisible()
    await food.locator('select').first().selectOption('take')
    await food.locator('select').nth(1).selectOption('p3')
    await food.locator('input').fill('1')
    await expect(food.locator('output')).toHaveText(`${environment.user.displayName} pays 1 Food and 1 Food tax`)
    await host.getByRole('button', { name: 'Confirm transfers', exact: true }).click()
    await expect.poll(() => hostWire.latest()?.payload.state.players.map(player => player.resources.food)).toEqual([3, 3, 1, 3])
    await expect.poll(() => hostWire.latest()?.payload.state.log.filter(entry => entry.key === 'log.marketplaceTransfer').length).toBe(1)
    expect(hostWire.latest()?.payload.scores?.map(score => score.total)).toEqual([-14, -14, -14, -14])
    expect(hostWire.latest()?.payload.teamScores?.map(score => score.total)).toEqual([-28, -28])
    await expect.poll(() => hostWire.latest()?.payload.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player', nextPlayerIndex: 1 } })
    const persisted = await environment.retainedRoom(roomId)
    await host.reload()
    const confirm = host.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true })
    await expect(confirm).toBeVisible()
    expect(await environment.retainedRoom(roomId)).toEqual(persisted)
    expect(hostWire.latest()?.payload.state.players.map(player => player.resources.food)).toEqual([3, 3, 1, 3])
    expect(hostWire.latest()?.payload.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
    await confirm.click()
    await expect.poll(() => guestWire.latest()?.payload.state.currentPlayerIndex).toBe(1)
    const version = guestWire.latest()!.version
    await guest.locator('[data-action-id="day-laborer"] button').click()
    await expect.poll(() => guestWire.latest()?.version).toBeGreaterThan(version)
    await expect.poll(() => guestWire.latest()?.payload.state.players.map(player => player.resources.food)).toEqual([3, 5, 1, 3])
    expect(guestWire.latest()?.payload.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
  } catch (error) { failure = { error } }
  try {
    await releaseAll([
      async () => { await other?.context.close() },
      () => environment.context.close(), () => environment.browser.close(), () => environment.close(),
    ])
  } catch (error) {
    if (failure) throw new AggregateError([failure.error, error], 'Marketplace browser test and cleanup failed', { cause: error })
    throw error
  }
  if (failure) throw failure.error
})


test('real cooperative builds keep the builder, target farm and Stablehand continuation through revoked access and reentry', async ({ playwright }) => {
  test.setTimeout(300_000)
  const environment = await fixture(playwright)
  let other: Awaited<ReturnType<typeof environment.createParticipant>> | undefined
  let failure: { error: unknown } | undefined
  try {
    let host = await environment.enter(environment.context)
    other = await environment.createParticipant()
    const guestUser = other.user, guest = await environment.enter(other.context, guestUser)
    let hostWire = observeGameSocket(host)
    const guestWire = observeGameSocket(guest)
    const session = createWorkSession({ seed: 1666, options: { playerCount: 4,
      teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', cooperationRules: true },
    }, configure: state => {
      state.round = 14
      for (const [index, player] of state.players.entries()) {
        player.name = index % 2 === 0 ? environment.user.displayName : guestUser.displayName
        player.workers.push({ id: `${player.id}-family-third`, isActive: true, isNewborn: false })
      }
      const builder = state.players[0]
      if (!builder) throw new Error('Missing build actor')
      Object.assign(builder.resources, { wood: 20, reed: 3 })
      builder.occupationPlayed = ['D089_Stablehand']
    } })
    let roomId: string
    try { roomId = await environment.prepareRetainedRoom(session, [environment.user.id, guestUser.id, environment.user.id, guestUser.id]) }
    finally { session.dispose() }
    const roomUrl = `${environment.preOrigin}/open-agricola/?room=${roomId}`
    await host.goto(roomUrl); await guest.goto(roomUrl)
    await expect.poll(() => hostWire.joins.at(-1)?.controlledPlayerIndexes).toEqual([0, 2])
    await expect.poll(() => guestWire.joins.at(-1)?.controlledPlayerIndexes).toEqual([1, 3])
    const latest = () => {
      const event = hostWire.latest()
      if (!event) throw new Error('Missing confirmed room state')
      return event.payload
    }
    const command = async (wire: ReturnType<typeof observeGameSocket>, action: () => Promise<unknown>) => {
      const version = wire.latest()?.version ?? -1
      await action()
      await expect.poll(() => wire.latest()?.version ?? -1).toBeGreaterThan(version)
      await expect.poll(() => hostWire.latest()?.version).toBe(wire.latest()?.version)
    }
    const confirmSwitch = async (page: Page, wire: ReturnType<typeof observeGameSocket>, next: number) => {
      await command(wire, () => page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).click())
      await expect.poll(() => latest().state.currentPlayerIndex).toBe(next)
    }
    const take = async (page: Page, wire: ReturnType<typeof observeGameSocket>, spaceId: string) =>
      command(wire, () => page.locator(`[data-action-id="${spaceId}"] button`).click())
    const chooseTarget = async (playerId: string) => {
      await host.locator(`.interaction-bar [data-choice-value="target-farm:${playerId}"]`).click()
      await command(hostWire, () => host.getByRole('button', { name: 'Build on this farm', exact: true }).click())
    }
    const chooseBuild = async (kind: 'construct' | 'stables') => {
      const interaction = latest().interaction
      if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') throw new Error(`Expected ${kind} branch`)
      const option = interaction.request.options.find(option => option.labelKey === `actions.${kind}.name`)
      if (!option) throw new Error(`Missing ${kind} option`)
      await command(hostWire, () => host.locator(`.interaction-bar [data-choice-value="${option.value}"]`).click())
    }
    const place = async (playerId: string, tile: string) => {
      await expect(host.locator(`.hand-cards[data-hand-anchor="p1"]`).first()).toBeVisible()
      await host.locator(`[data-farm-tile-player="${playerId}"][data-farm-tile-key="${tile}"]`).click()
      await command(hostWire, () => host.locator('.interaction-bar [data-choice-value="confirm"]').click())
    }
    const otherSeats = async (actions: [string, string, string]) => {
      for (const [index, spaceId] of actions.entries()) {
        const actor = index + 1, page = actor % 2 === 0 ? host : guest, wire = actor % 2 === 0 ? hostWire : guestWire
        await expect.poll(() => latest().state.currentPlayerIndex).toBe(actor)
        await take(page, wire, spaceId)
        await confirmSwitch(page, wire, actor === 3 ? 0 : actor + 1)
      }
    }
    await take(host, hostWire, 'marketplace')
    const food = host.locator('[data-marketplace-resource="food"]')
    await food.locator('select').first().selectOption('take')
    await food.locator('input').fill('1')
    await command(hostWire, () => host.getByRole('button', { name: 'Confirm transfers', exact: true }).click())
    expect(latest().state.players.map(player => player.resources.food)).toEqual([3, 3, 1, 3])
    await confirmSwitch(host, hostWire, 1)
    await otherSeats(['day-laborer', 'grain-seeds', 'forest'])
    await take(host, hostWire, 'farm-expansion')
    await chooseTarget('p3')
    await chooseBuild('construct')
    await expect.poll(() => latest().interaction).toMatchObject({ stateId: 'wait', playerIndex: 0,
      request: { kind: 'farm-select', farmOwnerPlayerId: 'p3', farm: { farmType: 'room' } } })
    await place('p3', '1-1')
    expect(latest().state.players[0]?.resources).toMatchObject({ wood: 14, reed: 0 })
    expect(latest().state.players[0]?.rooms).toBe(2)
    expect(latest().state.players[2]?.rooms).toBe(3)
    await chooseBuild('stables')
    await place('p3', '0-2')
    expect(latest().state.players[0]?.resources.wood).toBe(11)
    expect(latest().state.players[0]?.stableTiles).toEqual([])
    expect(latest().state.players[2]?.stableTiles).toEqual([{ row: 0, col: 2 }])
    await confirmSwitch(host, hostWire, 1)
    await otherSeats(['clay-pit', 'reed-bank', 'copse'])
    await take(host, hostWire, 'fencing')
    await chooseTarget('p3')
    for (const edge of ['H-0-3', 'H-1-3', 'V-0-3', 'V-0-4']) {
      await host.locator(`[data-fence-player="p3"][data-fence-edge="${edge}"] .farm-fence-hit`).click()
    }
    await expect(host.getByTestId('fence-selection-cost')).toHaveText('Cost: 6 wood')
    await command(hostWire, () => host.locator('.interaction-bar [data-choice-value="confirm"]').click())
    expect(latest().state.players[0]?.resources.wood).toBe(5)
    expect(latest().state.players[2]?.pastures).toHaveLength(1)
    for (let step = 0; step < 4; step++) {
      const interaction = latest().interaction
      if (interaction.stateId !== 'wait' || (interaction.request.kind !== 'choice' && interaction.request.kind !== 'select-trigger')) throw new Error('Expected Stablehand continuation')
      if (interaction.request.options.some(option => option.value === 'target-farm:p1')) break
      const option = interaction.request.options.find(option => option.value === 'D089_Stablehand')
        ?? interaction.request.options.find(option => option.value !== '__skip__' && !option.disabled)
      if (!option) throw new Error('Missing Stablehand continuation choice')
      await command(hostWire, () => host.locator(`.interaction-bar [data-choice-value="${option.value}"]`).click())
    }
    await expect(host.locator('.interaction-bar [data-choice-value="target-farm:p1"]')).toBeVisible()
    const persisted = await environment.retainedRoom(roomId)
    await host.reload()
    await expect(host.locator('.interaction-bar [data-choice-value="target-farm:p1"]')).toBeVisible()
    expect(await environment.retainedRoom(roomId)).toEqual(persisted)
    await environment.source.prepare('DELETE FROM beta_access WHERE user_id=?').run(environment.user.id)
    await expect(host.getByText('Your login or Beta access is no longer valid. Return to production to sign in and enter again.')).toBeVisible({ timeout: 35_000 })
    expect(await environment.retainedRoom(roomId)).toEqual(persisted)
    await environment.source.prepare('INSERT INTO beta_access(user_id,granted_at) VALUES(?,?)').run(environment.user.id, Date.now())
    await environment.waitForIdentityEvents()
    await host.close()
    host = await environment.enter(environment.context)
    hostWire = observeGameSocket(host)
    await host.goto(roomUrl)
    await expect(host.locator('.interaction-bar [data-choice-value="target-farm:p1"]')).toBeVisible()
    await chooseTarget('p1')
    await place('p1', '0-4')
    expect(latest().state.players[0]?.resources.wood).toBe(5)
    expect(latest().state.players[0]?.stableTiles).toEqual([{ row: 0, col: 4 }])
    expect(latest().state.players[2]?.stableTiles).toEqual([{ row: 0, col: 2 }])
    expect(latest().state.players[2]?.pastures[0]?.tiles).toEqual([{ row: 0, col: 3 }])
    expect(latest().state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
    expect(latest().state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerRoomsBuiltWood', playerId: 'p1', playerRefs: { owner: 'p3' } }))
    expect(latest().state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerStablesBuilt', playerId: 'p1', playerRefs: { owner: 'p3' } }))
    expect(latest().scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'empty')?.total).toBe(-12)
    expect(latest().scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'empty')?.total).toBe(-10)
    await confirmSwitch(host, hostWire, 1)
    await take(guest, guestWire, 'vegetable-seeds')
    expect(latest().state.players[1]?.resources.vegetable).toBe(1)
  } catch (error) { failure = { error } }
  try {
    await releaseAll([
      async () => { await other?.context.close() },
      () => environment.context.close(), () => environment.browser.close(), () => environment.close(),
    ])
  } catch (error) {
    if (failure) throw new AggregateError([failure.error, error], 'Cooperation browser test and cleanup failed', { cause: error })
    throw error
  }
  if (failure) throw failure.error
})

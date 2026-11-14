import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { testStorageEnvironment } from './_helpers/objects'
import { S3ObjectStore } from '../storage/s3-store'
import { ResourceStore } from '../storage/resource-store'
import { createCard, enterReview, approveCurrentDraft, publish } from '../workshop-drafts'
import { FormalPublicCards } from '../prerelease-public-cards'
import { PrereleasePublicSandbox, configurePrereleasePublicSandbox } from '../prerelease-public-sandbox'
import { getPrereleaseSessions } from '../prerelease-sessions'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'
import { publicCardReference } from '../../shared/contract/public-card-input'
import type { WorkshopPublicCardSnapshot } from '../../shared/contract/workshop-public-cards'
import type { PublicSandboxInputs, PublicSandboxWorkerLease } from '../../shared/contract/public-sandbox'
import { LocalSandboxCore } from '../../client/local-sandbox/worker-core'

const sourceDb = await createTestDatabase(), preDb = await createTestDatabase()
const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`), resources = new ResourceStore(sourceDb, objects)
vi.mock('../db.ts', () => ({ getDb: () => preDb }))
vi.mock('../storage/runtime.ts', () => ({ getResources: () => resources }))
const nativeFetch = fetch, buildId = 'a'.repeat(40), generationId = randomUUID(), sourceCalls: Array<{ path: string; headers: Headers }> = []
let sourceOrigin = '', preOrigin = '', token = '', serial = 20000
let sourceServer: ReturnType<typeof createServer>, preServer: ReturnType<typeof createServer>
const runtime = { buildId, generationId, appOrigin: 'https://pre.example.test', formalAppOrigin: 'https://formal.example.test', formalApiBase: 'https://formal.example.test', targetId: 'prerelease-main' }
const sourceCode = (id: string, name: string) => `const CARD_ID='${id}'; const CARD_DEF=MinorImprovement({id:CARD_ID,name:${JSON.stringify(name)},desc:['Gain 2 food.'],cost:{},vp:0}); const CARD_IMPL={effect:{id:CARD_ID,onBuy:()=>gainLeaf(CARD_ID,{food:2})}}`
async function serve(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) {
  const server = createServer((req, res) => { void handler(req, res).catch(error => { res.writeHead(500).end(JSON.stringify({ error: String(error) })) }) })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing HTTP port')
  return { server, origin: `http://127.0.0.1:${address.port}` }
}
async function published(name: string, code?: string) {
  const id = `CUSTOM_${name}`
  const { prepareWorkshopDraft } = await import('../workshop-draft-validation')
  const prepared = await prepareWorkshopDraft({ cardId: id, cardType: 'minor', name, description: 'Gain two food',
    cardJson: { id, name, card_type: 'minor', deck: 'CUSTOM', number: 0, desc: ['Gain 2 food.'], cost: {}, vp: 0, implemented: true }, effectCode: code ?? sourceCode(id, name), artUrl: `/card-art/${name}.png` })
  if (!prepared.ok) throw new Error(prepared.error)
  const draft = prepared.draft
  await resources.stage(`card-art/${name}.png`, Buffer.from('public-fixed-image'), 'image/png')
  const card = await createCard(sourceDb, { authorId: 'author', draft })
  await enterReview(sourceDb, { cardId: card.id, authorId: 'author', expectedRevision: card.revision, prUrl: `https://github.com/titanxxh/open-agricola/pull/${++serial}`, commitSha: 'approved' })
  await approveCurrentDraft(sourceDb, { cardId: card.id, authorId: 'author', commitSha: 'approved', reviewId: 'review' })
  const version = await publish(sourceDb, { cardId: card.id, authorId: 'author', baseRevision: card.revision })
  return { card, version, id }
}
async function api(path: string, body?: unknown) {
  const response = await new Promise<Response>((resolve, reject) => {
    const outgoing = request(`${preOrigin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: {
      Host: new URL(runtime.appOrigin).host, Origin: runtime.appOrigin, Cookie: `__Host-oa-pre-session=${token}`,
      [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION), 'x-oa-pre-build': buildId, 'x-oa-pre-generation': generationId, 'Content-Type': 'application/json',
    } }, incoming => {
      const chunks: Buffer[] = []; incoming.on('data', chunk => chunks.push(Buffer.from(chunk)))
      incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: { 'Cache-Control': String(incoming.headers['cache-control'] ?? '') } })))
      incoming.on('error', reject)
    })
    outgoing.on('error', reject); outgoing.end(body === undefined ? undefined : JSON.stringify(body))
  })
  return { status: response.status, body: await response.json(), headers: response.headers }
}
beforeAll(async () => {
  await sourceDb.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES('author','author','Author','hash',1)").run()
  const { handleWorkshopPublicCards } = await import('../workshop-public-cards')
  const source = await serve(async (req, res) => { if (!await handleWorkshopPublicCards(req, res, sourceDb)) res.writeHead(404).end() })
  sourceServer = source.server; sourceOrigin = source.origin
  for (const [key, value] of Object.entries({ RELEASE_CHANNEL: 'prerelease', NODE_ENV: 'production', GAME_BUILD_ID: buildId,
    PUBLIC_APP_ORIGIN: runtime.appOrigin, PUBLIC_API_BASE: runtime.appOrigin, FORMAL_APP_ORIGIN: runtime.formalAppOrigin,
    FORMAL_API_BASE: runtime.formalApiBase, PRERELEASE_DATA_GENERATION: generationId, PRERELEASE_TARGET_ID: runtime.targetId,
    PRERELEASE_IDENTITY_SERVICE_KEY: 'fixture-key-at-least-32-bytes-in-length' })) vi.stubEnv(key, value)
  vi.stubGlobal('fetch', async () => Response.json({ ok: true, state: { protocolVersion: 1, channel: 'prerelease', targetOrigin: runtime.appOrigin, generationId,
    grantId: 'g'.repeat(43), account: { kind: 'active', subject: { id: 'author', username: 'author', displayName: 'Author' } },
    source: { kind: 'active', expiresAt: Date.now() + 86_400_000 }, grant: { kind: 'active', expiresAt: Date.now() + 86_400_000 }, betaAccess: true, confirmedAt: Date.now(), validUntil: Date.now() + 30_000 } }))
  const identity = getPrereleaseSessions(); if (!identity) throw new Error('Missing prerelease sessions')
  const begin = await identity.beginHandoff(), params = new URLSearchParams(new URL(begin.formalUrl).hash.slice(1))
  const state = params.get('state'), challenge = params.get('browserChallenge'); if (!state || !challenge) throw new Error('Missing handoff')
  token = (await identity.exchangeHandoff(begin.cookie, { protocolVersion: 1, code: 'c'.repeat(43), state, browserChallenge: challenge, returnTo: `${runtime.formalAppOrigin}/` })).token
  const client = new FormalPublicCards(runtime.formalApiBase, async (url, init) => { const target = new URL(String(url)); sourceCalls.push({ path: target.pathname, headers: new Headers(init?.headers) }); return nativeFetch(sourceOrigin + target.pathname + target.search, init) })
  configurePrereleasePublicSandbox(new PrereleasePublicSandbox(client, runtime))
  const { handlePrereleaseRoute, requirePrereleaseRequest } = await import('../prerelease-routes')
  const { handlePrereleasePublicSandbox } = await import('../prerelease-public-sandbox')
  const { handleGameRoute } = await import('../game-router')
  const pre = await serve(async (req, res) => {
    if (await handlePrereleaseRoute(req, res) || !await requirePrereleaseRequest(req, res)) return
    if (await handlePrereleasePublicSandbox(req, res) || await handleGameRoute(req, res)) return
    res.writeHead(404).end(JSON.stringify({ ok: false }))
  })
  preServer = pre.server; preOrigin = pre.origin
})
afterAll(async () => {
  const { shutdownSandboxSessions } = await import('../game-router'); shutdownSandboxSessions()
  getPrereleaseSessions()?.close(); configurePrereleasePublicSandbox(undefined)
  await Promise.all([sourceServer, preServer].filter(Boolean).map(server => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()) })))
  await objects.clearPrefix(); objects.close(); await sourceDb.close(); await preDb.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
})

it('executes the same immutable dynamic public card through HTTP and browser core with literal resource/log/score parity', async () => {
  const input = await published('PublicParity')
  const fixed = await api('/api/workshop/public-sandbox/v1/inputs', { cardIds: [input.card.id] })
  expect(fixed.status).toBe(200)
  const snapshots: WorkshopPublicCardSnapshot[] = fixed.body.snapshots
  const created = await api('/api/game/new-sandbox', { seed: 42, playerCount: 2, customCardIds: [input.card.id], publicCardBindings: snapshots.map(publicCardReference) })
  expect(created.status).toBe(200); expect(created.body.ok).toBe(true)
  expect(created.body.state.players).toHaveLength(2)
  const before = created.body.state.players[0].resources.food
  const played = await api('/api/game/dev/play-card', { playerIndex: 0, cardId: input.id })
  expect(played.status).toBe(200); expect(played.body.ok).toBe(true)
  expect(played.body.state.players[0].resources.food).toBe(before + 2)
  expect(played.body.state.players[0].minorPlayed).toContain(input.id)
  expect(played.body.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardEffectGain', params: expect.objectContaining({ gain: { food: 2 }, cardId: input.id }) }))
  expect(played.body.scores.map((score: { total: number }) => score.total)).toEqual(created.body.scores.map((score: { total: number }) => score.total))
  const inputs: PublicSandboxInputs = { snapshots, buildId, generationId, contractId: fixed.body.lease.contractId }, config = { cards: [], playerCount: 2, seed: 42, publicInputs: inputs }
  const admission: PublicSandboxWorkerLease = { buildId, generationId, runtimeId: `browser-local:${buildId}`, hashes: snapshots.map(snapshot => snapshot.sha256), wallDeadline: Date.now() + 20_000, monotonicDeadline: performance.timeOrigin + performance.now() + 20_000 }
  const local = new LocalSandboxCore(); local.admit(admission, config)
  const initial = local.init(config, { mode: 'debug', visiblePlayerIds: [] })
  expect(initial.payload.state.players[0]!.resources.food).toBe(before)
  const browser = local.call('devPlayCard', [0, input.id], { mode: 'debug', visiblePlayerIds: [] })
  expect(browser.payload.state.players[0]!.resources.food).toBe(before + 2)
  expect(browser.payload.state.players[0]!.resources).toEqual(played.body.state.players[0].resources)
  expect(browser.payload.interaction).toEqual(played.body.interaction)
  expect(JSON.stringify(browser.payload.scores)).toBe(JSON.stringify(played.body.scores))
  expect(browser.payload.state.log.map(row => ({ key: row.key, params: row.params }))).toEqual(played.body.state.log.map((row: { key: string; params: unknown }) => ({ key: row.key, params: row.params })))
  expect(browser.persist.config.publicInputs?.snapshots).toEqual(snapshots)
  for (const request of sourceCalls) for (const key of ['authorization', 'cookie', 'origin']) expect(request.headers.get(key)).toBeNull()
})

it('allows an existing fixed version after author unpublish, rejects new execution, then pauses known admin disable without advancing a command', async () => {
  const input = await published('PublicLifecycle')
  expect((await api('/api/game/new-sandbox', { seed: 42, playerCount: 2, customCardIds: [input.card.id] })).status).toBe(200)
  const fixed = await api('/api/workshop/public-sandbox/v1/inputs', { cardIds: [input.card.id] }), refs = fixed.body.snapshots.map(publicCardReference)
  const before = await api('/api/game/state')
  await sourceDb.prepare('UPDATE workshop_cards SET live=0 WHERE id=?').run(input.card.id)
  expect((await api('/api/workshop/public-sandbox/v1/status', { inputs: refs })).status).toBe(200)
  const newDenied = await api('/api/workshop/public-sandbox/v1/status', { inputs: refs, newGame: true })
  expect(newDenied.status).toBe(409)
  expect(newDenied.body.code).toBe('public_card_unavailable_new')
  expect((await api('/api/game/new-sandbox', { customCardIds: [input.card.id] })).status).toBe(400)
  expect((await api('/api/game/dev/set-resources', { playerIndex: 0, resources: { wood: 9 } })).status).toBe(200)
  const confirmed = await api('/api/game/state')
  await sourceDb.prepare('UPDATE workshop_public_versions SET disabled_at=1 WHERE card_id=?').run(input.card.id)
  expect((await api('/api/workshop/public-sandbox/v1/status', { inputs: refs })).status).toBe(400)
  const denied = await api('/api/game/dev/play-card', { playerIndex: 0, cardId: input.id })
  expect(denied.status).toBe(503)
  await sourceDb.prepare('UPDATE workshop_public_versions SET disabled_at=NULL WHERE card_id=?').run(input.card.id)
  expect((await api('/api/workshop/public-sandbox/v1/status', { inputs: refs })).status).toBe(200)
  const resumed = await api('/api/game/state')
  expect(resumed.body.state).toEqual(confirmed.body.state)
  expect(resumed.body.state.players[0].minorPlayed).toEqual(before.body.state.players[0].minorPlayed)
})

it('uses the candidate built-in implementation while retaining the public identity lease', async () => {
  const input = await published('PublicBuiltin'), ruleId = 'A008_FoodBasket'
  const version = await sourceDb.prepare('SELECT card_json FROM workshop_card_versions WHERE id=?').get<{ card_json: string }>(input.version.versionId)
  if (!version) throw new Error('Missing approved fixture version')
  const raw: unknown = JSON.parse(version.card_json)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid fixture version')
  await sourceDb.prepare('UPDATE workshop_card_versions SET card_json=? WHERE id=?')
    .run(JSON.stringify({ ...raw, id: ruleId, _code: sourceCode(ruleId, 'Public builtin') }), input.version.versionId)
  const fixed = await api('/api/workshop/public-sandbox/v1/inputs', { cardIds: [input.card.id] })
  const created = await api('/api/game/new-sandbox', { seed: 42, customCardIds: [input.card.id] })
  expect(created.status).toBe(200)
  expect(created.body.customCardsLoaded).toBe(0)
  const played = await api('/api/game/dev/play-card', { playerIndex: 0, cardId: ruleId })
  expect(played.body.state.players[0].resources).toMatchObject({ food: 2, grain: 1, vegetable: 1 })
  const snapshots: WorkshopPublicCardSnapshot[] = fixed.body.snapshots
  const config = { cards: [], playerCount: 2, seed: 42, publicInputs: { snapshots, buildId, generationId, contractId: fixed.body.lease.contractId } }
  const core = new LocalSandboxCore()
  core.admit({ buildId, generationId, runtimeId: `browser-local:${buildId}`, hashes: snapshots.map(snapshot => snapshot.sha256),
    wallDeadline: Date.now() + 20_000, monotonicDeadline: performance.timeOrigin + performance.now() + 20_000 }, config)
  core.init(config, { mode: 'debug', visiblePlayerIds: [] })
  expect(core.call('devPlayCard', [0, ruleId], { mode: 'debug', visiblePlayerIds: [] }).payload.state.players[0]?.resources).toMatchObject({ food: 2, grain: 1, vegetable: 1 })
  await sourceDb.prepare('UPDATE workshop_public_versions SET disabled_at=1 WHERE card_id=?').run(input.card.id)
  expect((await api('/api/workshop/public-sandbox/v1/status', { inputs: snapshots.map(publicCardReference) })).status).toBe(400)
  expect((await api('/api/game/state')).status).toBe(503)
})

it('rejects private version/source injection and every Workshop write even for the projected author', async () => {
  const counts = async () => Promise.all(['workshop_cards', 'workshop_card_versions', 'sandbox_cards', 'sandbox_settings'].map(async table => ({ table, source: await sourceDb.prepare(`SELECT count(*)::int AS n FROM ${table}`).get(), pre: await preDb.prepare(`SELECT count(*)::int AS n FROM ${table}`).get() })))
  const before = await counts()
  for (const path of ['/api/github/webhook', '/api/workshop/cards', '/api/workshop/mine', '/api/workshop/sandbox', '/api/workshop/cards/x/workspace', '/api/workshop/cards/x/versions/y', '/api/workshop/art', '/api/workshop/validate-code', '/api/workshop/cards/x/publish', '/api/workshop/cards/x/like', '/api/workshop/cards/x/sandbox-pass']) {
    expect((await api(path, { source: 'PRIVATE', customCardVersions: [{ cardId: 'x', versionId: 'private' }] })).status, path).toBe(403)
    expect((await api(path)).status, path).toBe(403)
  }
  expect((await api('/api/game/new-sandbox', { customCardVersions: [{ cardId: 'x', versionId: 'private' }] })).status).toBe(400)
  expect((await api('/api/game/new-sandbox', { source: 'PRIVATE' })).status).toBe(400)
  expect((await api('/api/game/new', { customCardIds: ['private'], source: 'PRIVATE' })).status).toBe(400)
  const oversized = await api('/api/game/new-sandbox', { source: 'x'.repeat(16_385) })
  expect(oversized.status).toBe(400)
  expect(oversized.body.error).toBe('Public sandbox request is too large')
  expect(await counts()).toEqual(before)
  expect((await api('/api/game/new', {})).status).toBe(200)
})


it('rejects a whole selection when an authoritative public input needs an unsupported candidate capability', async () => {
  const supported = await published('PublicSupported'), unsupported = await published('PublicUnsupported')
  const initial = await api('/api/game/new-sandbox', { seed: 42, customCardIds: [supported.card.id] })
  expect(initial.status).toBe(200)
  await sourceDb.prepare("UPDATE workshop_card_versions SET card_json=jsonb_set(card_json::jsonb,'{_code}',to_jsonb(?::text))::text WHERE id=?")
    .run("const CARD_ID='CUSTOM_PublicUnsupported';const CARD_IMPL={effect:{id:CARD_ID,unsupportedCapability:()=>1}}", unsupported.version.versionId)
  const denied = await api('/api/game/new-sandbox', { seed: 42, customCardIds: [supported.card.id, unsupported.card.id] })
  expect(denied.status).toBe(400)
  expect(denied.body.error).toContain('unsupported')
  const retained = await api('/api/game/state')
  expect(retained.body.state).toEqual(initial.body.state)
})

it.each([{ modifiers: { type: 'bonus' } }, { modifier: 1 }, { modifiers: [null] }])('rejects malformed public registration metadata in HTTP and browser execution: %j', async metadata => {
  const valid = await published(`MetadataValid${++serial}`), invalid = await published(`MetadataInvalid${++serial}`)
  const initial = await api('/api/game/new-sandbox', { seed: 42, customCardIds: [valid.card.id] })
  const version = await sourceDb.prepare('SELECT card_json FROM workshop_card_versions WHERE id=?').get<{ card_json: string }>(invalid.version.versionId)
  if (!version) throw new Error('Missing fixture version')
  await sourceDb.prepare('UPDATE workshop_card_versions SET card_json=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(version.card_json), ...metadata }), invalid.version.versionId)
  const fixed = await api('/api/workshop/public-sandbox/v1/inputs', { cardIds: [valid.card.id, invalid.card.id] })
  expect(fixed.status).toBe(200)
  const snapshots: WorkshopPublicCardSnapshot[] = fixed.body.snapshots
  const denied = await api('/api/game/new-sandbox', { seed: 42, customCardIds: [valid.card.id, invalid.card.id], publicCardBindings: snapshots.map(publicCardReference) })
  expect(denied.status).toBe(400)
  expect(denied.body.error).toContain(invalid.id)
  expect(denied.body.error).toContain('modifier')
  expect((await api('/api/game/state')).body.state).toEqual(initial.body.state)
  const config = { cards: [], playerCount: 2, seed: 42, publicInputs: { snapshots, buildId, generationId, contractId: fixed.body.lease.contractId } }
  const core = new LocalSandboxCore()
  core.admit({ buildId, generationId, runtimeId: `browser-local:${buildId}`, hashes: snapshots.map(snapshot => snapshot.sha256), wallDeadline: Date.now() + 20_000, monotonicDeadline: performance.timeOrigin + performance.now() + 20_000 }, config)
  expect(() => core.init(config, { mode: 'debug', visiblePlayerIds: [] })).toThrow('modifier')
  expect(() => core.call('getState', [], { mode: 'debug', visiblePlayerIds: [] })).toThrow()
})

it('preserves valid legacy modifier metadata in both executors', async () => {
  const input = await published('PublicLegacyModifier')
  const modifier = { type: 'bonus', cardId: input.id, appliesTo: ['construct'], discount: { wood: 1 } }
  const version = await sourceDb.prepare('SELECT card_json FROM workshop_card_versions WHERE id=?').get<{ card_json: string }>(input.version.versionId)
  if (!version) throw new Error('Missing fixture version')
  await sourceDb.prepare('UPDATE workshop_card_versions SET card_json=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(version.card_json), modifiers: [modifier] }), input.version.versionId)
  const fixed = await api('/api/workshop/public-sandbox/v1/inputs', { cardIds: [input.card.id] })
  expect((await api('/api/game/new-sandbox', { seed: 42, customCardIds: [input.card.id] })).status).toBe(200)
  expect((await api('/api/game/dev/play-card', { playerIndex: 0, cardId: input.id })).body.state.players[0].activeModifiers).toContainEqual(modifier)
  const snapshots: WorkshopPublicCardSnapshot[] = fixed.body.snapshots
  const config = { cards: [], playerCount: 2, seed: 42, publicInputs: { snapshots, buildId, generationId, contractId: fixed.body.lease.contractId } }
  const core = new LocalSandboxCore()
  core.admit({ buildId, generationId, runtimeId: `browser-local:${buildId}`, hashes: snapshots.map(snapshot => snapshot.sha256), wallDeadline: Date.now() + 20_000, monotonicDeadline: performance.timeOrigin + performance.now() + 20_000 }, config)
  core.init(config, { mode: 'debug', visiblePlayerIds: [] })
  expect(core.call('devPlayCard', [0, input.id], { mode: 'debug', visiblePlayerIds: [] }).payload.state.players[0]?.activeModifiers).toContainEqual(modifier)
})

it('discards a real custom worker reply after authorization ends and restores only the last accepted state', async () => {
  const input = await published('PublicCommitFence'), { getPrereleasePublicSandbox } = await import('../prerelease-public-sandbox')
  const source = getPrereleasePublicSandbox(), scope = await source.create([input.card.id]), cards = await source.compile(scope)
  const { createIsolatedGameSession } = await import('../game/custom-session-executor')
  const game = createIsolatedGameSession(42, cards, { playerCount: 2 })
  if (!game.executor) throw new Error('Expected actual executable worker')
  try {
    const before = await game.executor.execute('getState', [])
    let admissions = 0
    await expect(game.executor.execute('devPlayCard', [0, input.id], () => { if (++admissions >= 2) throw new Error('Source access ended') })).rejects.toThrow('Source access ended')
    expect(game.session.getStateForRead().players[0]!.minorPlayed).not.toContain(input.id)
    expect(game.session.getStateForRead().players[0]!.resources.food).toBe(before.state.players[0]!.resources.food)
    const restored = await game.executor.execute('getState', [])
    expect(restored.state.players[0]!.minorPlayed).not.toContain(input.id)
    expect(restored.state.players[0]!.resources.food).toBe(before.state.players[0]!.resources.food)
    expect(restored.state.log).toEqual(before.state.log)
  } finally { game.executor.dispose(); game.session.dispose() }
})

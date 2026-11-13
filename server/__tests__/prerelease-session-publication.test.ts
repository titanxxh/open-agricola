import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as database from '../db'
import { getSessionByToken } from '../auth'
import { PostgresDatabase } from '../database/postgres'
import { PrereleaseSessions, getPrereleaseSessions } from '../prerelease-sessions'
import { trackPrereleaseSocket } from '../prerelease-access'
import { Broadcaster } from '../connection/broadcaster'
import { GameSession } from '../game/authoritative-session'
import { RoomDirectory } from '../game/room-directory'
import type { Room } from '../game/room'
import { BROWSER_WS_PROTOCOL } from '../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_PROTOCOL_PREFIX, PRERELEASE_GENERATION_PROTOCOL_PREFIX } from '../../shared/contract/prerelease-runtime'
import type { PrereleaseIdentityEvent, PrereleaseIdentityState } from '../../shared/contract/prerelease-identity'
import { createTestDatabase, getTestDatabaseUrl } from './_helpers/postgres'

let db: PostgresDatabase, other: PostgresDatabase, service: PrereleaseSessions, consumer: PrereleaseSessions
let token = '', statusCalls = 0, expiresAt = 0, socket: WebSocket | undefined, session: GameSession | undefined
let events: PrereleaseIdentityEvent[] = [], betaAccess = true
let publish: () => Promise<void>, frames: string[]

beforeEach(async () => {
  db = await createTestDatabase()
  const schema = (await db.prepare('SELECT current_schema() AS name').get<{ name: string }>())!.name
  other = new PostgresDatabase({ connectionString: getTestDatabaseUrl(), schema, max: 3 })
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  const generation = randomUUID(), buildId = 'a'.repeat(40)
  for (const [key, value] of Object.entries({ RELEASE_CHANNEL: 'prerelease', NODE_ENV: 'production', GAME_BUILD_ID: buildId,
    PUBLIC_APP_ORIGIN: 'https://pre.example.test', PUBLIC_API_BASE: 'https://pre.example.test', FORMAL_APP_ORIGIN: 'https://formal.example.test',
    FORMAL_API_BASE: 'https://formal-api.example.test', PRERELEASE_DATA_GENERATION: generation, PRERELEASE_TARGET_ID: 'prerelease-main',
    PRERELEASE_IDENTITY_SERVICE_KEY: 'publication-fixture-key-'.repeat(2) })) vi.stubEnv(key, value)
  events = []; betaAccess = true; statusCalls = 0; frames = []
  expiresAt = Date.now() + 86_400_000
  const state = (): PrereleaseIdentityState => ({ protocolVersion: 1, channel: 'prerelease', targetOrigin: 'https://pre.example.test', generationId: generation,
    grantId: 'g'.repeat(43), account: { kind: 'active', subject: { id: 'publication-user', username: 'publication_user', displayName: 'Publication farmer' } },
    source: { kind: 'active', expiresAt }, grant: { kind: 'active', expiresAt }, betaAccess, confirmedAt: Date.now(), validUntil: Date.now() + 30_000 })
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    if (String(input).endsWith('/status')) statusCalls++
    return Response.json({ ok: true, state: state() })
  }))
  service = getPrereleaseSessions()!
  const start = await service.beginHandoff(), params = new URLSearchParams(new URL(start.formalUrl).hash.slice(1))
  const issued = await service.exchangeHandoff(start.cookie, { protocolVersion: 1, code: 'c'.repeat(43), state: params.get('state')!,
    browserChallenge: params.get('browserChallenge')!, returnTo: 'https://formal.example.test/' })
  token = issued.token
  consumer = new PrereleaseSessions({ db: other, runtime: service.runtime, authority: {
    exchange: async () => state(), status: async () => state(), events: async () => events,
    acknowledge: async () => { events = [] },
  }, eraseAccount: async userId => { await other.prepare('DELETE FROM users WHERE id=?').run(userId) } })
  socket = new WebSocket(null, undefined, {})
  let readyState: number = WebSocket.OPEN
  vi.spyOn(socket, 'readyState', 'get').mockImplementation(() => readyState)
  vi.spyOn(socket, 'send').mockImplementation(data => { frames.push(String(data)) })
  vi.spyOn(socket, 'close').mockImplementation(() => { readyState = WebSocket.CLOSED; socket!.emit('close', 1008, Buffer.from('closed')) })
  const request = new IncomingMessage(new Socket())
  request.headers = { host: 'pre.example.test', origin: 'https://pre.example.test', cookie: `__Host-oa-pre-session=${token}`,
    'sec-websocket-protocol': [BROWSER_WS_PROTOCOL, PRERELEASE_BUILD_PROTOCOL_PREFIX + buildId, PRERELEASE_GENERATION_PROTOCOL_PREFIX + generation].join(',') }
  trackPrereleaseSocket(socket, request)
  const directory = new RoomDirectory(db)
  await directory.register('publication-node', 'http://127.0.0.1:1', 'publication', 5)
  await directory.activate('publication-node')
  await db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES('publication-room','playing',1,1)").run()
  const route = await directory.claim('publication-room', 'publication-node')
  session = new GameSession(961, undefined, { playerCount: 2 })
  const room: Room = { id: 'publication-room', session, owner: route.owner, players: [{ ws: socket, playerIndex: 0, name: 'Farmer', userId: issued.user.id }],
    maxPlayers: 2, version: 0, status: 'playing' }
  const broadcaster = new Broadcaster(directory)
  broadcaster.authenticate(socket, token)
  publish = async () => { await broadcaster.sendStateTo(socket!, room, session!.getState(), 'private-publication') }
})

afterEach(async () => {
  socket?.close(); socket = undefined
  session?.dispose(); session = undefined
  service?.close(); consumer?.close()
  await other?.close(); await db?.close()
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks()
})

async function revoke(kind: string) {
  if (kind === 'logout') { await consumer.revoke(token); return }
  betaAccess = false
  events = [kind === 'source_revoked'
    ? { id: randomUUID(), kind: 'source_revoked', userId: 'publication-user', grantId: 'g'.repeat(43), createdAt: Date.now() }
    : { id: randomUUID(), kind: kind === 'account_deleted' ? 'account_deleted' : 'beta_changed', userId: 'publication-user', grantId: null, createdAt: Date.now() }]
  await consumer.processEvents()
}

it.each(['logout', 'beta_changed', 'source_revoked', 'account_deleted'])('holds %s until the native Room publication transaction completes', async kind => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let pid = 0, committed = false, revocation: Promise<void> | undefined
  const publication = db.transaction(async () => {
    pid = (await db.prepare('SELECT pg_backend_pid() AS pid').get<{ pid: number }>())!.pid
    await publish()
    entered.resolve(); await release.promise
  })()
  try {
    await entered.promise
    expect(frames.map(raw => JSON.parse(raw).type)).toEqual(['stateUpdate'])
    revocation = revoke(kind).then(() => { committed = true })
    await vi.waitFor(async () => {
      const blocked = await db.prepare('SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) LIMIT 1').get(pid)
      expect(committed || !!blocked).toBe(true)
    })
    expect(committed).toBe(false)
    release.resolve(); await publication; await revocation
    expect(committed).toBe(true)
    await publish()
    expect(frames).toHaveLength(1)
    expect(socket!.readyState).toBe(WebSocket.CLOSED)
  } finally { release.resolve(); await Promise.allSettled([publication, revocation]) }
})

it.each(['logout', 'beta_changed', 'source_revoked', 'account_deleted'])('waits for an already-started %s and publishes no private snapshot after it commits', async kind => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let pid = 0, published = false, publication: Promise<void> | undefined
  const revocation = other.transaction(async () => {
    pid = (await other.prepare('SELECT pg_backend_pid() AS pid').get<{ pid: number }>())!.pid
    await revoke(kind)
    entered.resolve(); await release.promise
  })()
  try {
    await entered.promise
    publication = publish().then(() => { published = true })
    await vi.waitFor(async () => {
      const blocked = await other.prepare('SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) LIMIT 1').get(pid)
      expect(published || !!blocked).toBe(true)
    })
    expect(published).toBe(false)
    release.resolve(); await revocation; await publication
    expect(frames).toEqual([])
    expect(socket!.readyState).toBe(WebSocket.CLOSED)
  } finally { release.resolve(); await Promise.allSettled([revocation, publication]) }
})

it.each(['share', 'update'] as const)('uses the supplied database transaction and %s lock without global cache changes', async lock => {
  const before = service.status(token)
  await expect(other.transaction(async () => {
    await other.prepare('DELETE FROM prerelease_sessions').run()
    expect(await getSessionByToken(token, { db: other, lock })).toBeNull()
    throw new Error('rollback fixture deletion')
  })()).rejects.toThrow('rollback fixture deletion')
  expect(service.status(token)).toBe(before)
  expect(statusCalls).toBe(0)
})

it('uses an explicit time for freshness and absolute expiry without changing the global lease', async () => {
  const before = service.status(token)
  const row = await db.prepare('SELECT identity_state FROM prerelease_sessions').get<{ identity_state: string }>()
  const state: PrereleaseIdentityState = JSON.parse(row!.identity_state)
  expect(await getSessionByToken(token, { db, now: state.validUntil })).toBeNull()
  expect(await getSessionByToken(token, { db, now: expiresAt })).toBeNull()
  expect(service.status(token)).toBe(before)
  expect(statusCalls).toBe(0)
})

it('preserves an exclusive update lock on the supplied client until its transaction ends', async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let pid = 0, read = false, reading: Promise<unknown> | undefined
  const updating = other.transaction(async () => {
    pid = (await other.prepare('SELECT pg_backend_pid() AS pid').get<{ pid: number }>())!.pid
    expect(await getSessionByToken(token, { db: other, lock: 'update' })).not.toBeNull()
    entered.resolve(); await release.promise
  })()
  try {
    await entered.promise
    reading = db.transaction(async () => {
      const value = await getSessionByToken(token, { db, lock: 'share' })
      read = true; return value
    })()
    await vi.waitFor(async () => {
      const blocked = await other.prepare('SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) LIMIT 1').get(pid)
      expect(read || !!blocked).toBe(true)
    })
    expect(read).toBe(false)
    release.resolve(); await updating
    expect(await reading).not.toBeNull()
  } finally { release.resolve(); await Promise.allSettled([updating, reading]) }
})

it('does not refresh or cache stale persisted state while holding a publication lock', async () => {
  await db.prepare("UPDATE prerelease_sessions SET identity_state=jsonb_set(identity_state::jsonb,'{validUntil}','0')::text").run()
  const before = service.status(token)
  await db.transaction(async () => {
    expect(await getSessionByToken(token, { db, lock: 'share' })).toBeNull()
  })()
  expect(statusCalls).toBe(0)
  expect(service.status(token)).toBe(before)
  expect(await getSessionByToken(token)).not.toBeNull()
  expect(statusCalls).toBe(1)
})

it('uses the current time after waiting for a row lock past the persisted deadline', async () => {
  const stateRow = await db.prepare('SELECT identity_state FROM prerelease_sessions').get<{ identity_state: string }>()
  const state: PrereleaseIdentityState = JSON.parse(stateRow!.identity_state)
  let now = state.validUntil - 1
  const unavailable = async (): Promise<never> => { throw new Error('Locked reads must not refresh identity') }
  const reader = new PrereleaseSessions({ db, runtime: service.runtime, now: () => now,
    authority: { exchange: unavailable, status: unavailable, events: async () => [], acknowledge: async () => {} } })
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let pid = 0, read = false, reading: Promise<unknown> | undefined
  const updating = other.transaction(async () => {
    pid = (await other.prepare('SELECT pg_backend_pid() AS pid').get<{ pid: number }>())!.pid
    await other.prepare('SELECT 1 FROM prerelease_sessions FOR UPDATE').get()
    entered.resolve(); await release.promise
  })()
  try {
    await entered.promise
    reading = db.transaction(async () => {
      const value = await reader.readPersisted(token, { db, lock: 'share' })
      read = true; return value
    })()
    await vi.waitFor(async () => {
      const blocked = await other.prepare('SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) LIMIT 1').get(pid)
      expect(read || !!blocked).toBe(true)
    })
    expect(read).toBe(false)
    now = state.validUntil
    release.resolve(); await updating
    expect(await reading).toBeNull()
  } finally { release.resolve(); await Promise.allSettled([updating, reading]); reader.close() }
})

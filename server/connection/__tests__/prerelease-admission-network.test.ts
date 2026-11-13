import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { afterEach, expect, it, vi } from 'vitest'
import { BROWSER_WS_PROTOCOL } from '../../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_PROTOCOL_PREFIX, PRERELEASE_GENERATION_PROTOCOL_PREFIX } from '../../../shared/contract/prerelease-runtime'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'
import type { PrereleaseIdentityState } from '../../../shared/contract/prerelease-identity'
import { createSoloRecoveryHost } from '../../__tests__/_helpers/solo-recovery-network'
import { enqueueRoomTask } from '../../game/room-queue'
import { PrereleaseSessions } from '../../prerelease-sessions'

const fixture = vi.hoisted(() => {
  const runtime = { buildId: 'a'.repeat(40), generationId: '11111111-2222-4333-8444-555555555555', appOrigin: '',
    formalAppOrigin: 'https://formal.example.test', formalApiBase: 'https://api.example.test', targetId: 'prerelease-main' }
  let now = 0
  return { runtime, now: () => now, advance: (value: number) => { now = value }, reset: () => { now = 0 } }
})
vi.mock('../../prerelease-sessions', async importOriginal => ({ ...await importOriginal<typeof import('../../prerelease-sessions')>(),
  getPrereleaseSessions: () => process.env.RELEASE_CHANNEL === 'prerelease' ? service : undefined,
  readPrereleaseRuntime: () => process.env.RELEASE_CHANNEL === 'prerelease' ? fixture.runtime : undefined }))

let host: Awaited<ReturnType<typeof createSoloRecoveryHost>> | undefined
let service: PrereleaseSessions | undefined, token = ''
const sockets: WebSocket[] = []
let releaseQueue: (() => void) | undefined
afterEach(async () => {
  releaseQueue?.(); releaseQueue = undefined
  for (const socket of sockets.splice(0)) if (socket.readyState !== WebSocket.CLOSED) { const closed = once(socket, 'close'); socket.close(); await closed }
  try { await host?.close() } finally { host = undefined; service?.close(); service = undefined; token = ''; fixture.reset(); vi.unstubAllEnvs(); vi.restoreAllMocks() }
}, 30000)

function socket(cookie: string, buildId = fixture.runtime.buildId): WebSocket {
  if (!host) throw new Error('Host missing')
  const value = new WebSocket(host.runtime().url, [BROWSER_WS_PROTOCOL, PRERELEASE_BUILD_PROTOCOL_PREFIX + buildId,
    PRERELEASE_GENERATION_PROTOCOL_PREFIX + fixture.runtime.generationId], { headers: { Origin: fixture.runtime.appOrigin, Cookie: cookie } })
  sockets.push(value)
  return value
}

async function prepare() {
  fixture.runtime.buildId = 'a'.repeat(40)
  host = await createSoloRecoveryHost()
  const created = await host.create()
  await created.peer.close()
  fixture.runtime.appOrigin = host.runtime().url.replace('ws:', 'https:').replace('/ws', '')
  vi.stubEnv('PUBLIC_APP_ORIGIN', fixture.runtime.appOrigin)
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  await host.db.prepare('DELETE FROM sessions WHERE user_id=?').run(host.user.id)
  await host.db.prepare(`UPDATE users SET identity_origin='external',password_hash=NULL,password_updated_at=NULL,
    email=NULL,email_verified_at=NULL WHERE id=?`).run(host.user.id)
  const state: PrereleaseIdentityState = { protocolVersion: 1, channel: 'prerelease', targetOrigin: fixture.runtime.appOrigin,
    generationId: fixture.runtime.generationId, grantId: 'g'.repeat(43), account: { kind: 'active', subject: {
      id: host.user.id, username: host.user.username, displayName: host.user.displayName } },
    source: { kind: 'active', expiresAt: 700000 }, grant: { kind: 'active', expiresAt: 700000 }, betaAccess: true, confirmedAt: 0, validUntil: 30000 }
  service = new PrereleaseSessions({ db: host.db, runtime: fixture.runtime, now: fixture.now,
    authority: { exchange: async () => state, status: async () => state, events: async () => [], acknowledge: async () => {} } })
  const pending = await service.beginHandoff(), params = new URLSearchParams(new URL(pending.formalUrl).hash.slice(1))
  token = (await service.exchangeHandoff(pending.cookie, { protocolVersion: 1, code: 'c'.repeat(43), state: params.get('state')!,
    browserChallenge: params.get('browserChallenge')!, returnTo: `${fixture.runtime.formalAppOrigin}/` })).token
  return { roomId: created.state.roomId, before: await host.runtime().persistence.load(created.state.roomId), head: await host.runtime().persistence.loadReplayHead(created.state.roomId) }
}

it('rejects foreign cookies and stale application bindings at the actual upgrade before loading game data', async () => {
  const created = await prepare()
  for (const [cookie, build, expected] of [
    ['__Host-oa-session=formal; oa_dev_session=developer', fixture.runtime.buildId, 401],
    [`__Host-oa-pre-session=${token}`, 'c'.repeat(40), 426],
  ] satisfies [string, string, number][]) {
    const value = socket(cookie, build)
    const response = new Promise<number>((resolve, reject) => {
      value.once('unexpected-response', (_request, result) => { result.resume(); value.terminate(); resolve(result.statusCode ?? 0) })
      value.once('open', () => reject(new Error('Unauthorized upgrade opened')))
      value.on('error', () => {})
    })
    expect(await response).toBe(expected)
  }
  expect(await host!.runtime().persistence.load(created.roomId)).toEqual(created.before)
  expect(await host!.runtime().persistence.loadReplayHead(created.roomId)).toEqual(created.head)
})

it('rechecks a queued write after thirty seconds and closes access without changing confirmed state or seats', async () => {
  const created = await prepare()
  const value = socket(`__Host-oa-pre-session=${token}`)
  const events: ServerEvent[] = []
  value.on('message', raw => { const event: ServerEvent = JSON.parse(raw.toString()); events.push(event) })
  await once(value, 'open')
  value.send(JSON.stringify({ type: 'joinRoom', roomId: created.roomId, intent: 'resume', requestId: 'resume' }))
  await vi.waitFor(() => expect(events.some(event => event.type === 'stateUpdate')).toBe(true))
  value.send(JSON.stringify({ type: 'getCommandScope', requestId: 'scope' }))
  await vi.waitFor(() => expect(events.some(event => event.type === 'commandScope')).toBe(true))
  const scope = events.find((event): event is Extract<ServerEvent, { type: 'commandScope' }> => event.type === 'commandScope')!
  const room = host!.runtime().backend.registry.get(created.roomId)!
  const seats = structuredClone(room.seatOwners)
  const before = await host!.runtime().persistence.load(created.roomId)
  const stateBefore = JSON.stringify(room.session.state)
  const requestsBefore = await host!.db.prepare('SELECT COUNT(*) AS count FROM command_requests').get()
  const blocked = enqueueRoomTask(room, () => new Promise<void>(resolve => { releaseQueue = resolve }))
  await vi.waitFor(() => expect(releaseQueue).toBeTypeOf('function'))
  value.send(JSON.stringify({ type: 'action', spaceId: 'day-laborer', requestId: 'late-action',
    commandContext: { scopeId: scope.scope.scopeId, commandId: randomUUID(), roomId: room.id, expectedVersion: room.version } }))
  await new Promise(resolve => setTimeout(resolve, 30))
  fixture.advance(30000)
  const closed = once(value, 'close')
  releaseQueue!(); await blocked
  const [closeCode, closeReason] = await closed
  expect(closeCode).toBe(1008)
  expect(closeReason.toString()).toBe('prerelease_access_paused')
  expect(await host!.runtime().persistence.load(created.roomId)).toEqual(before)
  expect(JSON.stringify(room.session.state)).toBe(stateBefore)
  expect(await host!.runtime().persistence.loadReplayHead(created.roomId)).toEqual(created.head)
  expect(room.seatOwners).toEqual(seats)
  expect(await host!.db.prepare('SELECT COUNT(*) AS count FROM command_requests').get()).toEqual(requestsBefore)
  expect(events.filter(event => 'requestId' in event && event.requestId === 'late-action')).toEqual([])
})

it('stops idle access and refuses a direct publication at the absolute lease deadline', async () => {
  const created = await prepare()
  const value = socket(`__Host-oa-pre-session=${token}`)
  const events: ServerEvent[] = []
  value.on('message', raw => { const event: ServerEvent = JSON.parse(raw.toString()); events.push(event) })
  await once(value, 'open')
  value.send(JSON.stringify({ type: 'joinRoom', roomId: created.roomId, intent: 'resume' }))
  await vi.waitFor(() => expect(events.some(event => event.type === 'stateUpdate')).toBe(true))
  const room = host!.runtime().backend.registry.get(created.roomId)!
  const connection = room.players.find(player => player.userId === host!.user.id)!.ws
  const closed = once(value, 'close')
  fixture.advance(30000)
  host!.runtime().backend.broadcaster.sendTo(connection, { type: 'error', error: 'private publication', requestId: 'expired-publication' })
  const [closeCode, closeReason] = await closed
  expect(closeCode).toBe(1008)
  expect(closeReason.toString()).toBe('prerelease_access_paused')
  expect(events.some(event => 'requestId' in event && event.requestId === 'expired-publication')).toBe(false)
  expect(await host!.runtime().persistence.loadReplayHead(created.roomId)).toEqual(created.head)
  expect(room.seatOwners?.some(seat => seat.userId === host!.user.id)).toBe(true)
})

it('announces a known revocation immediately with the client admission code and retains the seat', async () => {
  const created = await prepare()
  const value = socket(`__Host-oa-pre-session=${token}`)
  const events: ServerEvent[] = []
  value.on('message', raw => { const event: ServerEvent = JSON.parse(raw.toString()); events.push(event) })
  await once(value, 'open')
  value.send(JSON.stringify({ type: 'joinRoom', roomId: created.roomId, intent: 'resume' }))
  await vi.waitFor(() => expect(events.some(event => event.type === 'stateUpdate')).toBe(true))
  const room = host!.runtime().backend.registry.get(created.roomId)!
  const connection = room.players.find(player => player.userId === host!.user.id)!.ws
  const closed = once(value, 'close')
  await service!.revoke(token)
  expect(connection.readyState).toBe(WebSocket.CLOSING)
  const [code, reason] = await closed
  expect(code).toBe(1008)
  expect(reason.toString()).toBe('prerelease_access_expired')
  expect(room.seatOwners?.some(seat => seat.userId === host!.user.id)).toBe(true)
  expect(await host!.runtime().persistence.loadReplayHead(created.roomId)).toEqual(created.head)
})

it('announces changed application identity through the same typed close contract', async () => {
  const created = await prepare()
  const value = socket(`__Host-oa-pre-session=${token}`)
  const events: ServerEvent[] = []
  value.on('message', raw => { const event: ServerEvent = JSON.parse(raw.toString()); events.push(event) })
  await once(value, 'open')
  value.send(JSON.stringify({ type: 'joinRoom', roomId: created.roomId, intent: 'resume' }))
  await vi.waitFor(() => expect(events.some(event => event.type === 'stateUpdate')).toBe(true))
  const room = host!.runtime().backend.registry.get(created.roomId)!
  const connection = room.players.find(player => player.userId === host!.user.id)!.ws
  const closed = once(value, 'close')
  fixture.runtime.buildId = 'd'.repeat(40)
  host!.runtime().backend.broadcaster.sendTo(connection, { type: 'error', error: 'private publication', requestId: 'old-app' })
  const [code, reason] = await closed
  expect(code).toBe(1008)
  expect(reason.toString()).toBe('prerelease_runtime_changed')
  expect(events.some(event => 'requestId' in event && event.requestId === 'old-app')).toBe(false)
})

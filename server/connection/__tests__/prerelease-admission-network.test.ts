import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { afterEach, expect, it, vi } from 'vitest'
import { BROWSER_WS_PROTOCOL } from '../../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_PROTOCOL_PREFIX, PRERELEASE_GENERATION_PROTOCOL_PREFIX } from '../../../shared/contract/prerelease-runtime'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'
import { createSoloRecoveryHost } from '../../__tests__/_helpers/solo-recovery-network'
import { enqueueRoomTask } from '../../game/room-queue'

const fixture = vi.hoisted(() => {
  const runtime = { buildId: 'a'.repeat(40), generationId: '11111111-2222-4333-8444-555555555555', appOrigin: '',
    formalAppOrigin: 'https://formal.example.test', formalApiBase: 'https://api.example.test', targetId: 'prerelease-main' }
  const user = { id: '', username: 'farmer', displayName: 'Farmer', isAdmin: false }
  let now = 0
  return { runtime, user, advance: (value: number) => { now = value },
    service: { runtime,
      resolve: async (token: string) => token === 'pre-only' && now < 30000 ? { user, expiresAt: 700000, validUntil: 30000 } : null,
      cachedAuthorized: (token: string, binding?: { buildId?: string; generationId?: string }) => token === 'pre-only' && now < 30000
        && (!binding?.buildId || binding.buildId === runtime.buildId) && (!binding?.generationId || binding.generationId === runtime.generationId),
      status: () => 'paused', subscribeInvalidation: () => () => {},
    } }
})
vi.mock('../../prerelease-sessions', () => ({ getPrereleaseSessions: () => process.env.RELEASE_CHANNEL === 'prerelease' ? fixture.service : undefined,
  readPrereleaseRuntime: () => process.env.RELEASE_CHANNEL === 'prerelease' ? fixture.runtime : undefined }))

let host: Awaited<ReturnType<typeof createSoloRecoveryHost>> | undefined
const sockets: WebSocket[] = []
let releaseQueue: (() => void) | undefined
afterEach(async () => {
  releaseQueue?.(); releaseQueue = undefined
  for (const socket of sockets.splice(0)) if (socket.readyState !== WebSocket.CLOSED) { const closed = once(socket, 'close'); socket.close(); await closed }
  try { await host?.close() } finally { host = undefined; fixture.advance(0); vi.unstubAllEnvs(); vi.restoreAllMocks() }
}, 30000)

function socket(cookie: string, buildId = fixture.runtime.buildId): WebSocket {
  if (!host) throw new Error('Host missing')
  const value = new WebSocket(host.runtime().url, [BROWSER_WS_PROTOCOL, PRERELEASE_BUILD_PROTOCOL_PREFIX + buildId,
    PRERELEASE_GENERATION_PROTOCOL_PREFIX + fixture.runtime.generationId], { headers: { Origin: fixture.runtime.appOrigin, Cookie: cookie } })
  sockets.push(value)
  return value
}

async function prepare() {
  host = await createSoloRecoveryHost()
  const created = await host.create()
  await created.peer.close()
  fixture.user.id = host.user.id
  fixture.runtime.appOrigin = host.runtime().url.replace('ws:', 'https:').replace('/ws', '')
  vi.stubEnv('PUBLIC_APP_ORIGIN', fixture.runtime.appOrigin)
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  return { roomId: created.state.roomId, before: await host.runtime().persistence.load(created.state.roomId), head: await host.runtime().persistence.loadReplayHead(created.state.roomId) }
}

it('rejects foreign cookies and stale application bindings at the actual upgrade before loading game data', async () => {
  const created = await prepare()
  for (const [cookie, build, expected] of [
    ['__Host-oa-session=formal; oa_dev_session=developer', fixture.runtime.buildId, 401],
    ['__Host-oa-pre-session=pre-only', 'c'.repeat(40), 426],
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
  const value = socket('__Host-oa-pre-session=pre-only')
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
  await closed
  expect(await host!.runtime().persistence.load(created.roomId)).toEqual(before)
  expect(JSON.stringify(room.session.state)).toBe(stateBefore)
  expect(await host!.runtime().persistence.loadReplayHead(created.roomId)).toEqual(created.head)
  expect(room.seatOwners).toEqual(seats)
  expect(await host!.db.prepare('SELECT COUNT(*) AS count FROM command_requests').get()).toEqual(requestsBefore)
  expect(events.filter(event => 'requestId' in event && event.requestId === 'late-action')).toEqual([])
})

it('stops idle access and refuses a direct publication at the absolute lease deadline', async () => {
  const created = await prepare()
  const value = socket('__Host-oa-pre-session=pre-only')
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
  await closed
  expect(events.some(event => 'requestId' in event && event.requestId === 'expired-publication')).toBe(false)
  expect(await host!.runtime().persistence.loadReplayHead(created.roomId)).toEqual(created.head)
  expect(room.seatOwners?.some(seat => seat.userId === host!.user.id)).toBe(true)
})

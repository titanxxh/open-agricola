import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { afterEach, expect, it, vi } from 'vitest'
import { createSoloRecoveryHost } from '../../__tests__/_helpers/solo-recovery-network'
import { createSession } from '../../auth'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'

let host: Awaited<ReturnType<typeof createSoloRecoveryHost>> | undefined
let transport: { destroy(): void } | undefined
afterEach(async () => {
  transport?.destroy(); transport = undefined
  try { await host?.close() } finally { host = undefined; vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() }
}, 30000)

it('settles a real transport journal from a generic durable rejection before the detailed transient error', async () => {
  host = await createSoloRecoveryHost()
  const token = await createSession(host.user.id), allocationId = randomUUID()
  await host.runtime().directory.allocate(`user:${host.user.id}`, allocationId)
  class AuthenticatedSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { Cookie: `oa_session=${token}` } }) }
  }
  let firstId = true
  vi.stubGlobal('crypto', { randomUUID: () => { if (firstId) { firstId = false; return allocationId } return randomUUID() } })
  vi.stubGlobal('WebSocket', AuthenticatedSocket)
  vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } })
  const { WsGameTransport } = await import('../../../client/services/gameTransport')
  const client = new WsGameTransport(host.runtime().url, undefined, undefined, { route: false })
  transport = client
  const events: ServerEvent[] = []
  client.onEvent(event => events.push(event))
  await client.connect()
  await expect(client.createRoom({ maxPlayers: 4,
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
  })).rejects.toMatchObject({ code: 'experimental_feature_unavailable' })
  await vi.waitFor(() => expect(events.some(event => event.type === 'error' && event.feature === 'team-modes')).toBe(true))
  expect(client.recoveringCommands).toBe(false)
  expect(client.connected).toBe(true)
  const receipt = events.find(event => event.type === 'commandReceipt' && event.status === 'completed')
  expect(receipt).toMatchObject({ type: 'commandReceipt', receipt: { outcome: { ok: false, code: 'experimental_feature_unavailable' } } })
  const stored = await host.db.prepare('SELECT outcome_json FROM command_requests WHERE outcome_json IS NOT NULL').all<{ outcome_json: string }>()
  expect(stored.map(row => JSON.parse(row.outcome_json))).toEqual([{ ok: false, error: 'Experimental feature unavailable', code: 'experimental_feature_unavailable' }])
  expect(host.runtime().backend.registry.size()).toBe(0)
})

it('declares cooperation capability from the real transport before creating a production beta room', async () => {
  host = await createSoloRecoveryHost()
  await host.db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run(host.user.id, host.user.id, Date.now())
  const token = await createSession(host.user.id), allocationId = randomUUID()
  await host.runtime().directory.allocate(`user:${host.user.id}`, allocationId)
  class AuthenticatedSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { Cookie: `oa_session=${token}` } }) }
  }
  let firstId = true
  vi.stubGlobal('crypto', { randomUUID: () => { if (firstId) { firstId = false; return allocationId } return randomUUID() } })
  vi.stubGlobal('WebSocket', AuthenticatedSocket)
  vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } })
  const { WsGameTransport } = await import('../../../client/services/gameTransport')
  const client = new WsGameTransport(host.runtime().url, undefined, undefined, { route: false })
  transport = client
  const events: ServerEvent[] = []
  client.onEvent(event => events.push(event))
  await client.connect()
  await expect(client.createRoom({ maxPlayers: 4,
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', cooperationRules: true },
  })).resolves.toBeUndefined()
  expect(client.connected).toBe(true)
  expect(events).toContainEqual(expect.objectContaining({ type: 'teamRoomWaiting', teamConfig: expect.objectContaining({ cooperationRules: true }) }))
  expect(host.runtime().backend.registry.size()).toBe(1)
  const room = [...host.runtime().backend.registry.iter()][0]!
  expect(JSON.stringify(await host.runtime().persistence.load(room.id))).not.toContain('team-cooperation-v1')
})

it('settles the real unsupported-client receipt before stopping and retains exactly one rejection outcome', async () => {
  host = await createSoloRecoveryHost()
  await host.db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run(host.user.id, host.user.id, Date.now())
  const token = await createSession(host.user.id), allocationId = randomUUID()
  await host.runtime().directory.allocate(`user:${host.user.id}`, allocationId)
  class AuthenticatedSocket extends WebSocket {
    constructor(url: string) { super(url, { headers: { Cookie: `oa_session=${token}` } }) }
  }
  let firstId = true
  vi.stubGlobal('crypto', { randomUUID: () => { if (firstId) { firstId = false; return allocationId } return randomUUID() } })
  vi.stubGlobal('WebSocket', AuthenticatedSocket)
  vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } })
  const { WsGameTransport } = await import('../../../client/services/gameTransport')
  const client = new WsGameTransport(host.runtime().url, undefined, undefined, { route: false })
  transport = client
  const timeline: string[] = [], events: ServerEvent[] = []
  client.onEvent(event => { events.push(event); if (event.type === 'commandReceipt' && event.status === 'completed') timeline.push('receipt') })
  client.onConnectionStatus(status => { if (status.phase === 'stopped') timeline.push('stopped') })
  await client.connect()
  client.sendRoomCommand('getCommandScope', { clientCapabilities: [] })
  await expect(client.createRoom({ maxPlayers: 4,
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', cooperationRules: true },
  })).rejects.toMatchObject({ code: 'client_refresh_required', message: 'Please refresh this page to use official cooperation rules.' })
  expect(timeline).toEqual(['receipt', 'stopped'])
  expect(client.connected).toBe(false)
  expect(client.recoveringCommands).toBe(false)
  expect(events).toContainEqual(expect.objectContaining({ type: 'commandReceipt', status: 'completed', receipt: expect.objectContaining({ outcome: { ok: false, code: 'client_refresh_required', error: 'Please refresh this page to use official cooperation rules.' } }) }))
  const stored = await host.db.prepare('SELECT outcome_json FROM command_requests WHERE outcome_json IS NOT NULL').all<{ outcome_json: string }>()
  expect(stored.map(row => JSON.parse(row.outcome_json))).toEqual([{ ok: false, code: 'client_refresh_required', error: 'Please refresh this page to use official cooperation rules.' }])
  expect(host.runtime().backend.registry.size()).toBe(0)
})

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

it('rejects removed raw configurations before consuming an allocation or creating any Room or Replay', async () => {
  host = await createSoloRecoveryHost()
  await host.db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run(host.user.id, host.user.id, Date.now())
  const peer = await host.connect()
  const allocationId = randomUUID()
  await host.runtime().directory.allocate(`user:${host.user.id}`, allocationId)
  for (const configuration of [
    { teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' } },
    { teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', cooperationRules: true } },
    { multihand: true }, { cooperationRules: true },
  ]) {
    const prepared = await peer.prepare({ type: 'createRoom', maxPlayers: 4 }, undefined, allocationId)
    peer.socket.send(JSON.stringify({ ...prepared.command, ...configuration }))
    expect(await peer.wait((event): event is Extract<ServerEvent, { type: 'error' }> =>
      event.type === 'error' && event.requestId === prepared.requestId)).toMatchObject({ error: 'Unsupported game configuration' })
    expect(host.runtime().backend.registry.size()).toBe(0)
    expect(await host.db.prepare('SELECT command_id FROM room_allocations WHERE allocation_id=?').get(allocationId)).toEqual({ command_id: null })
    expect(await host.db.prepare('SELECT id FROM rooms').all()).toEqual([])
    expect(await host.db.prepare('SELECT room_id FROM game_replays').all()).toEqual([])
  }
})

it('rejects removed commands without changing an ordinary retained Room or Replay', async () => {
  host = await createSoloRecoveryHost()
  const { peer, state } = await host.create()
  const before = await host.runtime().persistence.load(state.roomId)
  const head = await host.runtime().persistence.loadReplayHead(state.roomId)
  for (const type of ['setTeam', 'startTeamGame']) {
    const requestId = randomUUID()
    peer.socket.send(JSON.stringify({ type, teamIndex: 0, requestId }))
    expect(await peer.wait((event): event is Extract<ServerEvent, { type: 'error' }> => event.type === 'error' && event.requestId === requestId))
      .toMatchObject({ error: `unknown command: ${type}` })
    expect(await host.runtime().persistence.load(state.roomId)).toEqual(before)
    expect(await host.runtime().persistence.loadReplayHead(state.roomId)).toEqual(head)
  }
})

it('uses empty or unknown capabilities with a real ordinary transport, durable rejection, action and reconnect', async () => {
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
  client.sendRoomCommand('getCommandScope', { clientCapabilities: [] })
  await expect(client.createRoom({ maxPlayers: 2, hotseat: true, draftMode: 'simultaneous', draftPoolSize: 99 })).rejects.toThrow('invalid draftPoolSize')
  expect(client.recoveringCommands).toBe(false)
  expect(client.connected).toBe(true)
  expect(events).toContainEqual(expect.objectContaining({ type: 'commandReceipt', status: 'completed', receipt: expect.objectContaining({ outcome: expect.objectContaining({ ok: false }) }) }))
  // A fresh allocation belongs to the next creation command.
  client.destroy()
  const nextAllocationId = randomUUID()
  await host.runtime().directory.allocate(`user:${host.user.id}`, nextAllocationId)
  let nextId = true
  vi.stubGlobal('crypto', { randomUUID: () => { if (nextId) { nextId = false; return nextAllocationId } return randomUUID() } })
  const ordinary = new WsGameTransport(host.runtime().url, undefined, undefined, { route: false })
  transport = ordinary
  await ordinary.connect()
  ordinary.sendRoomCommand('getCommandScope', { clientCapabilities: ['unknown', 'team-cooperation-v1'] })
  await ordinary.createRoom({ maxPlayers: 2, hotseat: true })
  const initial = await ordinary.getState()
  expect(initial.state.players).toHaveLength(2)
  expect(initial.interaction).toMatchObject({ stateId: 'idle' })
  const after = await ordinary.takeAction(0, 'day-laborer')
  expect(after.state.players[0]!.resources.food).toBe(initial.state.players[0]!.resources.food + 2)
  const roomId = ordinary.roomId
  ordinary.destroy()
  const restored = new WsGameTransport(host.runtime().url, roomId, undefined, { route: false })
  transport = restored
  const rejoined = new Promise<void>(resolve => { restored.onSnapshot(() => resolve()) })
  await restored.connect()
  restored.sendRoomCommand('joinRoom', { roomId, intent: 'resume' })
  await rejoined
  expect((await restored.getState()).state).toEqual(after.state)
})

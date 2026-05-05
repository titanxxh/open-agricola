import { describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '../../../shared/protocol/ws.ts'
import { createLobby, type RoomBroadcaster } from '../lobby.ts'
import { RoomRegistry } from '../room-registry.ts'
import { InMemoryRoomPersistence } from '../persistence/memory-adapter.ts'
import type { Room } from '../room.ts'

const fakeRoom = (overrides: Partial<Room> = {}): Room => ({
  id: 'r1',
  session: {} as never,
  players: [],
  maxPlayers: 2,
  version: 0,
  status: 'waiting',
  createdBy: 'u1',
  ...overrides,
})

const fakeBroadcaster = (): RoomBroadcaster & { calls: ServerEvent[] } => {
  const calls: ServerEvent[] = []
  return {
    broadcastEvent: (_room, event) => { calls.push(event) },
    calls,
  }
}

describe('lobby.getRooms', () => {
  it('hides empty non-dev rooms but keeps fixed dev rooms', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'r1', players: [] }))
    registry.set(fakeRoom({
      id: 'dev2',
      players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }],
    }))
    const lobby = createLobby({
      registry,
      persistence: new InMemoryRoomPersistence(),
      broadcaster: fakeBroadcaster(),
    })
    const summaries = lobby.getRooms()
    expect(summaries.map((s) => s.id).sort()).toEqual(['dev2'])
  })
})

describe('lobby.dissolveRoomById', () => {
  it('rejects when room is missing', () => {
    const lobby = createLobby({
      registry: new RoomRegistry(),
      persistence: new InMemoryRoomPersistence(),
      broadcaster: fakeBroadcaster(),
    })
    expect(lobby.dissolveRoomById('nope', 'u1')).toEqual({ ok: false, error: 'room not found' })
  })

  it('rejects when caller is not the creator', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'r1', createdBy: 'u1' }))
    const lobby = createLobby({
      registry,
      persistence: new InMemoryRoomPersistence(),
      broadcaster: fakeBroadcaster(),
    })
    expect(lobby.dissolveRoomById('r1', 'u2')).toEqual({
      ok: false,
      error: 'only the room creator can dissolve',
    })
  })

  it('rejects fixed dev rooms', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'dev2', createdBy: 'u1' }))
    const lobby = createLobby({
      registry,
      persistence: new InMemoryRoomPersistence(),
      broadcaster: fakeBroadcaster(),
    })
    expect(lobby.dissolveRoomById('dev2', 'u1').ok).toBe(false)
  })

  it('happy path: broadcasts roomDissolved + closes sockets + cleans state', () => {
    const closeCalls: number[] = []
    const fakeWs = (id: number) => ({ readyState: 1, OPEN: 1, close: () => closeCalls.push(id), send: vi.fn() })
    const registry = new RoomRegistry()
    registry.set(fakeRoom({
      id: 'r1', createdBy: 'u1',
      players: [
        { ws: fakeWs(0) as never, playerIndex: 0, name: 'p0', userId: 'u1' },
        { ws: fakeWs(1) as never, playerIndex: 1, name: 'p1', userId: 'u2' },
      ],
    }))
    registry.touchActivity('r1', 1000)
    const persistence = new InMemoryRoomPersistence()
    persistence.save('r1', { _stub: true } as never, {
      createdBy: 'u1', maxPlayers: 2, customCardDbIds: [], status: 'playing',
      players: [{ userId: 'u1', playerIndex: 0 }],
    })
    const broadcaster = fakeBroadcaster()
    const lobby = createLobby({ registry, persistence, broadcaster })

    expect(lobby.dissolveRoomById('r1', 'u1')).toEqual({ ok: true })
    expect(broadcaster.calls.find((e) => e.type === 'roomDissolved')).toBeTruthy()
    expect(closeCalls.sort()).toEqual([0, 1])
    expect(registry.has('r1')).toBe(false)
    expect(registry.lastActivityOf('r1')).toBeUndefined()
    expect(persistence.load('r1')).toBeNull()
  })
})

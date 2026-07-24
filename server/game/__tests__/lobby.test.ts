import { describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '../../../shared/contract/protocol/ws.ts'
import { createLobby, type RoomBroadcaster } from '../lobby.ts'
import { RoomRegistry } from '../room-registry.ts'
import { InMemoryRoomPersistence } from '../persistence/memory-adapter.ts'
import type { Room } from '../room.ts'
import { createRoomPersistenceCheckpoint } from '../room-persistence-checkpoint.ts'

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

const checkpoint = (persistence = new InMemoryRoomPersistence()) =>
  createRoomPersistenceCheckpoint({ persistence })

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
      checkpoint: checkpoint(),
      broadcaster: fakeBroadcaster(),
    })
    const summaries = lobby.getRooms()
    expect(summaries.map((s) => s.id).sort()).toEqual(['dev2'])
  })

  it('hides rooms with zero players to keep the lobby free of zombies', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'alive', players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }] }))
    registry.set(fakeRoom({ id: 'zombie', players: [] }))
    registry.set(fakeRoom({
      id: 'joinable',
      maxPlayers: 4,
      players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }],
    }))
    const lobby = createLobby({
      registry,
      checkpoint: checkpoint(),
      broadcaster: fakeBroadcaster(),
    })
    const summaries = lobby.getRooms()
    expect(summaries.map((s) => s.id).sort()).toEqual(['alive', 'joinable'])
  })

  it('keeps fixed dev rooms even when empty', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'dev2', players: [] }))
    registry.set(fakeRoom({ id: 'alive', players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }] }))
    const lobby = createLobby({
      registry,
      checkpoint: checkpoint(),
      broadcaster: fakeBroadcaster(),
    })
    const summaries = lobby.getRooms()
    expect(summaries.map((s) => s.id).sort()).toEqual(['alive', 'dev2'])
  })

  it('caps the result count when given a positive limit', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'a', players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }] }))
    registry.set(fakeRoom({ id: 'b', players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }] }))
    registry.set(fakeRoom({ id: 'c', players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }] }))
    const lobby = createLobby({
      registry,
      checkpoint: checkpoint(),
      broadcaster: fakeBroadcaster(),
    })
    const summaries = lobby.getRooms(2)
    expect(summaries.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('reports status="playing" only when all seats are filled', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({
      id: 'half',
      maxPlayers: 4,
      players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }],
    }))
    registry.set(fakeRoom({
      id: 'full',
      maxPlayers: 2,
      players: [
        { ws: {} as never, playerIndex: 0, name: 'p1' },
        { ws: {} as never, playerIndex: 1, name: 'p2' },
      ],
    }))
    const lobby = createLobby({
      registry,
      checkpoint: checkpoint(),
      broadcaster: fakeBroadcaster(),
    })
    const summaries = lobby.getRooms()
    expect(summaries.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'full', playerCount: 2, maxPlayers: 2, createdBy: 'u1', status: 'playing' },
      { id: 'half', playerCount: 1, maxPlayers: 4, createdBy: 'u1', status: 'waiting' },
    ])
  })
})

describe('lobby.dissolveRoomById', () => {
  it('rejects when room is missing', () => {
    const lobby = createLobby({
      registry: new RoomRegistry(),
      checkpoint: checkpoint(),
      broadcaster: fakeBroadcaster(),
    })
    expect(lobby.dissolveRoomById('nope', 'u1')).toEqual({ ok: false, error: 'room not found' })
  })

  it('rejects when caller is not the creator', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'r1', createdBy: 'u1' }))
    const lobby = createLobby({
      registry,
      checkpoint: checkpoint(),
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
      checkpoint: checkpoint(),
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
    const lobby = createLobby({ registry, checkpoint: checkpoint(persistence), broadcaster })

    expect(lobby.dissolveRoomById('r1', 'u1')).toEqual({ ok: true })
    expect(broadcaster.calls.find((e) => e.type === 'roomDissolved')).toBeTruthy()
    expect(closeCalls.sort()).toEqual([0, 1])
    expect(registry.has('r1')).toBe(false)
    expect(registry.lastActivityOf('r1')).toBeUndefined()
    expect(persistence.load('r1')).toBeNull()
  })
})

describe('lobby.endRoomsForUser', () => {
  it('ends rooms created by or joined by the deleted user', () => {
    const closeCalls: string[] = []
    const fakeWs = (id: string) => ({ readyState: 1, OPEN: 1, close: () => closeCalls.push(id), send: vi.fn() })
    const registry = new RoomRegistry()
    registry.set(fakeRoom({
      id: 'owned-room',
      createdBy: 'u1',
      status: 'playing',
      players: [
        { ws: fakeWs('owned-u1') as never, playerIndex: 0, name: 'p0', userId: 'u1' },
        { ws: fakeWs('owned-u2') as never, playerIndex: 1, name: 'p1', userId: 'u2' },
      ],
    }))
    registry.set(fakeRoom({
      id: 'joined-room',
      createdBy: 'u2',
      status: 'playing',
      players: [
        { ws: fakeWs('joined-u2') as never, playerIndex: 0, name: 'p0', userId: 'u2' },
        { ws: fakeWs('joined-u1') as never, playerIndex: 1, name: 'p1', userId: 'u1' },
      ],
    }))
    registry.set(fakeRoom({
      id: 'unrelated-room',
      createdBy: 'u2',
      status: 'playing',
      players: [
        { ws: fakeWs('unrelated-u2') as never, playerIndex: 0, name: 'p0', userId: 'u2' },
      ],
    }))
    registry.touchActivity('owned-room', 1000)
    registry.touchActivity('joined-room', 1000)
    registry.touchActivity('unrelated-room', 1000)
    const persistence = new InMemoryRoomPersistence()
    for (const room of registry.iter()) {
      persistence.save(room.id, { _stub: true } as never, {
        createdBy: room.createdBy ?? null,
        maxPlayers: room.maxPlayers,
        customCardDbIds: [],
        status: room.status,
        players: room.players
          .filter((player): player is typeof player & { userId: string } => typeof player.userId === 'string')
          .map(player => ({ userId: player.userId, playerIndex: player.playerIndex })),
      })
    }
    const broadcaster = fakeBroadcaster()
    const lobby = createLobby({ registry, checkpoint: checkpoint(persistence), broadcaster })

    expect(lobby.endRoomsForUser('u1')).toEqual({ endedRoomIds: ['owned-room', 'joined-room'] })
    expect(closeCalls.sort()).toEqual(['joined-u1', 'joined-u2', 'owned-u1', 'owned-u2'])
    expect(broadcaster.calls.filter((event) => event.type === 'roomDissolved').map(event => event.roomId).sort())
      .toEqual(['joined-room', 'owned-room'])
    expect(registry.has('owned-room')).toBe(false)
    expect(registry.has('joined-room')).toBe(false)
    expect(registry.has('unrelated-room')).toBe(true)
    expect(registry.lastActivityOf('owned-room')).toBeUndefined()
    expect(registry.lastActivityOf('joined-room')).toBeUndefined()
    expect(persistence.load('owned-room')).toBeNull()
    expect(persistence.load('joined-room')).toBeNull()
    expect(persistence.__getResultForTest('owned-room')).toBeUndefined()
    expect(persistence.__getResultForTest('joined-room')).toBeUndefined()
    expect(persistence.load('unrelated-room')?.meta.status).toBe('playing')
  })

  it('ends rooms by persisted affected ids when the deleted user is disconnected', () => {
    const closeCalls: string[] = []
    const fakeWs = (id: string) => ({ readyState: 1, OPEN: 1, close: () => closeCalls.push(id), send: vi.fn() })
    const registry = new RoomRegistry()
    registry.set(fakeRoom({
      id: 'disconnected-joined-room',
      createdBy: 'u2',
      status: 'playing',
      players: [
        { ws: fakeWs('u2') as never, playerIndex: 0, name: 'p0', userId: 'u2' },
      ],
    }))
    registry.set(fakeRoom({
      id: 'unrelated-room',
      createdBy: 'u2',
      status: 'playing',
      players: [
        { ws: fakeWs('unrelated-u2') as never, playerIndex: 0, name: 'p0', userId: 'u2' },
      ],
    }))
    registry.touchActivity('disconnected-joined-room', 1000)
    const persistence = new InMemoryRoomPersistence()
    for (const room of registry.iter()) {
      persistence.save(room.id, { _stub: true } as never, {
        createdBy: room.createdBy ?? null,
        maxPlayers: room.maxPlayers,
        customCardDbIds: [],
        status: room.status,
        players: room.id === 'disconnected-joined-room'
          ? [{ userId: 'u1', playerIndex: 1 }, { userId: 'u2', playerIndex: 0 }]
          : [{ userId: 'u2', playerIndex: 0 }],
      })
    }
    const broadcaster = fakeBroadcaster()
    const lobby = createLobby({ registry, checkpoint: checkpoint(persistence), broadcaster })

    expect(lobby.endRoomsForUser('u1', ['disconnected-joined-room'])).toEqual({ endedRoomIds: ['disconnected-joined-room'] })
    expect(closeCalls).toEqual(['u2'])
    expect(broadcaster.calls.filter((event) => event.type === 'roomDissolved').map(event => event.roomId))
      .toEqual(['disconnected-joined-room'])
    expect(registry.has('disconnected-joined-room')).toBe(false)
    expect(registry.has('unrelated-room')).toBe(true)
    expect(registry.lastActivityOf('disconnected-joined-room')).toBeUndefined()
    expect(persistence.load('disconnected-joined-room')).toBeNull()
    expect(persistence.__getResultForTest('disconnected-joined-room')).toBeUndefined()
    expect(persistence.load('unrelated-room')?.meta.status).toBe('playing')
  })
})

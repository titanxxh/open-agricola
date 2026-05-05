import { describe, expect, it, vi } from 'vitest'
import { dispatch } from '../room-router.ts'
import { createConnectionCtx } from '../connection-ctx.ts'
import { Broadcaster } from '../broadcaster.ts'
import { RoomRegistry } from '../../game/room-registry.ts'
import { InMemoryRoomPersistence } from '../../game/persistence/memory-adapter.ts'
import { createLobby } from '../../game/lobby.ts'

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

const newCtx = () => {
  const persistence = new InMemoryRoomPersistence()
  const registry = new RoomRegistry()
  const broadcaster = new Broadcaster({ persistence })
  const lobby = createLobby({ registry, persistence, broadcaster })
  const ws = fakeWs() as never
  return createConnectionCtx(ws, { registry, persistence, broadcaster, lobby }, true)
}

const sentTypesOf = (ctx: ReturnType<typeof newCtx>): string[] => {
  const send = ctx.ws.send as unknown as ReturnType<typeof vi.fn>
  return send.mock.calls.map(([raw]) => JSON.parse(raw as string).type)
}

const sentMessagesOf = (ctx: ReturnType<typeof newCtx>): Array<Record<string, unknown>> => {
  const send = ctx.ws.send as unknown as ReturnType<typeof vi.fn>
  return send.mock.calls.map(([raw]) => JSON.parse(raw as string) as Record<string, unknown>)
}

describe('handleCreateRoom', () => {
  it('creates a room + sets ctx.currentRoom + sends roomCreated', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    expect(ctx.currentRoom).not.toBeNull()
    expect(ctx.currentPlayerIndex).toBe(0)
    expect(ctx.currentRoom!.players.length).toBe(1)
    expect(sentTypesOf(ctx)).toContain('roomCreated')
  })

  it('clamps maxPlayers to [2, 4]', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 99 })
    expect(ctx.currentRoom!.maxPlayers).toBe(4)
  })
})

describe('handleAction guard: no-room', () => {
  it('errors when ctx.currentRoom is null', () => {
    const ctx = newCtx()
    dispatch(ctx, { type: 'action', spaceId: 'whatever' })
    expect(sentTypesOf(ctx)).toContain('error')
  })
})

describe('seat-binding guards', () => {
  const setupTwoSeatRoom = () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    return ctx
  }

  it('devSetResources rejects foreign seat', () => {
    const ctx = setupTwoSeatRoom()
    ctx.currentRoom!.id = 'dev2'  // simulate fixed-dev so dev cmd is allowed
    const before = sentTypesOf(ctx).length
    dispatch(ctx, { type: 'devSetResources', playerIndex: 1, resources: { wood: 5 } })
    const after = sentTypesOf(ctx)
    const newSent = after.slice(before)
    expect(newSent.filter((t) => t === 'error')).toHaveLength(1)
  })

  it('devSetResources accepts own seat', () => {
    const ctx = setupTwoSeatRoom()
    ctx.currentRoom!.id = 'dev2'
    const before = sentTypesOf(ctx).length
    dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 5 } })
    const newSent = sentTypesOf(ctx).slice(before)
    expect(newSent).toContain('stateUpdate')
  })

  it('rejects dev commands in non-dev rooms', () => {
    const ctx = setupTwoSeatRoom()
    // currentRoom.id is a random non-dev id from generateRoomId()
    dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 5 } })
    const errors = sentMessagesOf(ctx).filter((m) => m.type === 'error')
    expect(errors.some((e) => /dev commands disabled/.test(String(e.error)))).toBe(true)
  })

  it('draftSubmit rejects foreign playerId', () => {
    const ctx = setupTwoSeatRoom()
    dispatch(ctx, { type: 'draftSubmit', playerId: 'fake-id', pick: { occupation: '', minor: '' } })
    const errors = sentMessagesOf(ctx).filter((m) => m.type === 'error')
    expect(errors.some((e) => /seat mismatch/.test(String(e.error)))).toBe(true)
  })
})

describe('unknown command', () => {
  it('emits error', () => {
    const ctx = newCtx()
    dispatch(ctx, { type: 'no-such-cmd' as never } as never)
    expect(sentTypesOf(ctx)).toContain('error')
  })
})

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

  it('clamps maxPlayers to [2, 6]', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 99 })
    expect(ctx.currentRoom!.maxPlayers).toBe(6)

    const lowCtx = newCtx()
    lowCtx.currentUserId = 'u1'
    dispatch(lowCtx, { type: 'createRoom', maxPlayers: 1 })
    expect(lowCtx.currentRoom!.maxPlayers).toBe(2)
  })

  it('creates a six-player room session and announces six seats', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 6, name: 'host' })

    expect(ctx.currentRoom!.maxPlayers).toBe(6)
    expect(ctx.currentRoom!.session.state.players).toHaveLength(6)
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({
      type: 'roomCreated',
      maxPlayers: 6,
    }))
  })

  it('forwards enableParentCards into the created room session', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })

    expect(ctx.currentRoom!.session.state.enableParentCards).toBe(true)
    expect(ctx.currentRoom!.session.state.phase).toBe('parent-selection')
  })

  it('preserves enableParentCards when starting a new game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toBe(309)
    expect(ctx.currentRoom!.session.state.enableParentCards).toBe(true)
    expect(ctx.currentRoom!.session.state.phase).toBe('parent-selection')
  })

  it('forwards enableThroughTheSeasons into the created room session', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableThroughTheSeasons: true } as never)

    expect(ctx.currentRoom!.session.state.enableThroughTheSeasons).toBe(true)
    expect(ctx.currentRoom!.session.state.throughTheSeasons).not.toBeNull()
  })

  it('preserves enableThroughTheSeasons when starting a new game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableThroughTheSeasons: true } as never)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toBe(309)
    expect(ctx.currentRoom!.session.state.enableThroughTheSeasons).toBe(true)
    expect(ctx.currentRoom!.session.state.throughTheSeasons).not.toBeNull()
  })

  it('forwards enableFarmersOfTheMoor into the created room session', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    } as never)

    expect(ctx.currentRoom!.session.state.enableFarmersOfTheMoor).toBe(true)
    expect(ctx.currentRoom!.session.state.farmersOfTheMoor).not.toBeNull()
  })

  it('allows enableFarmersOfTheMoor by default once its minor pool is sufficient', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableFarmersOfTheMoor: true } as never)

    expect(ctx.currentRoom!.session.state.enableFarmersOfTheMoor).toBe(true)
    expect(ctx.currentRoom!.session.state.players.every((player) =>
      player.minorHand.filter((id) => id.startsWith('M')).length === 4,
    )).toBe(true)
    expect(ctx.currentRoom!.allowIncompleteFarmersOfTheMoorMinorDeal).toBe(false)
  })

  it('preserves enableFarmersOfTheMoor when starting a new game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    } as never)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toBe(309)
    expect(ctx.currentRoom!.session.state.enableFarmersOfTheMoor).toBe(true)
    expect(ctx.currentRoom!.session.state.farmersOfTheMoor).not.toBeNull()
  })

  it('preserves six seats when starting a new game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 6 })

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.maxPlayers).toBe(6)
    expect(ctx.currentRoom!.session.state.gameSeed).toBe(309)
    expect(ctx.currentRoom!.session.state.players).toHaveLength(6)
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
    dispatch(ctx, { type: 'draftSubmit', playerId: 'fake-id', pick: { occCardId: '', minorCardId: '' } })
    const errors = sentMessagesOf(ctx).filter((m) => m.type === 'error')
    expect(errors.some((e) => /seat mismatch/.test(String(e.error)))).toBe(true)
  })

  it('parentSubmit rejects foreign seat', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })
    const p1Candidates = ctx.currentRoom!.session.state.parentSelection!.candidates.p1

    dispatch(ctx, {
      type: 'parentSubmit',
      playerIndex: 1,
      selection: {
        mother: p1Candidates.mother[0],
        father: p1Candidates.father[0],
      },
    } as never)

    const errors = sentMessagesOf(ctx).filter((m) => m.type === 'error')
    expect(errors.some((e) => /seat mismatch/.test(String(e.error)))).toBe(true)
  })

  it('parentSubmit routes own parent selection to the session', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })
    const p1Candidates = ctx.currentRoom!.session.state.parentSelection!.candidates.p1

    dispatch(ctx, {
      type: 'parentSubmit',
      playerIndex: 0,
      selection: {
        mother: p1Candidates.mother[0],
        father: p1Candidates.father[0],
      },
    } as never)

    expect(ctx.currentRoom!.session.state.parentSelection!.submissions.p1).toEqual({
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    })
    expect(sentTypesOf(ctx)).toContain('stateUpdate')
  })
})

describe('unknown command', () => {
  it('emits error', () => {
    const ctx = newCtx()
    dispatch(ctx, { type: 'no-such-cmd' as never } as never)
    expect(sentTypesOf(ctx)).toContain('error')
  })
})

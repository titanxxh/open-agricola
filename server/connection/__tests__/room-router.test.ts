import { describe, expect, it, vi } from 'vitest'
import { dispatch } from '../room-router.ts'
import { createConnectionCtx } from '../connection-ctx.ts'
import { Broadcaster } from '../broadcaster.ts'
import { RoomRegistry } from '../../game/room-registry.ts'
import { InMemoryRoomPersistence } from '../../game/persistence/memory-adapter.ts'
import { createLobby } from '../../game/lobby.ts'
import { createRoomPersistenceCheckpoint } from '../../game/room-persistence-checkpoint.ts'
import { snapshotToRoom } from '../../game/room.ts'
import type { GameState } from '../../../shared/contract/types.ts'

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

const newDeps = () => {
  const persistence = new InMemoryRoomPersistence()
  const registry = new RoomRegistry()
  const checkpoint = createRoomPersistenceCheckpoint({ persistence })
  const broadcaster = new Broadcaster({ checkpoint })
  const lobby = createLobby({ registry, checkpoint, broadcaster })
  return { persistence, registry, checkpoint, broadcaster, lobby }
}

const newCtx = (deps = newDeps()) => {
  const ws = fakeWs() as never
  return Object.assign(
    createConnectionCtx(ws, {
      registry: deps.registry,
      checkpoint: deps.checkpoint,
      broadcaster: deps.broadcaster,
      lobby: deps.lobby,
    }, true),
    { persistence: deps.persistence },
  )
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

  it('bounds room id allocation retries', () => {
    const deps = newDeps()
    vi.spyOn(deps.persistence, 'hasRoomId').mockReturnValue(true)
    const ctx = newCtx(deps)

    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, requestId: 'create-1' })

    expect(deps.persistence.hasRoomId).toHaveBeenCalledTimes(8)
    expect(ctx.currentRoom).toBeNull()
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({
      type: 'error',
      error: 'unable to allocate room id',
      requestId: 'create-1',
    }))
  })

  it('checkpoints created rooms with state and host metadata', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'

    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })

    ctx.checkpoint.flushAll()
    const snap = ctx.persistence.load(ctx.currentRoom!.id)
    expect(snap?.serialized).not.toBeNull()
    expect(snap?.meta.players).toEqual([{ userId: 'u1', playerIndex: 0 }])
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

  it('preserves direct Parent Card dealing when starting a new game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      name: 'Alice',
      enableParentCards: true,
      draftParents: false,
    } as never)

    expect(ctx.currentRoom!.draftParents).toBe(false)
    expect(ctx.currentRoom!.session.state.phase).toBe('playing')

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.phase).toBe('playing')
    expect(ctx.currentRoom!.session.state.parentSelection).toBeNull()
    expect(ctx.currentRoom!.session.state.players.every((player) => player.parentCards.mother)).toBe(true)
    expect(ctx.currentRoom!.session.state.players[0]!.name).toBe('Alice')
    expect(ctx.currentRoom!.session.state.log.some((entry) => entry.params?.player === 'PlayerA')).toBe(false)
  })

  it('preserves completed simultaneous draft settings across restore and newGame', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })

    const roomId = ctx.currentRoom!.id
    const players = ctx.currentRoom!.players
    ctx.currentRoom!.session.state.phase = 'playing'
    ctx.currentRoom!.session.state.draft = null
    ctx.checkpoint.flushAll()
    const restored = snapshotToRoom(ctx.persistence.load(roomId)!)
    restored.players = players
    ctx.registry.delete(roomId)
    ctx.registry.set(restored)
    ctx.currentRoom = restored

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.phase).toBe('draft')
    expect(ctx.currentRoom!.session.state.draft?.poolSize).toBe(8)
  })

  it('uses room display names in direct Parent Card logs', () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    dispatch(host, {
      type: 'createRoom',
      maxPlayers: 2,
      name: 'PlayerB',
      enableParentCards: true,
      draftParents: false,
    } as never)

    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    dispatch(guest, {
      type: 'joinRoom',
      roomId: host.currentRoom!.id,
      name: 'Bob',
    })

    const loggedPlayerNames = host.currentRoom!.session.state.log
      .map((entry) => entry.params?.player)
      .filter((player): player is string => typeof player === 'string')
    expect(new Set(loggedPlayerNames)).toEqual(new Set(['PlayerB', 'Bob']))
  })

  it('checkpoints newGame state through the broadcast path', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })

    dispatch(ctx, { type: 'newGame', seed: 309 })

    ctx.checkpoint.flushAll()
    expect(ctx.persistence.load(ctx.currentRoom!.id)?.serialized?.gameSeed).toBe(309)
  })

  it('moves newGame to a fresh room id and discards the unfinished game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const previousRoomId = ctx.currentRoom!.id

    dispatch(ctx, { type: 'newGame', seed: 309 })
    ctx.checkpoint.flushAll()

    const nextRoomId = ctx.currentRoom!.id
    expect(nextRoomId).not.toBe(previousRoomId)
    expect(ctx.registry.has(previousRoomId)).toBe(false)
    expect(ctx.registry.has(nextRoomId)).toBe(true)
    expect(ctx.persistence.load(previousRoomId)).toBeNull()
    expect(ctx.persistence.__getResultForTest(previousRoomId)).toBeUndefined()
    expect(ctx.persistence.load(nextRoomId)?.serialized?.gameSeed).toBe(309)
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({
      type: 'stateUpdate',
      roomId: nextRoomId,
    }))
  })

  it('keeps a completed game archive immutable when starting the next game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const previousRoomId = ctx.currentRoom!.id
    ctx.currentRoom!.startedAt = 10
    ctx.currentRoom!.session.state.gameOver = true
    expect(ctx.checkpoint.completeGame(ctx.currentRoom!, 20).ok).toBe(true)
    const archived = ctx.persistence.__getResultForTest(previousRoomId)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.id).not.toBe(previousRoomId)
    expect(ctx.persistence.__getResultForTest(previousRoomId)).toEqual(archived)
  })

  it('switches every connected seat to the new game id before broadcasting', () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id, name: 'guest' })
    const previousRoomId = host.currentRoom!.id

    dispatch(host, { type: 'newGame', seed: 309 })

    expect(guest.currentRoom).toBe(host.currentRoom)
    expect(guest.currentRoom!.id).not.toBe(previousRoomId)
    expect(sentMessagesOf(guest)).toContainEqual(expect.objectContaining({
      type: 'stateUpdate',
      roomId: host.currentRoom!.id,
    }))
  })

  it('checkpoints loadGame state through the broadcast path', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const loaded = JSON.parse(JSON.stringify(ctx.currentRoom!.session.getState().state)) as GameState
    loaded.gameSeed = 777

    dispatch(ctx, { type: 'loadGame', state: loaded })

    ctx.checkpoint.flushAll()
    expect(ctx.persistence.load(ctx.currentRoom!.id)?.serialized?.gameSeed).toBe(777)
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

  it('checkpoints joined seat metadata', () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'host' })

    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id, name: 'guest' })

    expect(guest.persistence.load(host.currentRoom!.id)?.meta.players).toEqual([
      { userId: 'u1', playerIndex: 0 },
      { userId: 'u2', playerIndex: 1 },
    ])
    expect(guest.persistence.load(host.currentRoom!.id)?.meta.startedAt).toEqual(expect.any(Number))
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

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
import type { CustomCardData } from '../../../shared/cards/session-card-context.ts'

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

const newDeps = (persistence = new InMemoryRoomPersistence()) => {
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

const markRoomStarted = (ctx: ReturnType<typeof newCtx>) => {
  ctx.currentRoom!.status = 'playing'
  ctx.currentRoom!.startedAt ??= 1
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

  it('caps ordinary waiting and playing rooms at 30 while excluding development rooms', () => {
    const ctx = newCtx()
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const devRoom = ctx.currentRoom!
    ctx.registry.delete(devRoom.id)
    devRoom.id = 'dev2-00000000-0000-4000-8000-000000000000'
    ctx.registry.set(devRoom)
    for (let index = 0; index < 30; index += 1) {
      dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    }

    dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      requestId: 'over-capacity',
    })

    expect(ctx.registry.size()).toBe(31)
    expect(sentMessagesOf(ctx)).toContainEqual({
      type: 'error',
      error: 'room capacity reached',
      requestId: 'over-capacity',
    })
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
    markRoomStarted(ctx)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toBe(309)
    expect(ctx.currentRoom!.session.state.enableParentCards).toBe(true)
    expect(ctx.currentRoom!.session.state.phase).toBe('parent-selection')
  })

  it('reloads custom cards through the current gate when starting a new game', () => {
    // A rematch is a new game (#642): the embedded snapshot is NOT reused —
    // cards deleted, taken down or graduated to built-in since the original
    // game must not resurrect in the fresh room.
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    ctx.currentRoom!.customCardDbIds = ['deleted-card']
    ctx.currentRoom!.customCards = [{
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_Pinned',
        name: 'Pinned',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
    } satisfies CustomCardData]
    markRoomStarted(ctx)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.getCustomCardDefs()).toEqual([])
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
    markRoomStarted(ctx)

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
    markRoomStarted(ctx)

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

  it('starts a full room when a disconnected owner still reserves a seat', () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'Alice' })
    host.currentRoom!.players = []
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'

    dispatch(guest, {
      type: 'joinRoom',
      roomId: host.currentRoom!.id,
      name: 'Bob',
    })

    expect(host.currentRoom!.status).toBe('playing')
    expect(host.currentRoom!.startedAt).toEqual(expect.any(Number))
    expect(sentMessagesOf(guest)).toContainEqual(expect.objectContaining({
      type: 'playerJoined',
      playerCount: 2,
    }))
    expect(sentTypesOf(guest)).toContain('gameStarted')
  })

  it('checkpoints newGame state through the broadcast path', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })
    markRoomStarted(ctx)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    ctx.checkpoint.flushAll()
    expect(ctx.persistence.load(ctx.currentRoom!.id)?.serialized?.gameSeed).toBe(309)
  })

  it('moves newGame to a fresh room id and discards the unfinished game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const previousRoomId = ctx.currentRoom!.id
    markRoomStarted(ctx)

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

  it('preserves fixed dev room privileges under the new game id', () => {
    const ctx = newCtx()
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const createdRoomId = ctx.currentRoom!.id
    ctx.registry.delete(createdRoomId)
    ctx.checkpoint.discardRoom(createdRoomId)
    ctx.currentRoom!.id = 'dev2'
    ctx.registry.set(ctx.currentRoom!)
    markRoomStarted(ctx)

    dispatch(ctx, { type: 'newGame', seed: 309 })
    const nextRoomId = ctx.currentRoom!.id
    const before = sentTypesOf(ctx).length
    dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 5 } })

    expect(nextRoomId).toMatch(/^dev2-[0-9a-f-]{36}$/)
    expect(nextRoomId).not.toBe('dev2')
    expect(sentTypesOf(ctx).slice(before)).toContain('stateUpdate')
  })

  it('does not carry disconnected seat owners into the new room id', () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    dispatch(host, { type: 'createRoom', maxPlayers: 2 })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id })
    host.currentRoom!.players = host.currentRoom!.players.filter((player) =>
      player.userId === 'u1'
    )

    dispatch(host, { type: 'newGame', seed: 309 })

    expect(host.currentRoom!.seatOwners).toEqual([
      { playerIndex: 0, userId: 'u1' },
    ])
    expect(host.currentRoom!.status).toBe('waiting')
    expect(sentMessagesOf(host)).toContainEqual({
      type: 'roomWaiting',
      roomId: host.currentRoom!.id,
      players: [{ playerIndex: 0, name: 'Player 1' }],
      maxPlayers: 2,
    })
    const replacement = newCtx(deps)
    replacement.currentUserId = 'u3'
    dispatch(replacement, { type: 'joinRoom', roomId: host.currentRoom!.id })
    expect(replacement.currentPlayerIndex).toBe(1)
  })

  it('keeps a completed game archive immutable when starting the next game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const previousRoomId = ctx.currentRoom!.id
    markRoomStarted(ctx)
    ctx.currentRoom!.startedAt = 10
    ctx.currentRoom!.session.state.gameOver = true
    expect(ctx.checkpoint.completeGame(ctx.currentRoom!, 20).ok).toBe(true)
    const archived = ctx.persistence.__getResultForTest(previousRoomId)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.id).not.toBe(previousRoomId)
    expect(ctx.persistence.__getResultForTest(previousRoomId)).toEqual(archived)
  })

  it('keeps the terminal room when completion fails before newGame', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const previousRoomId = ctx.currentRoom!.id
    markRoomStarted(ctx)
    ctx.currentRoom!.startedAt = 10
    ctx.currentRoom!.session.state.gameOver = true
    vi.spyOn(ctx.persistence, 'complete').mockReturnValue({
      ok: false,
      error: 'write failed',
    })

    dispatch(ctx, { type: 'newGame', seed: 309, requestId: 'new-1' })

    expect(ctx.currentRoom!.id).toBe(previousRoomId)
    expect(ctx.registry.has(previousRoomId)).toBe(true)
    expect(ctx.persistence.load(previousRoomId)?.serialized?.gameOver).toBe(true)
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({
      type: 'error',
      error: 'unable to archive completed game: write failed',
      requestId: 'new-1',
    }))
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
    markRoomStarted(ctx)
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
    markRoomStarted(ctx)

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
    markRoomStarted(ctx)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toBe(309)
    expect(ctx.currentRoom!.session.state.enableFarmersOfTheMoor).toBe(true)
    expect(ctx.currentRoom!.session.state.farmersOfTheMoor).not.toBeNull()
  })

  it('preserves six seats when starting a new game', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 6 })
    markRoomStarted(ctx)

    dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.maxPlayers).toBe(6)
    expect(ctx.currentRoom!.session.state.gameSeed).toBe(309)
    expect(ctx.currentRoom!.session.state.players).toHaveLength(6)
  })
})

describe('active room recovery', () => {
  it('returns the authoritative waiting-room state when its owner reconnects', () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    dispatch(host, { type: 'createRoom', maxPlayers: 4, name: 'Alice' })
    const roomId = host.currentRoom!.id
    const replacement = newCtx(deps)
    replacement.currentUserId = 'u1'

    dispatch(replacement, {
      type: 'joinRoom',
      roomId,
      intent: 'resume',
      name: 'Alice',
    })

    expect(sentMessagesOf(replacement)).toContainEqual({
      type: 'roomJoined',
      roomId,
      playerIndex: 0,
      status: 'waiting',
      players: [{ playerIndex: 0, name: 'Alice' }],
      maxPlayers: 4,
    })
  })

  it('restores every original seat after restart with only its own hidden information', () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'Alice' })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    dispatch(guest, {
      type: 'joinRoom',
      roomId: host.currentRoom!.id,
      name: 'Bob',
    })
    const roomId = host.currentRoom!.id
    const authoritativeHands = [
      {
        occupationHand: ['occ-a'],
        minorHand: ['minor-a'],
      },
      {
        occupationHand: ['occ-b'],
        minorHand: ['minor-b'],
      },
    ]
    host.currentRoom!.session.state.players.forEach((player, playerIndex) => {
      player.occupationHand = [...authoritativeHands[playerIndex]!.occupationHand]
      player.minorHand = [...authoritativeHands[playerIndex]!.minorHand]
    })
    deps.checkpoint.recordState(host.currentRoom!)
    deps.checkpoint.flushAll()

    const restarted = newDeps(deps.persistence)
    restarted.registry.set(snapshotToRoom(deps.persistence.load(roomId)!))
    const recoveredHost = newCtx(restarted)
    recoveredHost.currentUserId = 'u1'
    dispatch(recoveredHost, {
      type: 'joinRoom',
      roomId,
      intent: 'resume',
      requestedPlayerIndex: 1,
      name: 'Alice',
    })
    const recoveredGuest = newCtx(restarted)
    recoveredGuest.currentUserId = 'u2'
    dispatch(recoveredGuest, {
      type: 'joinRoom',
      roomId,
      intent: 'resume',
      requestedPlayerIndex: 0,
      name: 'Bob',
    })

    expect(recoveredHost.currentPlayerIndex).toBe(0)
    expect(recoveredGuest.currentPlayerIndex).toBe(1)
    const hostState = sentMessagesOf(recoveredHost)
      .findLast((message) => message.type === 'stateUpdate')!
      .payload as { state: GameState }
    const guestState = sentMessagesOf(recoveredGuest)
      .findLast((message) => message.type === 'stateUpdate')!
      .payload as { state: GameState }
    expect(hostState.state.players[0]!.minorHand).toEqual(['minor-a'])
    expect(hostState.state.players[1]!.minorHand).toEqual(['?'])
    expect(guestState.state.players[0]!.minorHand).toEqual(['?'])
    expect(guestState.state.players[1]!.minorHand).toEqual(['minor-b'])
    expect(recoveredHost.currentRoom!.session.state.players.map((player) => ({
      occupationHand: player.occupationHand,
      minorHand: player.minorHand,
    }))).toEqual(authoritativeHands)
  })

  it('rejects non-participants and revokes a replaced seat immediately', () => {
    const deps = newDeps()
    const original = newCtx(deps)
    original.currentUserId = 'u1'
    dispatch(original, { type: 'createRoom', maxPlayers: 2, name: 'Alice' })
    const roomId = original.currentRoom!.id

    const outsider = newCtx(deps)
    outsider.currentUserId = 'u2'
    dispatch(outsider, {
      type: 'joinRoom',
      roomId,
      intent: 'resume',
      requestedPlayerIndex: 1,
    })
    expect(outsider.currentRoom).toBeNull()
    expect(sentMessagesOf(outsider)).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'not_participant',
    }))

    const replacement = newCtx(deps)
    replacement.currentUserId = 'u1'
    dispatch(replacement, {
      type: 'joinRoom',
      roomId,
      intent: 'resume',
      requestedPlayerIndex: 1,
    })
    expect(replacement.currentPlayerIndex).toBe(0)
    expect(sentMessagesOf(original)).toContainEqual({
      type: 'seat_replaced',
      roomId,
      playerIndex: 0,
    })
    expect(original.ws.close).toHaveBeenCalledWith(4001, 'seat replaced')

    dispatch(original, { type: 'getState', requestId: 'stale-seat' })
    expect(sentMessagesOf(original)).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'seat_replaced',
      requestId: 'stale-seat',
    }))
  })
})

describe('handleAction guard: no-room', () => {
  it('errors when ctx.currentRoom is null', () => {
    const ctx = newCtx()
    dispatch(ctx, { type: 'action', spaceId: 'whatever' })
    expect(sentTypesOf(ctx)).toContain('error')
  })
})

describe('waiting-room write guard', () => {
  it('rejects game commands before the room starts without replay recording', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 4, name: 'Alice' })
    const takeAction = vi.spyOn(ctx.currentRoom!.session, 'takeAction')

    dispatch(ctx, { type: 'action', spaceId: 'forest', requestId: 'waiting-action' })

    expect(takeAction).not.toHaveBeenCalled()
    expect(sentMessagesOf(ctx)).toContainEqual({
      type: 'error',
      error: 'game has not started',
      requestId: 'waiting-action',
    })
  })
})

describe('custom room command queue', () => {
  it('waits for durable commit completion before dispatching the next command', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    markRoomStarted(ctx)
    const room = ctx.currentRoom!
    const execute = vi.fn(async () => room.session.getState())
    room.customSessionExecutor = { session: room.session, execute, dispose: vi.fn() } as never

    let pending = false
    let commitCount = 0
    let finishCommit: (() => void) | undefined
    let waiter: ((error?: string) => void) | undefined
    const commit = vi.fn((
      _room: unknown,
      _response: unknown,
      _intent: unknown,
      _playerIndex: unknown,
      onCommitted?: (result: { kind: 'committed'; roomVersion: number; stepNo: number; frameHash: string }) => void,
    ) => {
      commitCount += 1
      if (commitCount > 1) {
        return { kind: 'committed' as const, roomVersion: 2, stepNo: 2, frameHash: 'second' }
      }
      pending = true
      finishCommit = () => {
        pending = false
        onCommitted?.({ kind: 'committed', roomVersion: 1, stepNo: 1, frameHash: 'first' })
        waiter?.()
      }
      return { kind: 'blocked' as const, error: 'disk busy' }
    })
    ctx.committer = {
      blockedError: () => pending ? 'disk busy' : undefined,
      isRecording: () => true,
      commit,
      isRetrying: () => pending,
      waitUntilReady: (_roomId: string, callback: (error?: string) => void) => {
        waiter = callback
        return true
      },
    } as never

    const first = Promise.resolve(dispatch(ctx, { type: 'action', spaceId: 'forest' }))
    const second = Promise.resolve(dispatch(ctx, { type: 'action', spaceId: 'clay-pit' }))
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1))

    expect(execute).toHaveBeenCalledTimes(1)
    finishCommit?.()
    await Promise.all([first, second])
    expect(execute).toHaveBeenCalledTimes(2)
    expect(commit).toHaveBeenCalledTimes(2)
  })

  it('keeps a rematch queued through initial durable persistence', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id, name: 'guest' })

    let pending = false
    let publishReady: ((result: {
      kind: 'committed'
      roomVersion: number
      stepNo: number
      frameHash: string
    }) => void) | undefined
    let waiter: ((error?: string) => void) | undefined
    const committer = {
      canCreateRoom: () => ({ ok: true }),
      hasReplay: () => false,
      retireRoom: vi.fn(),
      lockNewRoom: vi.fn(),
      prepareRoom: (_room: unknown, options: { onReady?: typeof publishReady }) => {
        pending = true
        publishReady = options.onReady
        return { kind: 'blocked' as const, error: 'disk busy' }
      },
      blockedError: () => pending ? 'disk busy' : undefined,
      isRetrying: () => pending,
      isRecording: () => false,
      waitUntilReady: (_roomId: string, callback: (error?: string) => void) => {
        waiter = callback
        return true
      },
    } as never
    host.committer = committer
    guest.committer = committer

    const rematch = Promise.resolve(dispatch(host, { type: 'newGame', seed: 309 }))
    const takeAction = vi.spyOn(host.currentRoom!.session, 'takeAction')
    const action = Promise.resolve(dispatch(guest, { type: 'action', spaceId: 'forest' }))

    expect(takeAction).not.toHaveBeenCalled()
    pending = false
    publishReady?.({ kind: 'committed', roomVersion: 0, stepNo: 0, frameHash: 'initial' })
    waiter?.()
    await Promise.all([rematch, action])
    expect(takeAction).toHaveBeenCalledTimes(1)
  })

  it('finishes queued room commands before the same connection changes rooms', async () => {
    const deps = newDeps()
    const ctx = newCtx(deps)
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    markRoomStarted(ctx)
    const source = ctx.currentRoom!
    const destinationHost = newCtx(deps)
    dispatch(destinationHost, { type: 'createRoom', maxPlayers: 2, name: 'other' })
    const destination = destinationHost.currentRoom!
    const response = source.session.getState()
    let releaseFirst: (response: typeof response) => void = () => {}
    const firstResponse = new Promise<typeof response>((resolve) => {
      releaseFirst = resolve
    })
    const execute = vi.fn()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementation(() => Promise.resolve(source.session.getState()))
    source.customSessionExecutor = {
      session: source.session,
      execute,
      dispose: vi.fn(),
    } as never

    const first = Promise.resolve(dispatch(ctx, { type: 'action', spaceId: 'forest' }))
    const second = Promise.resolve(dispatch(ctx, { type: 'action', spaceId: 'clay-pit' }))
    const join = Promise.resolve(dispatch(ctx, { type: 'joinRoom', roomId: destination.id }))

    expect(execute).toHaveBeenCalledTimes(1)
    expect(ctx.currentRoom).toBe(source)
    releaseFirst(response)
    await Promise.all([first, second, join])
    expect(execute).toHaveBeenCalledTimes(2)
    expect(ctx.currentRoom).toBe(destination)
  })
})

describe('seat-binding guards', () => {
  const setupTwoSeatRoom = () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    markRoomStarted(ctx)
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
    markRoomStarted(ctx)
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
    markRoomStarted(ctx)
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

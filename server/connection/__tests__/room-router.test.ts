import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { describe, expect, it, vi } from 'vitest'
import { createConnectionCtx } from '../connection-ctx.ts'
import { snapshotToRoom } from '../../game/room.ts'
import { GameSession, type SessionResponse } from '../../game/authoritative-session.ts'
import type { GameState } from '../../../shared/contract/types.ts'
import type { CustomCardData } from '../../../shared/cards/session-card-context.ts'

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

const WIDE_SEED = /^[0-9a-f]{32}$/

const { newDeps, dispatch } = recordedRouterFixture()

const newCtx = (deps = newDeps()) => {
  const ws = fakeWs() as never
  return Object.assign(
    createConnectionCtx(ws, deps, true),
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

const markRoomStarted = async (ctx: ReturnType<typeof newCtx>) => {
  ctx.currentRoom!.status = 'playing'
  ctx.currentRoom!.startedAt ??= 1
  const prepared = await ctx.committer!.prepareRoom(ctx.currentRoom!, { missingPrefix: false })
  expect(prepared.kind).toBe('committed')
}

describe('handleCreateRoom', () => {
  it.each([undefined, 'Player 6'])('preserves name provenance through join, rejoin and rematch for %s', async (name) => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, name })
    for (const player of host.currentRoom!.session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const expectedHost = { name: name ?? 'Player 1', nameIsDefault: name === undefined }
    expect(host.currentRoom!.session.state.players[0]).toMatchObject(expectedHost)

    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    await dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id })
    expect(host.currentRoom!.status).toBe('playing')
    expect(host.currentRoom!.session.state.players[0]).toMatchObject(expectedHost)
    expect(host.currentRoom!.session.state.players[1]).toMatchObject({ name: 'Player 2', nameIsDefault: true })

    const rejoined = newCtx(deps)
    rejoined.currentUserId = 'u2'
    await dispatch(rejoined, { type: 'joinRoom', roomId: host.currentRoom!.id, requestedPlayerIndex: 1 })
    expect(rejoined.currentPlayerIndex).toBe(1)
    expect(rejoined.currentRoom!.session.state.players[1]).toMatchObject({ name: 'Player 2', nameIsDefault: true })

    await dispatch(host, { type: 'newGame', seed: 936 })
    expect(host.currentRoom!.session.state.players[0]).toMatchObject(expectedHost)
    expect(host.currentRoom!.session.state.players[1]).toMatchObject({ name: 'Player 2', nameIsDefault: true })
  })

  it('creates a room + sets ctx.currentRoom + sends roomCreated', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    expect(ctx.currentRoom).not.toBeNull()
    expect(ctx.currentPlayerIndex).toBe(0)
    expect(ctx.currentRoom!.players.length).toBe(1)
    expect(sentTypesOf(ctx)).toContain('roomCreated')
  })

  it('caps ordinary waiting and playing rooms at 30 while excluding development rooms', async () => {
    const ctx = newCtx()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const devRoom = ctx.currentRoom!
    ctx.registry.delete(devRoom.id)
    devRoom.id = 'dev2-00000000-0000-4000-8000-000000000000'
    ctx.registry.set(devRoom)
    for (let index = 0; index < 30; index += 1) {
      await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    }

    await dispatch(ctx, {
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

  it('checkpoints created rooms with state and host metadata', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'

    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })

    const snap = (await ctx.persistence.load(ctx.currentRoom!.id))
    expect(snap?.serialized).not.toBeNull()
    expect(snap?.meta.players).toEqual([{ userId: 'u1', playerIndex: 0 }])
  })

  it('clamps maxPlayers to [2, 6]', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 99 })
    expect(ctx.currentRoom!.maxPlayers).toBe(6)

    const lowCtx = newCtx()
    lowCtx.currentUserId = 'u1'
    await dispatch(lowCtx, { type: 'createRoom', maxPlayers: 1 })
    expect(lowCtx.currentRoom!.maxPlayers).toBe(2)
  })

  it('creates a six-player room session and announces six seats', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 6, name: 'host' })

    expect(ctx.currentRoom!.maxPlayers).toBe(6)
    expect(ctx.currentRoom!.session.state.players).toHaveLength(6)
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({
      type: 'roomCreated',
      maxPlayers: 6,
    }))
  })

  it('forwards enableParentCards into the created room session', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })

    expect(ctx.currentRoom!.session.state.enableParentCards).toBe(true)
    expect(ctx.currentRoom!.session.state.phase).toBe('parent-selection')
  })

  it('ignores a client seed outside dev rooms', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    ;(await markRoomStarted(ctx))
    const previousSeed = ctx.currentRoom!.session.state.gameSeed

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    const seed = ctx.currentRoom!.session.state.gameSeed
    expect(seed).toMatch(WIDE_SEED)
    expect(seed).not.toBe(previousSeed)
  })

  it('lets a dev room start a new game on an Explicit Seed', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const devRoom = ctx.currentRoom!
    ctx.registry.delete(devRoom.id)
    devRoom.id = 'dev2-00000000-0000-4000-8000-000000000000'
    ctx.registry.set(devRoom)
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toBe(309)
  })

  it('preserves enableParentCards when starting a new game', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toMatch(WIDE_SEED)
    expect(ctx.currentRoom!.session.state.enableParentCards).toBe(true)
    expect(ctx.currentRoom!.session.state.phase).toBe('parent-selection')
  })

  it('reloads custom cards through the current gate when starting a new game', async () => {
    // A rematch is a new game (#642): the embedded snapshot is NOT reused —
    // cards deleted, taken down or graduated to built-in since the original
    // game must not resurrect in the fresh room.
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
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
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.getCustomCardDefs()).toEqual([])
  })

  it('keeps the prior room when rematch initialization fails', async () => {
    const deps = newDeps()
    const ctx = newCtx(deps)
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const room = ctx.currentRoom!
    const previousRoomId = room.id
    const previousSession = room.session
    ;(await markRoomStarted(ctx))
    const dispose = vi.fn()
    room.customSessionExecutor = {
      session: room.session,
      execute: vi.fn(),
      dispose,
    } as never
    const failedResponse = {
      ...previousSession.getState(),
      ok: false,
      error: 'worker initialization failed',
    }
    const getState = vi.spyOn(GameSession.prototype, 'getState')
      .mockReturnValueOnce(failedResponse)
    try {
      await dispatch(ctx, { type: 'newGame', seed: 309, requestId: 'new-1' })
    } finally {
      getState.mockRestore()
    }

    expect(ctx.currentRoom).toBe(room)
    expect(room.id).toBe(previousRoomId)
    expect(room.session).toBe(previousSession)
    expect(deps.registry.get(previousRoomId)).toBe(room)
    expect(dispose).not.toHaveBeenCalled()
    expect(sentMessagesOf(ctx)).toContainEqual({
      type: 'error',
      error: 'worker initialization failed',
      requestId: 'new-1',
    })
  })

  it('preserves direct Parent Card dealing when starting a new game', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      name: 'Alice',
      enableParentCards: true,
      draftParents: false,
    } as never)

    expect(ctx.currentRoom!.draftParents).toBe(false)
    expect(ctx.currentRoom!.session.state.phase).toBe('playing')
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.phase).toBe('playing')
    expect(ctx.currentRoom!.session.state.parentSelection).toBeNull()
    expect(ctx.currentRoom!.session.state.players.every((player) => player.parentCards.mother)).toBe(true)
    expect(ctx.currentRoom!.session.state.players[0]!.name).toBe('Alice')
    expect(ctx.currentRoom!.session.buildSyncPayload(ctx.currentRoom!.session.getState(), 'p1').state.log.some((entry) => entry.params?.player === 'PlayerA')).toBe(false)
  })

  it('preserves completed simultaneous draft settings across restore and newGame', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })

    const roomId = ctx.currentRoom!.id
    const players = ctx.currentRoom!.players
    ctx.currentRoom!.session.state.phase = 'playing'
    ctx.currentRoom!.session.state.draft = null
    const restored = snapshotToRoom((await ctx.persistence.load(roomId))!)
    restored.players = players
    ctx.registry.delete(roomId)
    ctx.registry.set(restored)
    ctx.currentRoom = restored
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.phase).toBe('draft')
    expect(ctx.currentRoom!.session.state.draft?.poolSize).toBe(8)
  })

  it('uses room display names in direct Parent Card logs', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, {
      type: 'createRoom',
      maxPlayers: 2,
      name: 'PlayerB',
      enableParentCards: true,
      draftParents: false,
    } as never)

    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    await dispatch(guest, {
      type: 'joinRoom',
      roomId: host.currentRoom!.id,
      name: 'Bob',
    })

    const loggedPlayerNames = host.currentRoom!.session.buildSyncPayload(host.currentRoom!.session.getState(), 'p1').state.log
      .map((entry) => entry.params?.player)
      .filter((player): player is string => typeof player === 'string')
    expect(new Set(loggedPlayerNames)).toEqual(new Set(['PlayerB', 'Bob']))
  })

  it('rolls back the final join when custom worker initialization fails', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    const room = host.currentRoom!
    room.customSessionExecutor = {
      session: room.session,
      execute: vi.fn(async () => ({
        ...room.session.getState(),
        ok: false,
        error: 'worker initialization failed',
      })),
      updatePlayerNames: vi.fn(async () => room.session.getState()),
      dispose: vi.fn(),
    } as never
    const playersBefore = [...room.players]
    const seatOwnersBefore = [...(room.seatOwners ?? [])]
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'

    await dispatch(guest, {
      type: 'joinRoom',
      roomId: room.id,
      name: 'guest',
      requestId: 'join-1',
    })

    expect(room.status).toBe('waiting')
    expect(room.startedAt).toBeUndefined()
    expect(room.players).toEqual(playersBefore)
    expect(room.seatOwners).toEqual(seatOwnersBefore)
    expect(guest.currentRoom).toBeNull()
    expect(sentMessagesOf(guest)).toContainEqual({
      type: 'error',
      error: 'worker initialization failed',
      requestId: 'join-1',
    })
    expect(sentTypesOf(host)).not.toContain('gameStarted')
  })

  it('starts a full room when a disconnected owner still reserves a seat', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'Alice' })
    host.currentRoom!.players = []
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'

    await dispatch(guest, {
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

  it('checkpoints newGame state through the broadcast path', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect((await ctx.persistence.load(ctx.currentRoom!.id))?.serialized?.state.gameSeed).toMatch(WIDE_SEED)
  })

  it('moves newGame to a fresh room id and discards the unfinished game', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const previousRoomId = ctx.currentRoom!.id
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    const nextRoomId = ctx.currentRoom!.id
    expect(nextRoomId).not.toBe(previousRoomId)
    expect(ctx.registry.has(previousRoomId)).toBe(false)
    expect(ctx.registry.has(nextRoomId)).toBe(true)
    expect((await ctx.persistence.load(previousRoomId))).toBeNull()
    expect(await ctx.gameContextStore!.lifecycle(previousRoomId)).toBe('expired')
    expect((await ctx.persistence.load(nextRoomId))?.serialized?.state.gameSeed).toMatch(WIDE_SEED)
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({
      type: 'stateUpdate',
      roomId: nextRoomId,
    }))
  })

  it('preserves fixed dev room privileges under the new game id', async () => {
    const ctx = newCtx()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const createdRoomId = ctx.currentRoom!.id
    ctx.registry.delete(createdRoomId)
    ;(await ctx.checkpoint.discardRoom(createdRoomId))
    ctx.currentRoom!.id = 'dev2'
    ctx.registry.set(ctx.currentRoom!)
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })
    const nextRoomId = ctx.currentRoom!.id
    const before = sentTypesOf(ctx).length
    await dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 5 } })

    expect(nextRoomId).toMatch(/^dev2-[0-9a-f-]{36}$/)
    expect(nextRoomId).not.toBe('dev2')
    expect(sentTypesOf(ctx).slice(before)).toContain('stateUpdate')
  })

  it('does not carry disconnected seat owners into the new room id', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2 })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    await dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id })
    host.currentRoom!.players = host.currentRoom!.players.filter((player) =>
      player.userId === 'u1'
    )

    await dispatch(host, { type: 'newGame', seed: 309 })

    expect(host.currentRoom!.seatOwners).toEqual([
      { playerIndex: 0, userId: 'u1' },
    ])
    expect(host.currentRoom!.status).toBe('waiting')
    expect(sentMessagesOf(host)).toContainEqual({
      type: 'roomWaiting',
      roomId: host.currentRoom!.id,
      players: [{ playerIndex: 0, name: '' }],
      maxPlayers: 2,
    })
    const replacement = newCtx(deps)
    replacement.currentUserId = 'u3'
    await dispatch(replacement, { type: 'joinRoom', roomId: host.currentRoom!.id })
    expect(replacement.currentPlayerIndex).toBe(1)
  })

  it('switches every connected seat to the new game id before broadcasting', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    await dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id, name: 'guest' })
    const previousRoomId = host.currentRoom!.id

    await dispatch(host, { type: 'newGame', seed: 309 })

    expect(guest.currentRoom).toBe(host.currentRoom)
    expect(guest.currentRoom!.id).not.toBe(previousRoomId)
    expect(sentMessagesOf(guest)).toContainEqual(expect.objectContaining({
      type: 'stateUpdate',
      roomId: host.currentRoom!.id,
    }))
  })

  it('checkpoints loadGame state through the broadcast path', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const devRoom = ctx.currentRoom!
    ctx.registry.delete(devRoom.id)
    devRoom.id = 'dev2-00000000-0000-4000-8000-000000000000'
    ctx.registry.set(devRoom)
    ;(await markRoomStarted(ctx))
    const loaded = JSON.parse(JSON.stringify(ctx.currentRoom!.session.getState().state)) as GameState
    loaded.gameSeed = 777

    await dispatch(ctx, { type: 'loadGame', state: loaded })

    expect((await ctx.persistence.load(ctx.currentRoom!.id))?.serialized?.state.gameSeed).toBe(777)
  })

  it('sends an ordinary room the round card that a card effect revealed', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    ;(await markRoomStarted(ctx))
    const session = ctx.currentRoom!.session
    const state = session.getState().state
    state.round = 5
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const owner = state.players[0]!
    owner.resources.clay = owner.rooms + 5
    owner.resources.reed = 5
    owner.minorHand = ['B023_FinalScenario']
    session.loadState(state)
    session.devPlayCard(0, 'B023_FinalScenario')

    await dispatch(ctx, { type: 'getState', requestId: 'state-1' })

    const update = sentMessagesOf(ctx).find((message) => message.requestId === 'state-1') as {
      payload: { state: { roundActionOrder: (string | null)[]; gameSeed?: unknown } }
    }
    const order = update.payload.state.roundActionOrder
    expect(order.map((actionId) => actionId !== null)).toEqual([
      true, true, true, true, true, false, false, false, false, false, false, false, false, true,
    ])
    expect(order[13]).toBe(session.state.roundActionOrder[13])
    expect(update.payload.state).not.toHaveProperty('gameSeed')
  })

  it('rejects loadGame outside dev rooms', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    ;(await markRoomStarted(ctx))
    const session = ctx.currentRoom!.session
    const seedBefore = session.state.gameSeed
    const forged = JSON.parse(JSON.stringify(session.getState().state)) as GameState
    forged.gameSeed = 777
    forged.players[0]!.resources.wood = 99

    await dispatch(ctx, { type: 'loadGame', state: forged, requestId: 'load-1' })

    expect(sentMessagesOf(ctx)).toContainEqual({
      type: 'error',
      error: 'dev commands disabled for this room',
      requestId: 'load-1',
    })
    expect(ctx.currentRoom!.session.state.gameSeed).toBe(seedBefore)
    expect(ctx.currentRoom!.session.state.players[0]!.resources.wood).toBe(0)
  })

  it('exports unredacted state only from development rooms', async () => {
    const ctx = newCtx()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    const room = ctx.currentRoom!
    ctx.registry.delete(room.id)
    room.id = 'dev2'
    ctx.registry.set(room)
    room.session.state.players[0]!.minorHand = ['minor-a']
    room.session.state.players[1]!.minorHand = ['minor-b']
    ;(ctx.ws.send as unknown as ReturnType<typeof vi.fn>).mockClear()

    await dispatch(ctx, { type: 'getState', unredacted: true, requestId: 'export-1' })

    const message = sentMessagesOf(ctx).findLast((entry) => entry.type === 'stateUpdate') as {
      payload: { state: GameState }
    }
    expect(message.payload.state.players[0]!.minorHand).toEqual(['minor-a'])
    expect(message.payload.state.players[1]!.minorHand).toEqual(['minor-b'])
  })

  it('rejects unredacted state export outside development rooms', async () => {
    const ctx = newCtx()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    ;(ctx.ws.send as unknown as ReturnType<typeof vi.fn>).mockClear()

    await dispatch(ctx, { type: 'getState', unredacted: true, requestId: 'export-1' })

    expect(sentMessagesOf(ctx)).toContainEqual({
      type: 'error',
      error: 'dev commands disabled for this room',
      requestId: 'export-1',
    })
  })

  it('forwards enableThroughTheSeasons into the created room session', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableThroughTheSeasons: true } as never)

    expect(ctx.currentRoom!.session.state.enableThroughTheSeasons).toBe(true)
    expect(ctx.currentRoom!.session.state.throughTheSeasons).not.toBeNull()
  })

  it('preserves enableThroughTheSeasons when starting a new game', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableThroughTheSeasons: true } as never)
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toMatch(WIDE_SEED)
    expect(ctx.currentRoom!.session.state.enableThroughTheSeasons).toBe(true)
    expect(ctx.currentRoom!.session.state.throughTheSeasons).not.toBeNull()
  })

  it('forwards enableFarmersOfTheMoor into the created room session', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    } as never)

    expect(ctx.currentRoom!.session.state.enableFarmersOfTheMoor).toBe(true)
    expect(ctx.currentRoom!.session.state.farmersOfTheMoor).not.toBeNull()
  })

  it('allows enableFarmersOfTheMoor by default once its minor pool is sufficient', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableFarmersOfTheMoor: true } as never)

    expect(ctx.currentRoom!.session.state.enableFarmersOfTheMoor).toBe(true)
    expect(ctx.currentRoom!.session.state.players.every((player) =>
      player.minorHand.filter((id) => id.startsWith('M')).length === 4,
    )).toBe(true)
    expect(ctx.currentRoom!.allowIncompleteFarmersOfTheMoorMinorDeal).toBe(false)
  })

  it('preserves enableFarmersOfTheMoor when starting a new game', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, {
      type: 'createRoom',
      maxPlayers: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    } as never)
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toMatch(WIDE_SEED)
    expect(ctx.currentRoom!.session.state.enableFarmersOfTheMoor).toBe(true)
    expect(ctx.currentRoom!.session.state.farmersOfTheMoor).not.toBeNull()
  })

  it('forwards enableSnakeOpening into the created room session', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableSnakeOpening: true } as never)

    expect(ctx.currentRoom!.enableSnakeOpening).toBe(true)
    expect(ctx.currentRoom!.session.state.enableSnakeOpening).toBe(true)
    expect(ctx.currentRoom!.session.state.snakeOpening).toEqual({ reversed: false })
  })

  it('leaves enableSnakeOpening off when createRoom omits it', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })

    expect(ctx.currentRoom!.enableSnakeOpening).toBe(false)
    expect(ctx.currentRoom!.session.state.enableSnakeOpening).toBe(false)
    expect(ctx.currentRoom!.session.state.snakeOpening).toBeNull()
  })

  it('preserves enableSnakeOpening when starting a new game', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableSnakeOpening: true } as never)
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.session.state.gameSeed).toMatch(WIDE_SEED)
    expect(ctx.currentRoom!.enableSnakeOpening).toBe(true)
    expect(ctx.currentRoom!.session.state.enableSnakeOpening).toBe(true)
    expect(ctx.currentRoom!.session.state.snakeOpening).toEqual({ reversed: false })
  })

  it('preserves six seats when starting a new game', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 6 })
    ;(await markRoomStarted(ctx))

    await dispatch(ctx, { type: 'newGame', seed: 309 })

    expect(ctx.currentRoom!.maxPlayers).toBe(6)
    expect(ctx.currentRoom!.session.state.gameSeed).toMatch(WIDE_SEED)
    expect(ctx.currentRoom!.session.state.players).toHaveLength(6)
  })
})

describe('active room recovery', () => {
  it('returns the authoritative waiting-room state when its owner reconnects', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 4, name: 'Alice' })
    const roomId = host.currentRoom!.id
    const replacement = newCtx(deps)
    replacement.currentUserId = 'u1'

    await dispatch(replacement, {
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

  it('restores every original seat after restart with only its own hidden information', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'Alice' })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    await dispatch(guest, {
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
    await deps.committer.commit(host.currentRoom!, host.currentRoom!.session.getState(), { commandType: 'loadGame', intentJson: '{}' }, 0)

    const restarted = newDeps(deps.persistence)
    restarted.registry.set(snapshotToRoom((await deps.persistence.load(roomId))!))
    const recoveredHost = newCtx(restarted)
    recoveredHost.currentUserId = 'u1'
    await dispatch(recoveredHost, {
      type: 'joinRoom',
      roomId,
      intent: 'resume',
      requestedPlayerIndex: 1,
      name: 'Alice',
    })
    const recoveredGuest = newCtx(restarted)
    recoveredGuest.currentUserId = 'u2'
    await dispatch(recoveredGuest, {
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

  it('rejects non-participants and revokes a replaced seat immediately', async () => {
    const deps = newDeps()
    const original = newCtx(deps)
    original.currentUserId = 'u1'
    await dispatch(original, { type: 'createRoom', maxPlayers: 2, name: 'Alice' })
    const roomId = original.currentRoom!.id

    const outsider = newCtx(deps)
    outsider.currentUserId = 'u2'
    await dispatch(outsider, {
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
    await dispatch(replacement, {
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

    await dispatch(original, { type: 'getState', requestId: 'stale-seat' })
    expect(sentMessagesOf(original)).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'seat_replaced',
      requestId: 'stale-seat',
    }))
  })
})

describe('handleAction guard: no-room', () => {
  it('errors when ctx.currentRoom is null', async () => {
    const ctx = newCtx()
    await dispatch(ctx, { type: 'action', spaceId: 'whatever' })
    expect(sentTypesOf(ctx)).toContain('error')
  })
})

describe('durable rejection publication', () => {
  it('sends the rejection only to its submitter and a successful snapshot to peers', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    await dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id, name: 'guest' })
    const room = host.currentRoom!
    const versionBefore = room.version
    ;(host.ws.send as unknown as ReturnType<typeof vi.fn>).mockClear()
    ;(guest.ws.send as unknown as ReturnType<typeof vi.fn>).mockClear()
    vi.spyOn(room.session, 'takeAction').mockReturnValue({
      ...room.session.getState(),
      ok: false,
      durableTransition: true,
      error: 'command would break a mandatory continuation',
    })
    const commit = vi.fn((target: typeof room, response: SessionResponse) => {
      target.version += 1
      expect(response).toMatchObject({ ok: true, durableTransition: true })
      expect(response.error).toBeUndefined()
      return { kind: 'committed' as const, roomVersion: target.version, stepNo: 1, frameHash: 'frame' }
    })
    host.committer = {
      blockedError: () => undefined,
      hasReplay: () => true,
      isRecording: () => true,
      commit,
      isRetrying: () => false,
      waitUntilReady: () => false,
    } as never

    await dispatch(host, { type: 'action', spaceId: 'forest', requestId: 'durable-rejection' })

    expect(sentMessagesOf(host)).toContainEqual(expect.objectContaining({
      type: 'stateUpdate',
      version: versionBefore + 1,
      requestId: 'durable-rejection',
      payload: expect.objectContaining({
        ok: false,
        error: 'command would break a mandatory continuation',
      }),
    }))
    const peerUpdate = sentMessagesOf(guest).find(({ type }) => type === 'stateUpdate')
    expect(peerUpdate).toMatchObject({
      version: versionBefore + 1,
      payload: { ok: true },
    })
    expect((peerUpdate?.payload as Record<string, unknown>).error).toBeUndefined()
    expect(commit).toHaveBeenCalledTimes(1)
  })
})

describe('waiting-room write guard', () => {
  it('rejects gameplay while the room is waiting for its players', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 4, name: 'Alice' })
    const takeAction = vi.spyOn(ctx.currentRoom!.session, 'takeAction')

    await dispatch(ctx, { type: 'action', spaceId: 'forest', requestId: 'waiting-action' })

    expect(takeAction).not.toHaveBeenCalled()
    expect(sentMessagesOf(ctx)).toContainEqual({
      type: 'error',
      error: 'game has not started',
      requestId: 'waiting-action',
    })
  })
})

describe('custom room command queue', () => {
  it('rejects commands queued before a rematch changes the room generation', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    await dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id, name: 'guest' })
    const room = host.currentRoom!
    const previousSession = room.session
    const originalGetState = GameSession.prototype.getState
    let releaseInitialization = () => {}
    const initialization = new Promise<void>((resolve) => {
      releaseInitialization = resolve
    })
    let delayed = false
    const getState = vi.spyOn(GameSession.prototype, 'getState')
      .mockImplementation(function (this: GameSession) {
        const response = originalGetState.call(this)
        if (this === previousSession || delayed) return response
        delayed = true
        return initialization.then(() => response) as never
      })

    try {
      const rematch = Promise.resolve(dispatch(host, { type: 'newGame', seed: 309 }))
      const action = Promise.resolve(dispatch(host, {
        type: 'action',
        spaceId: 'forest',
        requestId: 'old-generation-action',
      }))
      releaseInitialization()
      await Promise.all([rematch, action])

      expect(room.session).not.toBe(previousSession)
      expect(room.session.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
        .toEqual([])
      expect(sentMessagesOf(host)).toContainEqual({
        type: 'error',
        error: 'Resume the original room before retrying this command',
        code: 'command_input_stale',
        requestId: 'old-generation-action',
      })
    } finally {
      getState.mockRestore()
    }
  })

  it('finishes queued room commands before the same connection changes rooms', async () => {
    const deps = newDeps()
    const ctx = newCtx(deps)
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    ;(await markRoomStarted(ctx))
    const source = ctx.currentRoom!
    const destinationHost = newCtx(deps)
    await dispatch(destinationHost, { type: 'createRoom', maxPlayers: 2, name: 'other' })
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
      serializedStateForPersistence: () => undefined,
      execute,
      dispose: vi.fn(),
    } as never

    const first = Promise.resolve(dispatch(ctx, { type: 'action', spaceId: 'forest' }))
    const second = Promise.resolve(dispatch(ctx, { type: 'action', spaceId: 'clay-pit' }))
    const join = Promise.resolve(dispatch(ctx, { type: 'joinRoom', roomId: destination.id }))

    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    expect(ctx.currentRoom).toBe(source)
    releaseFirst(response)
    await Promise.all([first, second, join])
    expect(execute).toHaveBeenCalledTimes(2)
    expect(ctx.currentRoom).toBe(destination)
  })
})

describe('seat-binding guards', () => {
  const setupTwoSeatRoom = async (options: { dev?: boolean; draft?: boolean } = {}) => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host', ...(options.draft ? { draftMode: 'simultaneous', draftPoolSize: 7 } : {}) })
    if (options.dev) { ctx.registry.delete(ctx.currentRoom!.id); ctx.currentRoom!.id = 'dev2'; ctx.registry.set(ctx.currentRoom!); ctx.committer!.lockNewRoom(ctx.currentRoom!) }
    ;(await markRoomStarted(ctx))
    return ctx
  }

  it('devSetResources rejects foreign seat', async () => {
    const ctx = await setupTwoSeatRoom({ dev: true })
    const before = sentTypesOf(ctx).length
    await dispatch(ctx, { type: 'devSetResources', playerIndex: 1, resources: { wood: 5 } })
    const after = sentTypesOf(ctx)
    const newSent = after.slice(before)
    expect(newSent.filter((t) => t === 'error')).toHaveLength(1)
  })

  it('checkpoints joined seat metadata', async () => {
    const deps = newDeps()
    const host = newCtx(deps)
    host.currentUserId = 'u1'
    await dispatch(host, { type: 'createRoom', maxPlayers: 2, name: 'host' })

    const guest = newCtx(deps)
    guest.currentUserId = 'u2'
    await dispatch(guest, { type: 'joinRoom', roomId: host.currentRoom!.id, name: 'guest' })

    expect((await guest.persistence.load(host.currentRoom!.id))?.meta.players).toEqual([
      { userId: 'u1', playerIndex: 0 },
      { userId: 'u2', playerIndex: 1 },
    ])
    expect((await guest.persistence.load(host.currentRoom!.id))?.meta.startedAt).toEqual(expect.any(Number))
  })

  it('devSetResources accepts own seat', async () => {
    const ctx = await setupTwoSeatRoom({ dev: true })
    const before = sentTypesOf(ctx).length
    await dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 5 } })
    const newSent = sentTypesOf(ctx).slice(before)
    expect(newSent).toContain('stateUpdate')
  })

  it('rejects dev commands in non-dev rooms', async () => {
    const ctx = await setupTwoSeatRoom()
    // currentRoom.id is a random non-dev id from generateRoomId()
    await dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 5 } })
    const errors = sentMessagesOf(ctx).filter((m) => m.type === 'error')
    expect(errors.some((e) => /dev commands disabled/.test(String(e.error)))).toBe(true)
  })

  it('draftSubmit rejects foreign playerId', async () => {
    const ctx = await setupTwoSeatRoom({ draft: true })
    await dispatch(ctx, { type: 'draftSubmit', playerId: 'fake-id', pick: { occCardId: '', minorCardId: '' } })
    const errors = sentMessagesOf(ctx).filter((m) => m.type === 'error')
    expect(errors.some((e) => /seat mismatch/.test(String(e.error)))).toBe(true)
  })

  it('parentSubmit rejects foreign seat', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })
    ;(await markRoomStarted(ctx))
    const p1Candidates = ctx.currentRoom!.session.state.parentSelection!.candidates.p1

    await dispatch(ctx, {
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

  it('parentSubmit routes own parent selection to the session', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, enableParentCards: true })
    ;(await markRoomStarted(ctx))
    const p1Candidates = ctx.currentRoom!.session.state.parentSelection!.candidates.p1

    await dispatch(ctx, {
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
  it('emits error', async () => {
    const ctx = newCtx()
    await dispatch(ctx, { type: 'no-such-cmd' as never } as never)
    expect(sentTypesOf(ctx)).toContain('error')
  })
})

describe('authenticated Room history reads', () => {
  it('returns a viewer-filtered page to the active seat without advancing the Room', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'history-user'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'History actor' })
    const room = ctx.currentRoom!
    const version = room.version
    const cursor = room.session.createSessionPrivateCursor()
    await dispatch(ctx, { type: 'getHistory', requestId: 'history-1' })
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({ type: 'historyPage', requestId: 'history-1', roomId: room.id, page: expect.objectContaining({ log: expect.any(Array), events: expect.any(Array), publicEventArchive: expect.any(Array) }) }))
    expect(room.version).toBe(version)
    expect(room.session.createSessionPrivateCursor()).toEqual(cursor)
  })

  it('does not expose an uncommitted history while durable saving is paused', async () => {
    const ctx = newCtx()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    Object.assign(ctx, { committer: { blockedError: () => 'disk full' } })
    await dispatch(ctx, { type: 'getHistory', requestId: 'paused-history' })
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({ type: 'error', error: 'room saving is paused: disk full', requestId: 'paused-history' }))
    expect(sentTypesOf(ctx)).not.toContain('historyPage')
  })

  it('rejects history reads from a replaced seat and from outside a Room', async () => {
    const ctx = newCtx()
    await dispatch(ctx, { type: 'getHistory', requestId: 'outside' })
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({ type: 'error', error: 'not in a room', requestId: 'outside' }))
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2 })
    ctx.currentRoom!.players[0]!.ws = fakeWs() as never
    await dispatch(ctx, { type: 'getHistory', requestId: 'replaced' })
    expect(sentMessagesOf(ctx)).toContainEqual(expect.objectContaining({ type: 'error', code: 'seat_replaced', requestId: 'replaced' }))
  })
})

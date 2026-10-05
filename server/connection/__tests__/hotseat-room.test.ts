import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { describe, expect, it, vi } from 'vitest'
import { createConnectionCtx } from '../connection-ctx.ts'
import { snapshotToRoom, summarizeRoomsForLobby, toRoomMeta } from '../../game/room.ts'
import { GameSession } from '../../game/authoritative-session.ts'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game.ts'

/**
 * A local hotseat game is an ordinary authoritative room whose seats all belong
 * to one device. These tests pin the four things that makes different from a
 * normal room: it starts immediately, one connection may act for every seat,
 * nobody else can join it, and it never shows up in the lobby list.
 */
const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

const GameSessionPrototype = GameSession.prototype as unknown as { getState: () => unknown }
const GameSessionGetState = GameSessionPrototype.getState

const { newDeps, dispatch } = recordedRouterFixture()

const newCtx = (deps = newDeps()) => {
  const ws = fakeWs() as never
  return Object.assign(
    createConnectionCtx(ws, deps, true),
    { deps },
  )
}

const sentMessagesOf = (ctx: ReturnType<typeof newCtx>): Array<Record<string, unknown>> => {
  const send = ctx.ws.send as unknown as ReturnType<typeof vi.fn>
  return send.mock.calls.map(([raw]) => JSON.parse(raw as string) as Record<string, unknown>)
}

const errorsOf = (ctx: ReturnType<typeof newCtx>): string[] =>
  sentMessagesOf(ctx).filter((msg) => msg.type === 'error').map((msg) => String(msg.error))

const createHotseatRoom = async (ctx: ReturnType<typeof newCtx>, maxPlayers = 2, enableParentCards = false) => {
  ctx.currentUserId = 'owner'
  await dispatch(ctx, { type: 'createRoom', maxPlayers, name: 'Owner', hotseat: true, enableParentCards })
  return ctx.currentRoom!
}

describe('hotseat room creation', () => {
  it('marks the room and starts it right away instead of waiting for players', async () => {
    const ctx = newCtx()
    const room = await createHotseatRoom(ctx, 4)

    expect(room.hotseat).toBe(true)
    expect(room.maxPlayers).toBe(4)
    expect(room.session.getState().state.players).toHaveLength(4)
    expect(room.status).toBe('playing')
    expect(room.startedAt).toBeGreaterThan(0)

    const created = sentMessagesOf(ctx).find((msg) => msg.type === 'roomCreated')
    expect(created?.hotseat).toBe(true)
  })

  it('reports a failed deal instead of confirming the room', async () => {
    const deps = newDeps()
    const ctx = newCtx(deps)
    ctx.currentUserId = 'owner'
    // Stands in for an executable community card whose first getState times out.
    GameSessionPrototype.getState = () => ({ ok: false, error: 'worker timed out' }) as never
    try {
      await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'Owner', hotseat: true })
    } finally {
      GameSessionPrototype.getState = GameSessionGetState
    }

    // The client stops listening for creation errors once roomCreated arrives,
    // so a room that fails to initialize must never be confirmed.
    expect(sentMessagesOf(ctx).map((msg) => msg.type)).not.toContain('roomCreated')
    expect(errorsOf(ctx)).toContain('worker timed out')
    expect([...deps.registry.iter()]).toEqual([])
  })

  it('leaves an ordinary room waiting and unflagged', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })

    expect(ctx.currentRoom!.hotseat).toBeUndefined()
    expect(ctx.currentRoom!.status).toBe('waiting')
    const created = sentMessagesOf(ctx).find((msg) => msg.type === 'roomCreated')
    expect(created?.hotseat).toBeUndefined()
  })
})

describe('hotseat seat ownership', () => {
  it('applies a seatless command to the seat the engine is waiting on', async () => {
    const ctx = newCtx()
    const room = await createHotseatRoom(ctx, 3)
    // Force the game onto a seat other than the one this connection joined as.
    room.session.getState().state.currentPlayerIndex = 1
    const takeAction = vi.spyOn(room.session, 'takeAction')

    ctx.currentPlayerIndex = 0
    await dispatch(ctx, { type: 'action', spaceId: 'forest' })

    expect(takeAction).toHaveBeenCalledWith(1, 'forest')
  })

  it('lets a seat-naming command act for any seat in the room', async () => {
    const ctx = newCtx()
    const room = await createHotseatRoom(ctx, 3, true)
    const submit = vi.spyOn(room.session, 'submitParentSelection')

    ctx.currentPlayerIndex = 0
    await dispatch(ctx, {
      type: 'parentSubmit',
      playerIndex: 2,
      selection: { mother: 'M1', father: 'F1' } as never,
    })

    expect(errorsOf(ctx).filter((error) => error.includes('seat mismatch'))).toEqual([])
    expect(submit).toHaveBeenCalledWith(2, expect.anything())
  })

  it('still rejects a seat that does not exist in the game', async () => {
    const ctx = newCtx()
    await createHotseatRoom(ctx, 2, true)

    await dispatch(ctx, {
      type: 'parentSubmit',
      playerIndex: 5,
      selection: { mother: 'M1', father: 'F1' } as never,
    })

    expect(errorsOf(ctx)).toContain('seat out of range for this game')
  })

  it('keeps the strict one-seat rule for ordinary rooms', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host', enableParentCards: true })
    const room = ctx.currentRoom!
    room.status = 'playing'
    room.startedAt ??= 1
    await ctx.committer!.prepareRoom(room, { missingPrefix: false })

    await dispatch(ctx, {
      type: 'parentSubmit',
      playerIndex: 1,
      selection: { mother: 'M1', father: 'F1' } as never,
    })

    expect(errorsOf(ctx)).toContain('seat mismatch: you cannot act on another player')
  })

  it('leaves an ordinary room acting as its own seat', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    const room = ctx.currentRoom!
    room.status = 'playing'
    room.startedAt ??= 1
    await ctx.committer!.prepareRoom(room, { missingPrefix: false })
    room.session.getState().state.currentPlayerIndex = 1
    const takeAction = vi.spyOn(room.session, 'takeAction')

    await dispatch(ctx, { type: 'action', spaceId: 'forest' })

    expect(takeAction).toHaveBeenCalledWith(0, 'forest')
  })
})

describe('hotseat snapshot projection', () => {
  const stateUpdateOf = (ctx: ReturnType<typeof newCtx>) =>
    sentMessagesOf(ctx).filter((msg) => msg.type === 'stateUpdate') as unknown as StateUpdateEnvelope[]

  it('shows every seat unredacted to the connection that plays them all', async () => {
    const ctx = newCtx()
    await createHotseatRoom(ctx, 3)

    const payload = stateUpdateOf(ctx).at(-1)!.payload
    // Per-seat redaction masks other players' cards as '?', which would make
    // every seat but the first unplayable for a hotseat client.
    for (const player of payload.state.players) {
      expect(player.occupationHand ?? []).not.toContain('?')
      expect(player.minorHand ?? []).not.toContain('?')
    }
    expect(payload.cardAvailability).toBeDefined()
  })

  it('keeps redacting other seats in an ordinary room', async () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    const room = ctx.currentRoom!
    room.status = 'playing'
    room.startedAt ??= 1
    await ctx.committer!.prepareRoom(room, { missingPrefix: false })
    await dispatch(ctx, { type: 'getState' })

    const payload = stateUpdateOf(ctx).at(-1)!.payload
    const others = payload.state.players.filter((_, index) => index !== 0)
    expect(others.some((player) => (player.occupationHand ?? []).includes('?'))).toBe(true)
  })
})

describe('hotseat replay attribution', () => {
  it('credits the acting seat, not the connection seat', async () => {
    const deps = newDeps()
    const ctx = newCtx(deps)
    const room = await createHotseatRoom(ctx, 3)
    const commit = vi.spyOn(ctx.committer!, 'commit')

    // Seat 1 acts while the connection is still seated at 0.
    room.session.getState().state.currentPlayerIndex = 1
    ctx.currentPlayerIndex = 0
    await dispatch(ctx, { type: 'action', spaceId: 'forest' })

    expect(commit).toHaveBeenCalledWith(room, expect.anything(), expect.anything(), 1, expect.any(Function), expect.anything())
  })
})

describe('hotseat room access', () => {
  it('refuses anyone but the owner', async () => {
    const deps = newDeps()
    const owner = newCtx(deps)
    const room = await createHotseatRoom(owner, 2)

    const stranger = newCtx(deps)
    stranger.currentUserId = 'someone-else'
    await dispatch(stranger, { type: 'joinRoom', roomId: room.id, name: 'Stranger' })

    expect(errorsOf(stranger)).toContain('this is a local hotseat game; only its owner can rejoin')
    expect(stranger.currentRoom).toBeFalsy()
  })

  it('refuses an anonymous connection when the game has an owner', async () => {
    const deps = newDeps()
    const owner = newCtx(deps)
    const room = await createHotseatRoom(owner, 2)

    const anonymous = newCtx(deps)
    await dispatch(anonymous, { type: 'joinRoom', roomId: room.id, name: 'Nobody' })

    expect(errorsOf(anonymous)).toContain('this is a local hotseat game; only its owner can rejoin')
  })

  it('leaves an ownerless hotseat game reachable', async () => {
    // Anonymous deployments have no account to own the room; locking it to an
    // owner that does not exist would make the game unreachable for everyone.
    const deps = newDeps()
    const anonymousOwner = newCtx(deps)
    await dispatch(anonymousOwner, { type: 'createRoom', maxPlayers: 2, name: 'Owner', hotseat: true })
    const room = anonymousOwner.currentRoom!
    expect(room.createdBy).toBeUndefined()

    const reconnect = newCtx(deps)
    await dispatch(reconnect, { type: 'joinRoom', roomId: room.id, name: 'Owner' })

    expect(errorsOf(reconnect).filter((error) => error.includes('hotseat'))).toEqual([])
  })

  it('lets the owner rejoin the running game', async () => {
    const deps = newDeps()
    const owner = newCtx(deps)
    const room = await createHotseatRoom(owner, 2)

    const reconnect = newCtx(deps)
    reconnect.currentUserId = 'owner'
    await dispatch(reconnect, { type: 'joinRoom', roomId: room.id, name: 'Owner' })

    const joined = sentMessagesOf(reconnect).find((msg) => msg.type === 'roomJoined')
    expect(joined?.hotseat).toBe(true)
    expect(joined?.status).toBe('playing')
  })
})

describe('hotseat room visibility and persistence', () => {
  it('never appears in the lobby room list', async () => {
    const deps = newDeps()
    const hotseat = newCtx(deps)
    await createHotseatRoom(hotseat, 2)
    const ordinary = newCtx(deps)
    ordinary.currentUserId = 'u2'
    await dispatch(ordinary, { type: 'createRoom', maxPlayers: 2, name: 'host' })

    const listed = deps.lobby.getRooms()
    expect(listed.map((room) => room.id)).toEqual([ordinary.currentRoom!.id])
    expect(summarizeRoomsForLobby([hotseat.currentRoom!])).toEqual([])
  })

  it('carries the hotseat flag through persistence and restore', async () => {
    const ctx = newCtx()
    const room = await createHotseatRoom(ctx, 3)

    const meta = toRoomMeta(room)
    expect(meta.hotseat).toBe(true)

    const restored = snapshotToRoom({
      id: room.id,
      serialized: null,
      meta,
      updatedAt: 1,
    })
    expect(restored.hotseat).toBe(true)
    expect(restored.maxPlayers).toBe(3)
  })
})

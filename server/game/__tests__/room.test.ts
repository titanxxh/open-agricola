import { describe, expect, it } from 'vitest'
import { serializeState } from '../../../shared/session/serialization.ts'
import { GameSession } from '../authoritative-session.ts'
import {
  FIXED_DEV_ROOMS,
  FIXED_DEV_ROOM_IDS,
  buildFixedDevRoomInitialStateOptions,
  parseFixedDevRoomStartupOptions,
  isFixedDevRoom,
  removePlayerFromRoom,
  resolveJoinRequestPlayerIndex,
  resolveJoinPlayerIndex,
  snapshotToRoom,
} from '../room.ts'

const PRIMARY_DEV_ROOM_ID = FIXED_DEV_ROOMS[0]!.id

const createRoom = (
  id: string,
  playerIndices: number[],
  maxPlayers = 2,
  userIds: Record<number, string> = {},
) => ({
  id,
  maxPlayers,
  players: playerIndices.map((playerIndex) => ({
    playerIndex,
    ws: {} as never,
    name: `Player ${playerIndex + 1}`,
    userId: userIds[playerIndex],
  })),
})

describe('room-manager seat assignment', () => {
  it('binds fixed dev room reconnects to requested seat', () => {
    const room = createRoom(PRIMARY_DEV_ROOM_ID, [0, 1])
    const result = resolveJoinPlayerIndex(room, 0)

    expect(result).toEqual({
      ok: true,
      playerIndex: 0,
      replacedExistingPlayer: true,
    })
  })

  it('rejects taking an occupied seat in non-fixed rooms', () => {
    const room = createRoom('abc123', [0, 1])
    const result = resolveJoinPlayerIndex(room, 0)

    expect(result).toEqual({
      ok: false,
      error: 'player slot occupied',
    })
  })

  it('uses the requested empty seat when available', () => {
    const room = createRoom(PRIMARY_DEV_ROOM_ID, [1])
    const result = resolveJoinPlayerIndex(room, 0)

    expect(result).toEqual({
      ok: true,
      playerIndex: 0,
      replacedExistingPlayer: false,
    })
  })

  it('fills the first free seat when no seat is requested', () => {
    const room = createRoom('abc123', [1], 3)
    const result = resolveJoinPlayerIndex(room)

    expect(result).toEqual({
      ok: true,
      playerIndex: 0,
      replacedExistingPlayer: false,
    })
  })

  it('routes same-user re-entry without a requested seat back to the existing seat', () => {
    const room = createRoom('abc123', [0], 2, { 0: 'user-1' })

    expect(resolveJoinRequestPlayerIndex(room, undefined, 'user-1')).toEqual({
      ok: true,
      requestedPlayerIndex: 0,
    })
  })

  it('rejects same-user re-entry when explicitly requesting another seat', () => {
    const room = createRoom('abc123', [0], 2, { 0: 'user-1' })

    expect(resolveJoinRequestPlayerIndex(room, 1, 'user-1')).toEqual({
      ok: false,
      error: 'you are already in this room',
    })
  })

  it('rejects invalid requested seat indices', () => {
    const room = createRoom(PRIMARY_DEV_ROOM_ID, [])

    expect(resolveJoinPlayerIndex(room, -1)).toEqual({
      ok: false,
      error: 'invalid player slot',
    })
    expect(resolveJoinPlayerIndex(room, 2)).toEqual({
      ok: false,
      error: 'invalid player slot',
    })
  })

  it('restores waiting rooms without serialized state', () => {
    const room = snapshotToRoom({
      id: 'waiting1',
      serialized: null,
      meta: {
        createdBy: null,
        maxPlayers: 3,
        customCardDbIds: [],
        status: 'waiting',
        players: [],
      },
      updatedAt: 0,
    })

    expect(room).toMatchObject({
      id: 'waiting1',
      maxPlayers: 3,
      players: [],
      createdBy: undefined,
      customCardDbIds: [],
    })
  })

  it('restores six-player waiting rooms without serialized state', () => {
    const room = snapshotToRoom({
      id: 'waiting6',
      serialized: null,
      meta: {
        createdBy: null,
        maxPlayers: 6,
        customCardDbIds: [],
        status: 'waiting',
        players: [],
      },
      updatedAt: 0,
    })

    expect(room.maxPlayers).toBe(6)
    expect(room.session.state.players).toHaveLength(6)
  })

  it('defaults a legacy mid-stage Farmers of the Moor draft pool to seven', () => {
    const session = new GameSession(123, undefined, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 7,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    session.state.draftMode = undefined
    session.state.draftPoolSize = undefined
    session.state.draft!.stage = 'farmersOfTheMoorMinor'
    session.state.draft!.poolSize = 4
    const serialized = serializeState(session.state, { engineStack: session.getEngineStack() })

    const room = snapshotToRoom({
      id: 'legacy-fom-draft',
      serialized,
      meta: {
        createdBy: null,
        maxPlayers: 2,
        customCardDbIds: [],
        status: 'playing',
        players: [],
      },
      updatedAt: 0,
    })

    expect(room.draftMode).toBe('simultaneous')
    expect(room.draftPoolSize).toBe(7)
  })

  it('exposes one persistent dev room per supported player count', () => {
    expect(FIXED_DEV_ROOMS.map((r) => r.id)).toEqual(['dev2', 'dev3', 'dev4', 'dev5', 'dev6'])
    expect(FIXED_DEV_ROOMS.map((r) => r.playerCount)).toEqual([2, 3, 4, 5, 6])
    for (const { id } of FIXED_DEV_ROOMS) {
      expect(FIXED_DEV_ROOM_IDS.has(id)).toBe(true)
      expect(isFixedDevRoom(id)).toBe(true)
    }
    expect(isFixedDevRoom('dev')).toBe(false)
    expect(isFixedDevRoom('abc123')).toBe(false)
  })

  it('builds parent-card fixed dev room options without draft unless requested', () => {
    const startup = parseFixedDevRoomStartupOptions({
      DEV_ENABLE_PARENT_CARDS: 'true',
      DEV_DRAFT_PARENTS: 'false',
    })

    expect(startup).toEqual({ enableParentCards: true, draftParents: false })
    expect(buildFixedDevRoomInitialStateOptions(2, startup)).toEqual({
      playerCount: 2,
      enableParentCards: true,
      draftParents: false,
    })
  })

  it('builds Through the Seasons fixed dev room options', () => {
    const startup = parseFixedDevRoomStartupOptions({
      DEV_ENABLE_THROUGH_THE_SEASONS: 'true',
    })

    expect(startup).toEqual({ enableThroughTheSeasons: true })
    expect(buildFixedDevRoomInitialStateOptions(2, startup)).toEqual({
      playerCount: 2,
      enableThroughTheSeasons: true,
    })
  })

  it('builds Farmers of the Moor incomplete-minor fixed dev room options', () => {
    const startup = parseFixedDevRoomStartupOptions({
      DEV_ENABLE_FARMERS_OF_THE_MOOR: 'true',
      DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL: 'true',
    })

    expect(startup).toEqual({
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    expect(buildFixedDevRoomInitialStateOptions(2, startup)).toEqual({
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
  })

  it('builds parent-card draft fixed dev room options when draft is requested', () => {
    const startup = parseFixedDevRoomStartupOptions({
      DEV_ENABLE_PARENT_CARDS: 'true',
      DEV_DRAFT_MODE: 'simultaneous',
      DEV_DRAFT_POOL_SIZE: '8',
    })

    expect(startup).toEqual({
      enableParentCards: true,
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })
    expect(buildFixedDevRoomInitialStateOptions(3, startup)).toEqual({
      playerCount: 3,
      enableParentCards: true,
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })
  })

  it('defaults fixed dev draft pool size to 7 when the env value is invalid', () => {
    expect(parseFixedDevRoomStartupOptions({
      DEV_DRAFT_MODE: 'simultaneous',
      DEV_DRAFT_POOL_SIZE: 'bogus',
    })).toEqual({
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
  })

  it('keeps empty non-dev rooms joinable after disconnect', () => {
    const ws = {} as never
    const room = createRoom('abc123', [0]) as {
      id: string
      maxPlayers: number
      players: Array<{ playerIndex: number; ws: never; name: string }>
    }
    room.players[0]!.ws = ws

    const result = removePlayerFromRoom(room, ws)

    expect(result).toBe('empty')
    expect(room.players).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  FIXED_DEV_ROOM_ID,
  removePlayerFromRoom,
  resolveJoinPlayerIndex,
  restoreRoomFromSqliteRow,
} from '../room-manager.ts'

const createRoom = (
  id: string,
  playerIndices: number[],
  maxPlayers = 2,
) => ({
  id,
  maxPlayers,
  players: playerIndices.map((playerIndex) => ({
    playerIndex,
    ws: {} as never,
    name: `Player ${playerIndex + 1}`,
  })),
})

describe('room-manager seat assignment', () => {
  it('binds fixed dev room reconnects to requested seat', () => {
    const room = createRoom(FIXED_DEV_ROOM_ID, [0, 1])
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
    const room = createRoom(FIXED_DEV_ROOM_ID, [1])
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

  it('rejects invalid requested seat indices', () => {
    const room = createRoom(FIXED_DEV_ROOM_ID, [])

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
    const room = restoreRoomFromSqliteRow({
      id: 'waiting1',
      created_by: null,
      state_json: null,
      max_players: 3,
      custom_card_ids: '[]',
    })

    expect(room).toMatchObject({
      id: 'waiting1',
      maxPlayers: 3,
      players: [],
      createdBy: undefined,
      customCardDbIds: [],
    })
  })

  it('restores waiting room version from sqlite rows', () => {
    const room = restoreRoomFromSqliteRow({
      id: 'waiting-version',
      created_by: null,
      state_json: null,
      max_players: 2,
      custom_card_ids: '[]',
      version: 7,
    } as Parameters<typeof restoreRoomFromSqliteRow>[0])

    expect(room?.version).toBe(7)
  })

  it('restores playing room version from sqlite rows', () => {
    const room = restoreRoomFromSqliteRow({
      id: 'playing-version',
      created_by: null,
      state_json: JSON.stringify({
        players: [],
      }),
      max_players: 2,
      custom_card_ids: '[]',
      version: 11,
    } as Parameters<typeof restoreRoomFromSqliteRow>[0])

    expect(room?.version).toBe(11)
  })

  it('keeps empty non-dev rooms joinable after disconnect', () => {
    const ws = {} as never
    const room = createRoom('abc123', [0]) as {
      id: string
      maxPlayers: number
      players: Array<{ playerIndex: number; ws: never; name: string }>
    }
    room.players[0]!.ws = ws

    const result = removePlayerFromRoom(room, ws, 1234)

    expect(result).toBe('empty')
    expect(room.players).toEqual([])
  })
})

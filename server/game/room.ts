import type { WebSocket } from 'ws'
import { GameSession } from './authoritative-session.ts'
import type { RoomMeta, RoomSnapshot, RoomStatus } from './persistence/room-persistence.ts'
import { rehydrateState } from '../../shared/game/serialization.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { RoomSummary } from '../../shared/protocol/ws.ts'

export type RoomPlayer = {
  ws: WebSocket
  playerIndex: number
  name: string
  userId?: string
}

export type Room = {
  id: string
  session: GameSession
  players: RoomPlayer[]
  maxPlayers: number
  version: number
  status: RoomStatus
  createdBy?: string
  customCardDbIds?: string[]
}

export const FIXED_DEV_ROOMS: ReadonlyArray<{ id: string; playerCount: number }> = [
  { id: 'dev2', playerCount: 2 },
  { id: 'dev3', playerCount: 3 },
  { id: 'dev4', playerCount: 4 },
]

export const FIXED_DEV_ROOM_IDS: ReadonlySet<string> = new Set(FIXED_DEV_ROOMS.map((r) => r.id))

export const isFixedDevRoom = (roomId: string): boolean => FIXED_DEV_ROOM_IDS.has(roomId)

export const WAITING_EMPTY_ROOM_TTL_MS = 30 * 60 * 1000
export const PLAYING_EMPTY_ROOM_TTL_MS = 24 * 60 * 60 * 1000

export const emptyRoomTtlMs = (room: Pick<Room, 'status'>): number =>
  room.status === 'playing' ? PLAYING_EMPTY_ROOM_TTL_MS : WAITING_EMPTY_ROOM_TTL_MS

const getRoomStatus = (room?: Pick<Room, 'players' | 'maxPlayers' | 'status'>): RoomStatus =>
  room?.status ?? ((room && room.players.length >= room.maxPlayers) ? 'playing' : 'waiting')

export const toRoomMeta = (room: Room): RoomMeta => ({
  createdBy: room.createdBy ?? null,
  maxPlayers: room.maxPlayers,
  customCardDbIds: room.customCardDbIds ?? [],
  status: getRoomStatus(room),
  players: room.players
    .filter((p): p is RoomPlayer & { userId: string } => typeof p.userId === 'string')
    .map((p) => ({ userId: p.userId, playerIndex: p.playerIndex })),
})

export type JoinSeatResolution =
  | { ok: true; playerIndex: number; replacedExistingPlayer: boolean }
  | { ok: false; error: string }

export const resolveJoinPlayerIndex = (
  room: Pick<Room, 'id' | 'maxPlayers' | 'players'>,
  requestedPlayerIndex?: number,
  userId?: string,
): JoinSeatResolution => {
  if (requestedPlayerIndex !== undefined) {
    if (
      !Number.isInteger(requestedPlayerIndex) ||
      requestedPlayerIndex < 0 ||
      requestedPlayerIndex >= room.maxPlayers
    ) {
      return { ok: false, error: 'invalid player slot' }
    }
    const occupied = room.players.find((p) => p.playerIndex === requestedPlayerIndex)
    if (occupied) {
      if (!isFixedDevRoom(room.id) && !(userId && occupied.userId === userId)) {
        return { ok: false, error: 'player slot occupied' }
      }
      return { ok: true, playerIndex: requestedPlayerIndex, replacedExistingPlayer: true }
    }
    return { ok: true, playerIndex: requestedPlayerIndex, replacedExistingPlayer: false }
  }
  const taken = new Set(room.players.map((p) => p.playerIndex))
  for (let i = 0; i < room.maxPlayers; i += 1) {
    if (!taken.has(i)) return { ok: true, playerIndex: i, replacedExistingPlayer: false }
  }
  return { ok: false, error: 'room full' }
}

export const resolveJoinRequestPlayerIndex = (
  room: Pick<Room, 'players'>,
  requestedPlayerIndex: number | undefined,
  userId: string | undefined,
): { ok: true; requestedPlayerIndex: number | undefined } | { ok: false; error: string } => {
  if (!userId) return { ok: true, requestedPlayerIndex }
  const existingSeat = room.players.find((p) => p.userId === userId)
  if (!existingSeat) return { ok: true, requestedPlayerIndex }
  if (requestedPlayerIndex === undefined) {
    return { ok: true, requestedPlayerIndex: existingSeat.playerIndex }
  }
  if (requestedPlayerIndex === existingSeat.playerIndex) {
    return { ok: true, requestedPlayerIndex }
  }
  return { ok: false, error: 'you are already in this room' }
}

export const removePlayerFromRoom = (
  room: Pick<Room, 'id' | 'players'>,
  ws: WebSocket,
): 'not-present' | 'empty' | 'remaining' => {
  const before = room.players.length
  room.players = room.players.filter((p) => p.ws !== ws)
  if (room.players.length === before) return 'not-present'
  return room.players.length === 0 ? 'empty' : 'remaining'
}

type RoomLikeForSummary = Pick<Room, 'id' | 'players' | 'maxPlayers' | 'createdBy'>

export function summarizeRoomsForLobby(
  source: Iterable<RoomLikeForSummary>,
  limit?: number,
  isFixedDev: (id: string) => boolean = isFixedDevRoom,
): RoomSummary[] {
  const list: RoomSummary[] = []
  for (const r of source) {
    if (r.players.length === 0 && !isFixedDev(r.id)) continue
    list.push({
      id: r.id,
      playerCount: r.players.length,
      maxPlayers: r.maxPlayers,
      createdBy: r.createdBy,
      status: r.players.length < r.maxPlayers ? 'waiting' : 'playing',
    })
    if (typeof limit === 'number' && list.length >= limit) break
  }
  return list
}

const createSessionFromSnapshot = (
  snapshot: RoomSnapshot,
  customCards: CustomCardData[],
): GameSession => {
  if (snapshot.serialized === null) {
    return new GameSession(undefined, customCards.length > 0 ? customCards : undefined, {
      playerCount: snapshot.meta.maxPlayers,
    })
  }
  try {
    return new GameSession(
      rehydrateState(snapshot.serialized),
      customCards.length > 0 ? customCards : undefined,
    )
  } catch (err) {
    console.warn(`[room] rehydrate failed for ${snapshot.id}, starting fresh:`, err)
    return new GameSession(undefined, customCards.length > 0 ? customCards : undefined, {
      playerCount: snapshot.meta.maxPlayers,
    })
  }
}

export const snapshotToRoom = (
  snapshot: RoomSnapshot,
  customCards: CustomCardData[] = [],
): Room => ({
  id: snapshot.id,
  session: createSessionFromSnapshot(snapshot, customCards),
  players: [],
  maxPlayers: snapshot.meta.maxPlayers,
  version: 0,
  status: snapshot.meta.status,
  createdBy: snapshot.meta.createdBy ?? undefined,
  customCardDbIds: snapshot.meta.customCardDbIds,
})


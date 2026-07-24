import type { WebSocket } from 'ws'
import { GameSession } from './authoritative-session.ts'
import type { RoomMeta, RoomSnapshot, RoomStatus } from './persistence/room-persistence.ts'
import { rehydrateState } from '../../shared/session/serialization.ts'
import type { InitialStateOptions } from '../../shared/session/state-bootstrap.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { RoomSummary } from '../../shared/contract/protocol/ws.ts'

export type RoomPlayer = {
  ws: WebSocket
  playerIndex: number
  name: string
  userId?: string
}

export type RoomSeatOwner = {
  playerIndex: number
  userId: string
}

export type Room = {
  id: string
  session: GameSession
  players: RoomPlayer[]
  seatOwners?: RoomSeatOwner[]
  maxPlayers: number
  version: number
  status: RoomStatus
  startedAt?: number
  createdBy?: string
  customCardDbIds?: string[]
  enableParentCards?: boolean
  draftParents?: boolean
  draftMode?: 'simultaneous'
  draftPoolSize?: number
  enableThroughTheSeasons?: boolean
  enableFarmersOfTheMoor?: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
}

export const FIXED_DEV_ROOMS: ReadonlyArray<{ id: string; playerCount: number }> = [
  { id: 'dev2', playerCount: 2 },
  { id: 'dev3', playerCount: 3 },
  { id: 'dev4', playerCount: 4 },
  { id: 'dev5', playerCount: 5 },
  { id: 'dev6', playerCount: 6 },
]

export const FIXED_DEV_ROOM_IDS: ReadonlySet<string> = new Set(FIXED_DEV_ROOMS.map((r) => r.id))

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const fixedDevRoomRootId = (roomId: string): string | null => {
  for (const { id } of FIXED_DEV_ROOMS) {
    if (roomId === id) return id
    if (roomId.startsWith(`${id}-`) && UUID_PATTERN.test(roomId.slice(id.length + 1))) return id
  }
  return null
}

export const isFixedDevRoom = (roomId: string): boolean => FIXED_DEV_ROOM_IDS.has(roomId)

export const isDevRoom = (roomId: string): boolean => fixedDevRoomRootId(roomId) !== null

export type FixedDevRoomStartupOptions = {
  enableParentCards?: boolean
  enableThroughTheSeasons?: boolean
  enableFarmersOfTheMoor?: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
  draftParents?: boolean
  draftMode?: 'simultaneous'
  draftPoolSize?: number
}

export const parseFixedDevRoomStartupOptions = (
  env: Record<string, string | undefined> = process.env,
): FixedDevRoomStartupOptions => {
  const options: FixedDevRoomStartupOptions = {}
  if (env.DEV_ENABLE_PARENT_CARDS === 'true' || env.DEV_ENABLE_PARENT_CARDS === '1') {
    options.enableParentCards = true
  }
  if (env.DEV_ENABLE_THROUGH_THE_SEASONS === 'true' || env.DEV_ENABLE_THROUGH_THE_SEASONS === '1') {
    options.enableThroughTheSeasons = true
  }
  if (env.DEV_ENABLE_FARMERS_OF_THE_MOOR === 'true' || env.DEV_ENABLE_FARMERS_OF_THE_MOOR === '1') {
    options.enableFarmersOfTheMoor = true
  }
  if (
    env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL === 'true' ||
    env.DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL === '1'
  ) {
    options.allowIncompleteFarmersOfTheMoorMinorDeal = true
  }
  if (env.DEV_DRAFT_PARENTS === 'false' || env.DEV_DRAFT_PARENTS === '0') {
    options.draftParents = false
  }
  if (env.DEV_DRAFT_MODE === 'simultaneous') {
    const rawPoolSize = Number(env.DEV_DRAFT_POOL_SIZE)
    options.draftMode = 'simultaneous'
    options.draftPoolSize = Number.isInteger(rawPoolSize) && rawPoolSize >= 7 && rawPoolSize <= 10
      ? rawPoolSize
      : 7
  }
  return options
}

export const buildFixedDevRoomInitialStateOptions = (
  playerCount: number,
  startupOptions: FixedDevRoomStartupOptions = {},
): InitialStateOptions => ({
  playerCount,
  ...(startupOptions.enableParentCards ? { enableParentCards: true } : {}),
  ...(startupOptions.enableThroughTheSeasons ? { enableThroughTheSeasons: true } : {}),
  ...(startupOptions.enableFarmersOfTheMoor ? { enableFarmersOfTheMoor: true } : {}),
  ...(startupOptions.allowIncompleteFarmersOfTheMoorMinorDeal ? { allowIncompleteFarmersOfTheMoorMinorDeal: true } : {}),
  ...(startupOptions.draftParents === false ? { draftParents: false } : {}),
  ...(startupOptions.draftMode === 'simultaneous'
    ? {
        draftMode: 'simultaneous' as const,
        draftPoolSize: startupOptions.draftPoolSize ?? 7,
      }
    : {}),
})

export const WAITING_EMPTY_ROOM_TTL_MS = 30 * 60 * 1000
export const PLAYING_EMPTY_ROOM_TTL_MS = 24 * 60 * 60 * 1000

export const emptyRoomTtlMs = (room: Pick<Room, 'status'>): number =>
  room.status === 'playing' ? PLAYING_EMPTY_ROOM_TTL_MS : WAITING_EMPTY_ROOM_TTL_MS

const getRoomStatus = (room?: Pick<Room, 'players' | 'maxPlayers' | 'status'>): RoomStatus =>
  room?.status ?? ((room && room.players.length >= room.maxPlayers) ? 'playing' : 'waiting')

const roomSeatOwners = (
  room: Pick<Room, 'players' | 'seatOwners'>,
): RoomSeatOwner[] => {
  const owners = new Map(
    (room.seatOwners ?? []).map((owner) => [owner.playerIndex, owner.userId]),
  )
  for (const player of room.players) {
    if (player.userId) owners.set(player.playerIndex, player.userId)
  }
  return [...owners]
    .sort(([left], [right]) => left - right)
    .map(([playerIndex, userId]) => ({ playerIndex, userId }))
}

export const roomOccupiedSeatCount = (
  room: Pick<Room, 'id' | 'players' | 'seatOwners'>,
): number => isDevRoom(room.id)
  ? room.players.length
  : new Set([
      ...room.players.map((player) => player.playerIndex),
      ...roomSeatOwners(room).map((owner) => owner.playerIndex),
    ]).size

export const toRoomMeta = (room: Room): RoomMeta => ({
  createdBy: room.createdBy ?? null,
  startedAt: room.startedAt ?? null,
  maxPlayers: room.maxPlayers,
  customCardDbIds: room.customCardDbIds ?? [],
  enableParentCards: room.enableParentCards ?? room.session.state.enableParentCards,
  draftParents: room.draftParents,
  enableThroughTheSeasons: room.enableThroughTheSeasons ?? room.session.state.enableThroughTheSeasons,
  enableFarmersOfTheMoor: room.enableFarmersOfTheMoor ?? (room.session.state.enableFarmersOfTheMoor === true),
  allowIncompleteFarmersOfTheMoorMinorDeal: room.allowIncompleteFarmersOfTheMoorMinorDeal ?? false,
  status: getRoomStatus(room),
  players: roomSeatOwners(room),
})

export type JoinSeatResolution =
  | { ok: true; playerIndex: number; replacedExistingPlayer: boolean }
  | { ok: false; error: string }

export const resolveJoinPlayerIndex = (
  room: Pick<Room, 'id' | 'maxPlayers' | 'players' | 'seatOwners'>,
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
      if (!isDevRoom(room.id) && !(userId && occupied.userId === userId)) {
        return { ok: false, error: 'player slot occupied' }
      }
      return { ok: true, playerIndex: requestedPlayerIndex, replacedExistingPlayer: true }
    }
    const owner = roomSeatOwners(room).find((candidate) =>
      candidate.playerIndex === requestedPlayerIndex
    )
    if (!isDevRoom(room.id) && owner && owner.userId !== userId) {
      return { ok: false, error: 'player slot occupied' }
    }
    return { ok: true, playerIndex: requestedPlayerIndex, replacedExistingPlayer: false }
  }
  const taken = new Set(room.players.map((p) => p.playerIndex))
  if (!isDevRoom(room.id)) {
    for (const owner of roomSeatOwners(room)) taken.add(owner.playerIndex)
  }
  for (let i = 0; i < room.maxPlayers; i += 1) {
    if (!taken.has(i)) return { ok: true, playerIndex: i, replacedExistingPlayer: false }
  }
  return { ok: false, error: 'room full' }
}

export const resolveJoinRequestPlayerIndex = (
  room: Pick<Room, 'players' | 'seatOwners'>,
  requestedPlayerIndex: number | undefined,
  userId: string | undefined,
): { ok: true; requestedPlayerIndex: number | undefined } | { ok: false; error: string } => {
  if (!userId) return { ok: true, requestedPlayerIndex }
  const existingSeat = roomSeatOwners(room).find((owner) => owner.userId === userId)
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

type RoomLikeForSummary = Pick<
  Room,
  'id' | 'players' | 'seatOwners' | 'maxPlayers' | 'createdBy'
>

export function summarizeRoomsForLobby(
  source: Iterable<RoomLikeForSummary>,
  limit?: number,
  isFixedDev: (id: string) => boolean = isFixedDevRoom,
): RoomSummary[] {
  const list: RoomSummary[] = []
  for (const r of source) {
    if (r.players.length === 0 && !isFixedDev(r.id)) continue
    const playerCount = roomOccupiedSeatCount(r)
    list.push({
      id: r.id,
      playerCount,
      maxPlayers: r.maxPlayers,
      createdBy: r.createdBy,
      status: playerCount < r.maxPlayers ? 'waiting' : 'playing',
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
      enableParentCards: snapshot.meta.enableParentCards ?? false,
      ...(snapshot.meta.draftParents === false ? { draftParents: false } : {}),
      enableThroughTheSeasons: snapshot.meta.enableThroughTheSeasons ?? false,
      enableFarmersOfTheMoor: snapshot.meta.enableFarmersOfTheMoor ?? false,
      allowIncompleteFarmersOfTheMoorMinorDeal: snapshot.meta.allowIncompleteFarmersOfTheMoorMinorDeal ?? false,
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
      enableParentCards: snapshot.meta.enableParentCards ?? false,
      ...(snapshot.meta.draftParents === false ? { draftParents: false } : {}),
      enableThroughTheSeasons: snapshot.meta.enableThroughTheSeasons ?? false,
      enableFarmersOfTheMoor: snapshot.meta.enableFarmersOfTheMoor ?? false,
      allowIncompleteFarmersOfTheMoorMinorDeal: snapshot.meta.allowIncompleteFarmersOfTheMoorMinorDeal ?? false,
    })
  }
}

export const snapshotToRoom = (
  snapshot: RoomSnapshot,
  customCards: CustomCardData[] = [],
): Room => {
  const session = createSessionFromSnapshot(snapshot, customCards)
  return {
    id: snapshot.id,
    session,
    players: [],
    seatOwners: snapshot.meta.players.map((owner) => ({ ...owner })),
    maxPlayers: snapshot.meta.maxPlayers,
    version: 0,
    status: snapshot.meta.status,
    startedAt: snapshot.meta.startedAt ?? undefined,
    createdBy: snapshot.meta.createdBy ?? undefined,
    customCardDbIds: snapshot.meta.customCardDbIds,
    enableParentCards: snapshot.meta.enableParentCards ?? snapshot.serialized?.enableParentCards ?? false,
    draftParents: snapshot.meta.draftParents,
    draftMode: session.state.draftMode,
    draftPoolSize: session.state.draftPoolSize,
    enableThroughTheSeasons: snapshot.meta.enableThroughTheSeasons ?? snapshot.serialized?.enableThroughTheSeasons ?? false,
    enableFarmersOfTheMoor: snapshot.meta.enableFarmersOfTheMoor ?? (snapshot.serialized?.enableFarmersOfTheMoor === true),
    allowIncompleteFarmersOfTheMoorMinorDeal: snapshot.meta.allowIncompleteFarmersOfTheMoorMinorDeal ?? false,
  }
}

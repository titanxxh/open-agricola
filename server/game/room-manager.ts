import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { GameSession, type SessionResponse } from './authoritative-session.ts'
import {
  rehydrateState,
  serializeState,
  serializeStateForPlayer,
  type SerializedGameState,
} from '../../shared/game/serialization.ts'
import type { GameSyncPayload, StateUpdateCause, StateUpdateEnvelope } from '../../shared/protocol/game.ts'
import type { ClientCommand, ServerEvent, RoomSummary } from '../../shared/protocol/ws.ts'
import { validateSession } from '../auth.ts'
import { getDb } from '../db.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { CustomCodeManifest } from '../../shared/custom-code/types.ts'
import type { RoomPersistence, RoomMeta } from './persistence/room-persistence.ts'

/** Default pool size for simultaneous draft when the client doesn't specify one. */
const DRAFT_POOL_SIZE_DEFAULT = 7
const DRAFT_POOL_SIZE_MIN = 7
const DRAFT_POOL_SIZE_MAX = 10

type DraftRoomOptions = { draftMode: 'simultaneous'; draftPoolSize: number }

/**
 * Validate and normalize the draft-related fields of a `createRoom` payload.
 *
 * Returns `{ ok: true, value: null }` when no draft is requested (classic mode);
 * `{ ok: true, value: DraftRoomOptions }` when a valid simultaneous draft is requested;
 * `{ ok: false, error }` on malformed input (invalid mode or out-of-range pool size).
 */
export function parseDraftOptions(
  payload: Record<string, unknown>,
): { ok: true; value: DraftRoomOptions | null } | { ok: false; error: string } {
  const rawMode = payload.draftMode
  if (rawMode === undefined || rawMode === null || rawMode === 'none') {
    return { ok: true, value: null }
  }
  if (rawMode !== 'simultaneous') {
    return { ok: false, error: `invalid draftMode: ${String(rawMode)}` }
  }
  let poolSize = DRAFT_POOL_SIZE_DEFAULT
  const rawPool = payload.draftPoolSize
  if (rawPool !== undefined && rawPool !== null) {
    if (
      typeof rawPool !== 'number' ||
      !Number.isFinite(rawPool) ||
      !Number.isInteger(rawPool) ||
      rawPool < DRAFT_POOL_SIZE_MIN ||
      rawPool > DRAFT_POOL_SIZE_MAX
    ) {
      return {
        ok: false,
        error: `invalid draftPoolSize: must be an integer in [${DRAFT_POOL_SIZE_MIN}, ${DRAFT_POOL_SIZE_MAX}]`,
      }
    }
    poolSize = rawPool
  }
  return { ok: true, value: { draftMode: 'simultaneous', draftPoolSize: poolSize } }
}

/** Load custom card data from DB by workshop_cards.id list. Allows published + author's drafts. */
function loadCustomCardsFromDb(cardDbIds: string[], requestUserId?: string): CustomCardData[] {
  if (!cardDbIds.length) return []
  const db = getDb()
  const result: CustomCardData[] = []
  for (const dbId of cardDbIds) {
    const row = db.prepare(
      'SELECT card_type, card_json, effect_code, compiled_code, code_manifest, art_url, status, author_id FROM workshop_cards WHERE id = ?',
    ).get(dbId) as {
      card_type: string
      card_json: string
      effect_code: string | null
      compiled_code: string | null
      code_manifest: string | null
      art_url: string | null
      status: string; author_id: string
    } | undefined
    if (!row) continue
    const allowed = row.status === 'published' || (row.status === 'draft' && requestUserId === row.author_id)
    if (!allowed) continue
    try {
      result.push({
        cardType: row.card_type as 'minor' | 'occupation',
        cardJson: JSON.parse(row.card_json),
        effectCode: row.effect_code ?? null,
        compiledCode: row.compiled_code ?? null,
        codeManifest: row.code_manifest ? JSON.parse(row.code_manifest) as CustomCodeManifest : null,
        artUrl: row.art_url ?? null,
      })
    } catch { /* skip malformed */ }
  }
  return result
}

/**
 * Fixed dev rooms: one per supported player count. Each survives backend restarts
 * and is persisted independently in SQLite (or output/<id>.json in json mode).
 *
 * Connect with `?room=devN&player=pK&transport=ws` (N = 2/3/4, K = 1..N).
 */
export const FIXED_DEV_ROOMS: ReadonlyArray<{ id: string; playerCount: number }> = [
  { id: 'dev2', playerCount: 2 },
  { id: 'dev3', playerCount: 3 },
  { id: 'dev4', playerCount: 4 },
]

export const FIXED_DEV_ROOM_IDS: ReadonlySet<string> = new Set(
  FIXED_DEV_ROOMS.map((r) => r.id),
)

export const isFixedDevRoom = (roomId: string): boolean =>
  FIXED_DEV_ROOM_IDS.has(roomId)

// ── Persistence adapter ──────────────────────────────────────────────────────

let _persistence: RoomPersistence | null = null
export function setPersistence(p: RoomPersistence): void { _persistence = p }
function getPersistence(): RoomPersistence {
  if (!_persistence) throw new Error('RoomPersistence not initialized; call setPersistence() at startup')
  return _persistence
}

/**
 * Persistence backend for rooms:
 *   - 'json' (default): JSON files in output/ — no auth required, existing behaviour
 *   - 'sqlite': SQLite rooms table — recommended for production
 *
 * Set via env: PERSIST_ROOMS=sqlite
 */
/**
 * Default to 'sqlite' so the "my-rooms" feature works out of the box.
 * Set PERSIST_ROOMS=json to keep the legacy JSON-file behaviour (e.g. quick local dev).
 */
const PERSIST_ROOMS = (process.env.PERSIST_ROOMS ?? 'sqlite') as 'json' | 'sqlite'

/**
 * When true, WebSocket connections are NOT required to send an auth token.
 * Default true in development (NODE_ENV != production), false otherwise.
 * Override with env: ALLOW_ANONYMOUS_WS=true|false
 */
const ALLOW_ANONYMOUS_WS: boolean = (() => {
  if (process.env.ALLOW_ANONYMOUS_WS !== undefined) {
    return process.env.ALLOW_ANONYMOUS_WS === 'true'
  }
  return process.env.NODE_ENV !== 'production'
})()

/** Seconds to wait for auth message before closing unauthenticated connection. */
const WS_AUTH_TIMEOUT_MS = 5000

type RoomPlayer = {
  ws: WebSocket
  playerIndex: number
  name: string
  userId?: string
}

type RoomStatus = 'waiting' | 'playing'

type Room = {
  id: string
  session: GameSession
  players: RoomPlayer[]
  maxPlayers: number
  version: number
  status: RoomStatus
  createdBy?: string
  customCardDbIds?: string[]
}

const rooms = new Map<string, Room>()

function toRoomMetaLocal(room: Room): RoomMeta {
  return {
    createdBy: room.createdBy ?? null,
    maxPlayers: room.maxPlayers,
    customCardDbIds: room.customCardDbIds ?? [],
    status: room.status,
    players: room.players
      .filter((p): p is RoomPlayer & { userId: string } => typeof p.userId === 'string')
      .map((p) => ({ userId: p.userId, playerIndex: p.playerIndex })),
  }
}

type JoinSeatResolution =
  | { ok: true; playerIndex: number; replacedExistingPlayer: boolean }
  | { ok: false; error: string }

type PersistedRoomRow = {
  id: string
  created_by: string | null
  state_json: string | null
  max_players: number
  custom_card_ids: string | null
  status?: RoomStatus
  version: number
  /** Optional: present when rows are loaded for restore-with-TTL bookkeeping. */
  updated_at?: number
}

const parseCustomCardDbIds = (raw: string | null | undefined): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

const createSessionForRoom = (
  stateOrSeed?: SerializedGameState | number,
  customCardDbIds: string[] = [],
  requestUserId?: string,
  playerCount?: number,
): GameSession => {
  const customCards = loadCustomCardsFromDb(customCardDbIds, requestUserId)
  // playerCount only applies when GameSession seeds a fresh state (i.e. when
  // no serialized state is supplied). When `stateOrSeed` is a serialized
  // state, the player count is already encoded in `state.players`.
  const initialOptions =
    playerCount && (stateOrSeed === undefined || typeof stateOrSeed === 'number')
      ? { playerCount }
      : undefined
  return new GameSession(
    typeof stateOrSeed === 'number'
      ? stateOrSeed
      : stateOrSeed
        ? rehydrateState(stateOrSeed)
        : undefined,
    customCards.length > 0 ? customCards : undefined,
    initialOptions,
  )
}

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
    const occupied = room.players.find(
      (player) => player.playerIndex === requestedPlayerIndex,
    )
    if (occupied) {
      // Allow reconnection if same userId, or in dev room
      if (!isFixedDevRoom(room.id) && !(userId && occupied.userId === userId)) {
        return { ok: false, error: 'player slot occupied' }
      }
      return {
        ok: true,
        playerIndex: requestedPlayerIndex,
        replacedExistingPlayer: true,
      }
    }
    return {
      ok: true,
      playerIndex: requestedPlayerIndex,
      replacedExistingPlayer: false,
    }
  }

  const takenIndices = new Set(room.players.map((player) => player.playerIndex))
  for (let index = 0; index < room.maxPlayers; index += 1) {
    if (!takenIndices.has(index)) {
      return { ok: true, playerIndex: index, replacedExistingPlayer: false }
    }
  }
  return { ok: false, error: 'room full' }
}

export const resolveJoinRequestPlayerIndex = (
  room: Pick<Room, 'players'>,
  requestedPlayerIndex: number | undefined,
  userId: string | undefined,
): { ok: true; requestedPlayerIndex: number | undefined } | { ok: false; error: string } => {
  if (!userId) return { ok: true, requestedPlayerIndex }
  const existingSeat = room.players.find(p => p.userId === userId)
  if (!existingSeat) return { ok: true, requestedPlayerIndex }
  if (requestedPlayerIndex === undefined) {
    return { ok: true, requestedPlayerIndex: existingSeat.playerIndex }
  }
  if (requestedPlayerIndex === existingSeat.playerIndex) {
    return { ok: true, requestedPlayerIndex }
  }
  return { ok: false, error: 'you are already in this room' }
}

// ── Persistence helpers ──────────────────────────────────────────────────────

function savePersistedState(roomId: string, serialized: SerializedGameState, room?: Room): void {
  const meta = room ? toRoomMetaLocal(room) : { createdBy: null, maxPlayers: 2, customCardDbIds: [], status: 'playing' as const, players: [] }
  getPersistence().save(roomId, serialized, meta)
}

/** Write a placeholder row when a room is first created (before any state). */
function ensureRoomRowSqlite(room: Room): void {
  if (PERSIST_ROOMS !== 'sqlite') return
  getPersistence().save(room.id, null, toRoomMetaLocal(room))
}

/** In the new adapter model, player info is written via meta.players on the next save(). */
function upsertRoomPlayer(roomId: string, userId: string, playerIndex: number): void {
  if (PERSIST_ROOMS !== 'sqlite' || !userId) return
  const room = rooms.get(roomId)
  if (!room) return
  getPersistence().save(roomId, null, toRoomMetaLocal(room))
  void playerIndex
}

// ── Room lifecycle ───────────────────────────────────────────────────────────

function loadRoomFromState(
  roomId: string,
  serialized: SerializedGameState,
  maxPlayers = 2,
  createdBy?: string,
  customCardDbIds: string[] = [],
  version = 0,
  status: RoomStatus = 'playing',
): Room {
  let session = createSessionForRoom(undefined, customCardDbIds, createdBy, maxPlayers)
  try {
    session = createSessionForRoom(serialized, customCardDbIds, createdBy, maxPlayers)
  } catch (err) {
    console.warn(`[room-manager] failed to rehydrate room ${roomId}, starting fresh:`, err)
  }
  return { id: roomId, session, players: [], maxPlayers, version, status, createdBy, customCardDbIds }
}

export function restoreRoomFromSqliteRow(row: PersistedRoomRow): Room | null {
  const customCardDbIds = parseCustomCardDbIds(row.custom_card_ids)
  if (!row.state_json) {
    return {
      id: row.id,
      session: createSessionForRoom(
        undefined,
        customCardDbIds,
        row.created_by ?? undefined,
        row.max_players,
      ),
      players: [],
      maxPlayers: row.max_players,
      version: row.version,
      status: row.status ?? 'waiting',
      createdBy: row.created_by ?? undefined,
      customCardDbIds,
    }
  }
  try {
    const serialized = JSON.parse(row.state_json) as SerializedGameState
    return loadRoomFromState(
      row.id,
      serialized,
      row.max_players,
      row.created_by ?? undefined,
      customCardDbIds,
      row.version,
      row.status ?? 'playing',
    )
  } catch (err) {
    console.warn(`[room-manager] failed to restore room ${row.id}:`, err)
    return null
  }
}

export const removePlayerFromRoom = (
  room: Pick<Room, 'id' | 'players'>,
  ws: WebSocket,
  now = Date.now(),
): 'not-present' | 'empty' | 'remaining' => {
  const beforeCount = room.players.length
  room.players = room.players.filter((player) => player.ws !== ws)
  if (room.players.length === beforeCount) return 'not-present'
  if (room.players.length === 0) {
    if (!isFixedDevRoom(room.id)) {
      roomLastActivity.set(room.id, now)
    }
    return 'empty'
  }
  return 'remaining'
}

function ensurePersistentRooms(): void {
  for (const { id, playerCount } of FIXED_DEV_ROOMS) {
    if (rooms.has(id)) continue
    const snap = getPersistence().load(id)
    let session: GameSession
    if (snap?.serialized) {
      try {
        session = new GameSession(rehydrateState(snap.serialized))
      } catch (err) {
        console.warn(`[room-manager] load persisted state for ${id} failed, starting fresh:`, err)
        session = new GameSession(undefined, undefined, { playerCount })
      }
    } else {
      session = new GameSession(undefined, undefined, { playerCount })
    }
    rooms.set(id, {
      id,
      session,
      players: [],
      maxPlayers: playerCount,
      version: 0,
      status: 'playing',
    })
  }
}

/**
 * Batch-mark long-stale rooms as `'finished'` so the in-process cleanup TTL
 * effectively crosses server restarts. Returns the number of rows touched.
 *
 * Exported for tests and the cleanup script.
 */
export function pruneStaleRoomRows(
  db: Pick<import('better-sqlite3').Database, 'prepare'>,
  now: number,
  waitingTtlMs: number,
  fixedIds: ReadonlyArray<string> = FIXED_DEV_ROOMS.map((r) => r.id),
  playingTtlMs = waitingTtlMs,
): number {
  const placeholders = fixedIds.map(() => '?').join(', ') || "''"
  const staleWaitingCutoff = now - waitingTtlMs
  const stalePlayingCutoff = now - playingTtlMs
  try {
    const res = db.prepare(
      `UPDATE rooms
       SET status = 'finished', updated_at = ?
       WHERE status != 'finished'
         AND (
           (status = 'playing' AND updated_at < ?)
           OR (status != 'playing' AND updated_at < ?)
         )
         AND id NOT IN (${placeholders})`,
    ).run(now, stalePlayingCutoff, staleWaitingCutoff, ...fixedIds) as { changes: number }
    return res.changes
  } catch (err) {
    console.warn('[room-manager] stale-room prune failed:', err)
    return 0
  }
}

/**
 * Restore non-stale rooms into memory via the persistence adapter.
 * The adapter handles TTL pruning internally (listRestorable).
 * Fixed dev rooms are excluded — `ensurePersistentRooms` already loaded them.
 */
function restoreRoomsFromSqlite(now = Date.now()): void {
  if (PERSIST_ROOMS !== 'sqlite') return
  const fixedIds = FIXED_DEV_ROOMS.map((r) => r.id)
  const snapshots = getPersistence().listRestorable({
    now,
    waitingTtlMs: WAITING_EMPTY_ROOM_TTL_MS,
    playingTtlMs: PLAYING_EMPTY_ROOM_TTL_MS,
    excludeIds: fixedIds,
  })
  for (const snap of snapshots) {
    if (rooms.has(snap.id)) continue
    const room = restoreRoomFromSqliteRow({
      id: snap.id,
      created_by: snap.meta.createdBy,
      state_json: snap.serialized ? JSON.stringify(snap.serialized) : null,
      max_players: snap.meta.maxPlayers,
      custom_card_ids: JSON.stringify(snap.meta.customCardDbIds),
      status: snap.meta.status as RoomStatus,
      version: 0,
      updated_at: snap.updatedAt,
    })
    if (!room) continue
    rooms.set(snap.id, room)
    if (snap.updatedAt > 0) roomLastActivity.set(snap.id, snap.updatedAt)
    console.log(`[room-manager] restored room ${snap.id} via persistence adapter`)
  }
}

const generateRoomId = () => Math.random().toString(36).slice(2, 8)

const broadcast = (room: Room, message: ServerEvent) => {
  const data = JSON.stringify(message)
  room.players.forEach((p) => {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data)
  })
}

const sendTo = (ws: WebSocket, message: ServerEvent) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

const toSyncPayload = (resp: SessionResponse, session: GameSession): GameSyncPayload => {
  const payload: GameSyncPayload = {
    state: serializeState(resp.state, { engineStack: session.getEngineStack() }),
    interaction: resp.interaction,
    scores: resp.scores ?? null,
    pastureCapacities: resp.pastureCapacities,
    historyLength: resp.historyLength,
    hasActionStartSnapshot: resp.hasActionStartSnapshot,
    ok: resp.ok,
    actionAvailability: resp.actionAvailability,
    cardAvailability: resp.cardAvailability,
    error: resp.error,
  }
  if (session) {
    const defs = session.getCustomCardDefs()
    if (defs.length > 0) payload.customCardDefs = defs
  }
  return payload
}

/**
 * Build a {@link GameSyncPayload} tailored to one viewer. The state portion is
 * masked via {@link serializeStateForPlayer}; everything else (pending,
 * scores, availability, custom defs …) is shared verbatim.
 *
 * Pass `viewerPlayerId = null` for spectator-style masking (all hands/pools
 * redacted).
 */
const toSyncPayloadForViewer = (
  resp: SessionResponse,
  session: GameSession,
  viewerPlayerId: string | null,
): GameSyncPayload => {
  const base = toSyncPayload(resp, session)
  return {
    ...base,
    state: serializeStateForPlayer(resp.state, viewerPlayerId, {
      engineStack: session.getEngineStack(),
    }),
  }
}

const viewerIdForSeat = (
  resp: SessionResponse,
  seated: RoomPlayer | undefined,
): string | null => {
  if (!seated) return null
  return resp.state.players[seated.playerIndex]?.id ?? null
}

const broadcastState = (
  room: Room,
  resp: SessionResponse,
  cause: StateUpdateCause,
  requestId?: string,
) => {
  room.version += 1
  const emittedAt = Date.now()
  for (const seated of room.players) {
    if (seated.ws.readyState !== seated.ws.OPEN) continue
    const viewerId = viewerIdForSeat(resp, seated)
    const envelope: StateUpdateEnvelope = {
      type: 'stateUpdate',
      roomId: room.id,
      version: room.version,
      sync: 'snapshot',
      cause,
      requestId,
      payload: toSyncPayloadForViewer(resp, room.session, viewerId),
      emittedAt,
    }
    sendTo(seated.ws, envelope)
  }
  // Persist unfiltered authoritative state on every change for sqlite, only dev room for json
  if (PERSIST_ROOMS === 'sqlite' || isFixedDevRoom(room.id)) {
    savePersistedState(
      room.id,
      serializeState(resp.state, { engineStack: room.session.getEngineStack() }),
      room,
    )
  }
  // Mark room as finished in SQLite when game ends
  if (PERSIST_ROOMS === 'sqlite' && resp.state.gameOver) {
    getPersistence().markFinished(room.id, Date.now())
  }
}

const sendStateTo = (
  ws: WebSocket,
  room: Room,
  resp: SessionResponse,
  requestId?: string,
) => {
  const seated = room.players.find((p) => p.ws === ws)
  const viewerId = viewerIdForSeat(resp, seated)
  const envelope: StateUpdateEnvelope = {
    type: 'stateUpdate',
    roomId: room.id,
    version: room.version,
    sync: 'snapshot',
    cause: 'reconnect',
    requestId,
    payload: toSyncPayloadForViewer(resp, room.session, viewerId),
    emittedAt: Date.now(),
  }
  sendTo(ws, envelope)
}

// ── WebSocket server ─────────────────────────────────────────────────────────

/** TTL for empty waiting rooms (no connected players) before cleanup. */
const WAITING_EMPTY_ROOM_TTL_MS = 30 * 60 * 1000  // 30 minutes
/** TTL for empty games that have already started before cleanup. */
const PLAYING_EMPTY_ROOM_TTL_MS = 24 * 60 * 60 * 1000  // 1 day
const roomLastActivity = new Map<string, number>()

const emptyRoomTtlMs = (room: Pick<Room, 'status'>): number =>
  room.status === 'playing' ? PLAYING_EMPTY_ROOM_TTL_MS : WAITING_EMPTY_ROOM_TTL_MS

const isDevCommandAllowed = (room: Pick<Room, 'id'>): boolean =>
  isFixedDevRoom(room.id)

function startRoomCleanup(): void {
  setInterval(() => {
    const now = Date.now()
    for (const [roomId, room] of rooms) {
      if (isFixedDevRoom(roomId)) continue
      if (room.players.length > 0) {
        roomLastActivity.set(roomId, now)
        continue
      }
      const lastSeen = roomLastActivity.get(roomId) ?? now
      if (now - lastSeen > emptyRoomTtlMs(room)) {
        rooms.delete(roomId)
        roomLastActivity.delete(roomId)
        if (PERSIST_ROOMS === 'sqlite') {
          getPersistence().markFinished(roomId, now)
        }
        console.log(`[room-manager] cleaned up empty room ${roomId}`)
      }
    }
  }, 5 * 60 * 1000) // check every 5 minutes
}

export const createWsServer = (server: import('node:http').Server) => {
  if (process.env.NODE_ENV !== 'production') {
    ensurePersistentRooms()
  }
  restoreRoomsFromSqlite()
  startRoomCleanup()
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    let currentRoom: Room | null = null
    let currentPlayerIndex = -1
    let currentUserId: string | undefined
    let authenticated = ALLOW_ANONYMOUS_WS // anonymous allowed in dev

    // In production: close connection if auth not received within timeout
    let authTimer: ReturnType<typeof setTimeout> | undefined
    if (!ALLOW_ANONYMOUS_WS) {
      authTimer = setTimeout(() => {
        if (!authenticated) {
          sendTo(ws, { type: 'error', error: 'authentication timeout' })
          ws.close()
        }
      }, WS_AUTH_TIMEOUT_MS)
    }

    ws.on('message', async (raw: Buffer) => {
      let msg: ClientCommand
      try { msg = JSON.parse(raw.toString()) as ClientCommand } catch { return }
      const sendCommandError = (error: string) => {
        sendTo(ws, { type: 'error', error, requestId: msg.requestId })
      }

      // ── Auth handshake ───────────────────────────────────────────────────
      if (msg.type === 'auth') {
        const user = validateSession(msg.token)
        if (!user) {
          sendCommandError('invalid or expired token')
          if (!ALLOW_ANONYMOUS_WS) ws.close()
          return
        }
        authenticated = true
        currentUserId = user.id
        clearTimeout(authTimer)
        sendTo(ws, { type: 'authOk', userId: user.id, username: user.username })
        return
      }

      // Gate all non-auth commands behind authentication
      if (!authenticated) {
        sendCommandError('not authenticated')
        return
      }

      // ── Room commands ────────────────────────────────────────────────────
      if (msg.type === 'createRoom') {
        const roomId = generateRoomId()
        const rawMaxPlayers = typeof (msg as Record<string, unknown>).maxPlayers === 'number'
          ? (msg as Record<string, unknown>).maxPlayers as number
          : 2
        const maxPlayers = Math.min(Math.max(2, rawMaxPlayers), 4)
        // Load custom cards if provided
        const customCardDbIds = Array.isArray((msg as Record<string, unknown>).customCardIds)
          ? (msg as Record<string, unknown>).customCardIds as string[]
          : []
        // Simultaneous card-draft opt-in.
        const draftOptions = parseDraftOptions(msg as Record<string, unknown>)
        if (!draftOptions.ok) { sendCommandError(draftOptions.error); return }
        const enableCommunityDeck = (msg as Record<string, unknown>).enableCommunityDeck === true
        const customCards = loadCustomCardsFromDb(customCardDbIds, currentUserId)
        const session = new GameSession(
          undefined,
          customCards.length > 0 ? customCards : undefined,
          {
            playerCount: maxPlayers,
            enableCommunityDeck,
            ...(draftOptions.value
              ? {
                  draftMode: draftOptions.value.draftMode,
                  draftPoolSize: draftOptions.value.draftPoolSize,
                }
              : {}),
          },
        )
        const room: Room = {
          id: roomId,
          session,
          players: [],
          maxPlayers,
          version: 0,
          status: 'waiting',
          createdBy: currentUserId,
          customCardDbIds,
        }
        rooms.set(roomId, room)
        currentRoom = room
        currentPlayerIndex = 0
        const name = typeof (msg as Record<string, unknown>).name === 'string'
          ? (msg as Record<string, unknown>).name as string
          : 'Player 1'
        room.players.push({ ws, playerIndex: 0, name, userId: currentUserId })
        room.session.updatePlayerName(0, name)
        // Persist room creation in SQLite
        ensureRoomRowSqlite(room)
        // Persist the initial state right away so that the draft seed (and any
        // custom card loadout) survives a mid-setup server restart. Without
        // this, a restart before the room fills would drop back to a fresh
        // default session and lose `state.draft` / `phase`.
        if (PERSIST_ROOMS === 'sqlite' || isFixedDevRoom(room.id)) {
          savePersistedState(
            room.id,
            serializeState(room.session.getState().state, { engineStack: room.session.getEngineStack() }),
            room,
          )
        }
        if (currentUserId) upsertRoomPlayer(roomId, currentUserId, 0)
        sendTo(ws, { type: 'roomCreated', roomId, playerIndex: 0, maxPlayers })
        return
      }

      if (msg.type === 'joinRoom') {
        const roomId = msg.roomId
        const room = rooms.get(roomId)
        if (!room) { sendCommandError('room not found'); return }
        const rawRequestedPlayerIndex =
          typeof msg.requestedPlayerIndex === 'number'
            ? msg.requestedPlayerIndex
            : undefined
        const requested = resolveJoinRequestPlayerIndex(room, rawRequestedPlayerIndex, currentUserId)
        if (!requested.ok) {
          sendCommandError(requested.error)
          return
        }
        const seat = resolveJoinPlayerIndex(room, requested.requestedPlayerIndex, currentUserId)
        if (!seat.ok) { sendCommandError(seat.error); return }
        currentRoom = room
        currentPlayerIndex = seat.playerIndex
        const name = typeof (msg as Record<string, unknown>).name === 'string'
          ? (msg as Record<string, unknown>).name as string
          : `Player ${currentPlayerIndex + 1}`
        if (seat.replacedExistingPlayer) {
          const existingPlayer = room.players.find(
            (player) => player.playerIndex === currentPlayerIndex,
          )
          if (existingPlayer) {
            try { existingPlayer.ws.close() } catch { /* ignore */ }
          }
        }
        room.players = room.players.filter(
          (player) => player.ws !== ws && player.playerIndex !== currentPlayerIndex,
        )
        room.players.push({ ws, playerIndex: currentPlayerIndex, name, userId: currentUserId })
        room.players.sort((a, b) => a.playerIndex - b.playerIndex)
        room.session.updatePlayerName(currentPlayerIndex, name)
        // Persist player join in SQLite
        ensureRoomRowSqlite(room)
        if (currentUserId) upsertRoomPlayer(roomId, currentUserId, currentPlayerIndex)
        sendTo(ws, { type: 'roomJoined', roomId, playerIndex: currentPlayerIndex })
        // Notify all players in the room about the join
        broadcast(room, {
          type: 'playerJoined',
          playerIndex: currentPlayerIndex,
          name,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers,
        })
        if (room.players.length === room.maxPlayers) {
          room.status = 'playing'
          // Sync player names from join commands into the game state
          for (const p of room.players) {
            room.session.updatePlayerName(p.playerIndex, p.name)
          }
          const resp = room.session.withCtx(() => room.session.getState())
          broadcastState(room, resp, 'reconnect')
          broadcast(room, { type: 'gameStarted' })
        }
        return
      }

      if (msg.type === 'dissolveRoom') {
        if (!currentRoom) { sendCommandError('not in a room'); return }
        const room = currentRoom
        if (isFixedDevRoom(room.id)) { sendCommandError('cannot dissolve dev room'); return }
        if (room.createdBy !== currentUserId) { sendCommandError('only the room creator can dissolve'); return }
        broadcast(room, { type: 'roomDissolved', roomId: room.id })
        for (const p of room.players) {
          if (p.ws !== ws) {
            try { p.ws.close() } catch { /* ignore */ }
          }
        }
        rooms.delete(room.id)
        roomLastActivity.delete(room.id)
        if (PERSIST_ROOMS === 'sqlite') {
          getPersistence().delete(room.id)
        }
        currentRoom = null
        return
      }

      if (!currentRoom) { sendCommandError('not in a room'); return }
      const room = currentRoom

      // Activate session card context for all game operations
      const callRoom = <T>(fn: (session: GameSession) => T): T =>
        room.session.withCtx(() => fn(room.session))

      // ── Seat-binding guards (PR-6 Task 4) ───────────────────────────────
      // Any command that carries a client-supplied playerIndex / playerId
      // must match the connection's own seat. This is the main anti-spoof
      // enforcement for multi-player: without it, a malicious client could
      // submit actions on another player's seat just by lying in the payload.
      const assertOwnSeat = (expectedPlayerIndex: unknown): boolean => {
        if (typeof expectedPlayerIndex !== 'number' || expectedPlayerIndex !== currentPlayerIndex) {
          sendCommandError('seat mismatch: you cannot act on another player')
          return false
        }
        return true
      }
      const assertOwnPlayerId = (expectedPlayerId: unknown): boolean => {
        const state = room.session.getState().state
        const ownId = state.players[currentPlayerIndex]?.id
        if (typeof expectedPlayerId !== 'string' || !ownId || expectedPlayerId !== ownId) {
          sendCommandError('seat mismatch: you cannot act on another player')
          return false
        }
        return true
      }

      if (msg.type === 'getState') {
        const resp = callRoom(s => s.getState())
        sendStateTo(ws, room, resp, msg.requestId)
        return
      }

      if (msg.type === 'action') {
        const resp = callRoom(s => s.takeAction(currentPlayerIndex, msg.spaceId))
        broadcastState(room, resp, 'action', msg.requestId)
        return
      }

      if (msg.type === 'choice') {
        const resp = callRoom(s => s.resolveChoice(currentPlayerIndex, msg.value, msg.payload))
        broadcastState(room, resp, 'choice', msg.requestId)
        return
      }

      if (msg.type === 'anytime') {
        const resp = callRoom(s => s.takeAnytimeAction(currentPlayerIndex, msg.actionId))
        broadcastState(room, resp, 'anytime', msg.requestId)
        return
      }

      // S2 Task 13.4: legacy 'feed' / 'nextPlayer' / 'confirmPlayerSwitch'
      // ClientCommand variants are gone — clients now send a unified
      // `{ type: 'choice', value: 'confirm', payload? }` and resolveChoice
      // dispatches on the top-of-stack InteractionRequest.kind.

      if (msg.type === 'roundEnd') {
        const resp = callRoom(s => s.performRoundEnd())
        broadcastState(room, resp, 'action', msg.requestId)
        return
      }

      if (msg.type === 'commitSelection') {
        if (!assertOwnSeat(msg.playerIndex)) return
        const resp = callRoom(s => s.commitSelectionChoice(currentPlayerIndex, msg.payload))
        broadcastState(room, resp, 'choice', msg.requestId)
        return
      }

      if (msg.type === 'undoStep') {
        const resp = callRoom(s => s.undoStep())
        broadcastState(room, resp, 'undo', msg.requestId)
        return
      }

      if (msg.type === 'undoAction') {
        const resp = callRoom(s => s.undoAction())
        broadcastState(room, resp, 'undo', msg.requestId)
        return
      }

      if (msg.type === 'newGame') {
        room.session = createSessionForRoom(msg.seed, room.customCardDbIds ?? [], room.createdBy, room.maxPlayers)
        const resp = room.session.withCtx(() => room.session.getState())
        broadcastState(room, resp, 'reconnect', msg.requestId)
        return
      }

      if (msg.type === 'loadGame') {
        const resp = callRoom(s => s.loadState(msg.state))
        broadcastState(room, resp, 'reconnect', msg.requestId)
        return
      }

      // Dev commands bypass game rules but must still respect seat binding:
      // testers / dev tooling are expected to operate from their own seat.
      // If a future debug flow genuinely needs cross-seat mutation, add an
      // explicit admin-only channel rather than weakening this guard.
      const assertDevCommandAllowed = () => {
        if (isDevCommandAllowed(room)) return true
        sendCommandError('dev commands disabled for this room')
        return false
      }

      if (msg.type === 'devSetResources') {
        if (!assertOwnSeat(msg.playerIndex)) return
        if (!assertDevCommandAllowed()) return
        const resp = callRoom(s => s.devSetResources(msg.playerIndex, msg.resources))
        broadcastState(room, resp, 'dev', msg.requestId)
        return
      }

      if (msg.type === 'devSetRound') {
        if (!assertDevCommandAllowed()) return
        const resp = callRoom(s => s.devSetRound(msg.round))
        broadcastState(room, resp, 'dev', msg.requestId)
        return
      }

      if (msg.type === 'devDrawCard') {
        if (!assertOwnSeat(msg.playerIndex)) return
        if (!assertDevCommandAllowed()) return
        const resp = callRoom(s => s.devDrawCard(msg.playerIndex, msg.cardId))
        broadcastState(room, resp, 'dev', msg.requestId)
        return
      }

      if (msg.type === 'devPlayCard') {
        if (!assertOwnSeat(msg.playerIndex)) return
        if (!assertDevCommandAllowed()) return
        const resp = callRoom(s => s.devPlayCard(msg.playerIndex, msg.cardId))
        broadcastState(room, resp, 'dev', msg.requestId)
        return
      }

      if (msg.type === 'devCreatePasture') {
        if (!assertDevCommandAllowed()) return
        const resp = callRoom(s => s.startDevFenceSelect(currentPlayerIndex))
        broadcastState(room, resp, 'action', msg.requestId)
        return
      }

      if (msg.type === 'draftSubmit') {
        if (!assertOwnPlayerId(msg.playerId)) return
        const resp = callRoom(s => s.submitDraftPick(msg.playerId, msg.pick))
        broadcastState(room, resp, 'draftSubmit', msg.requestId)
        return
      }
    })

    ws.on('close', () => {
      clearTimeout(authTimer)
      if (currentRoom) {
        const removal = removePlayerFromRoom(currentRoom, ws)
        if (removal === 'remaining') {
          broadcast(currentRoom, {
            type: 'playerDisconnected',
            playerIndex: currentPlayerIndex,
          })
        }
      }
    })
  })

  return wss
}

type RoomLikeForSummary = Pick<Room, 'id' | 'players' | 'maxPlayers' | 'createdBy'>

/**
 * Pure helper used by `getRooms` and tested directly. Hide rooms whose
 * creator/all players have disconnected — they are zombie shells that aren't
 * joinable until the cleanup loop expires them, and they pollute the lobby.
 * Fixed dev rooms are kept so dev URLs still discover them.
 */
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
      status: r.players.length < r.maxPlayers ? 'waiting' as const : 'playing' as const,
    })
    if (typeof limit === 'number' && list.length >= limit) break
  }
  return list
}

export const getRooms = (limit?: number): RoomSummary[] =>
  summarizeRoomsForLobby(rooms.values(), limit)

export const dissolveRoomById = (roomId: string, userId: string): { ok: boolean; error?: string } => {
  const room = rooms.get(roomId)
  if (!room) return { ok: false, error: 'room not found' }
  if (isFixedDevRoom(room.id)) return { ok: false, error: 'cannot dissolve dev room' }
  if (room.createdBy !== userId) return { ok: false, error: 'only the room creator can dissolve' }
  broadcast(room, { type: 'roomDissolved', roomId: room.id })
  for (const p of room.players) {
    try { p.ws.close() } catch { /* ignore */ }
  }
  rooms.delete(room.id)
  roomLastActivity.delete(room.id)
  if (PERSIST_ROOMS === 'sqlite') {
    getPersistence().delete(room.id)
  }
  return { ok: true }
}

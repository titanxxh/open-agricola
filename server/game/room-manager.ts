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
import { RoomRegistry } from './room-registry.ts'
import {
  FIXED_DEV_ROOMS,
  FIXED_DEV_ROOM_IDS,
  WAITING_EMPTY_ROOM_TTL_MS,
  PLAYING_EMPTY_ROOM_TTL_MS,
  emptyRoomTtlMs,
  isFixedDevRoom,
  removePlayerFromRoom,
  resolveJoinPlayerIndex,
  resolveJoinRequestPlayerIndex,
  snapshotToRoom,
  summarizeRoomsForLobby,
  toRoomMeta,
  type Room,
  type RoomPlayer,
} from './room.ts'
import type { Lobby } from './lobby.ts'

export {
  FIXED_DEV_ROOMS,
  FIXED_DEV_ROOM_IDS,
  isFixedDevRoom,
  removePlayerFromRoom,
  resolveJoinPlayerIndex,
  resolveJoinRequestPlayerIndex,
  summarizeRoomsForLobby,
  type Room,
}

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

// ── Persistence adapter ──────────────────────────────────────────────────────

let _persistence: RoomPersistence | null = null
export function setPersistence(p: RoomPersistence): void { _persistence = p }
function getPersistence(): RoomPersistence {
  if (!_persistence) throw new Error('RoomPersistence not initialized; call setPersistence() at startup')
  return _persistence
}

// ── Registry + Lobby DI ──────────────────────────────────────────────────────

let _registry: RoomRegistry | null = null
export function setRegistry(r: RoomRegistry): void { _registry = r }
function getRegistry(): RoomRegistry {
  if (!_registry) throw new Error('RoomRegistry not initialized; call setRegistry() at startup')
  return _registry
}

let _lobby: Lobby | null = null
export function setLobby(l: Lobby): void { _lobby = l }
function getLobby(): Lobby {
  if (!_lobby) throw new Error('Lobby not initialized; call setLobby() at startup')
  return _lobby
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

type RoomStatus = 'waiting' | 'playing'

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

// ── Persistence helpers ──────────────────────────────────────────────────────

function savePersistedState(roomId: string, serialized: SerializedGameState, room?: Room): void {
  const meta: RoomMeta = room ? toRoomMeta(room) : { createdBy: null, maxPlayers: 2, customCardDbIds: [], status: 'playing' as const, players: [] }
  getPersistence().save(roomId, serialized, meta)
}

/** Write a placeholder row when a room is first created (before any state). */
function ensureRoomRowSqlite(room: Room): void {
  if (PERSIST_ROOMS !== 'sqlite') return
  getPersistence().save(room.id, null, toRoomMeta(room))
}

/** In the new adapter model, player info is written via meta.players on the next save(). */
function upsertRoomPlayer(roomId: string, userId: string, playerIndex: number): void {
  if (PERSIST_ROOMS !== 'sqlite' || !userId) return
  const room = getRegistry().get(roomId)
  if (!room) return
  getPersistence().save(roomId, null, toRoomMeta(room))
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

function ensurePersistentRooms(): void {
  for (const { id, playerCount } of FIXED_DEV_ROOMS) {
    if (getRegistry().has(id)) continue
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
    getRegistry().set({
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
    if (getRegistry().has(snap.id)) continue
    const room = snapshotToRoom(snap)
    if (!room) continue
    getRegistry().set(room)
    if (snap.updatedAt > 0) getRegistry().touchActivity(snap.id, snap.updatedAt)
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

/** Internal: bridge for lobby's RoomBroadcaster contract. PR-S5-3 will replace. */
export const __internalBroadcastEvent = (room: Room, event: ServerEvent): void => {
  broadcast(room, event)
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

const isDevCommandAllowed = (room: Pick<Room, 'id'>): boolean =>
  isFixedDevRoom(room.id)

function startRoomCleanup(): void {
  setInterval(() => {
    const now = Date.now()
    for (const room of getRegistry().iter()) {
      if (isFixedDevRoom(room.id)) continue
      if (room.players.length > 0) {
        getRegistry().touchActivity(room.id, now)
        continue
      }
      const lastSeen = getRegistry().lastActivityOf(room.id) ?? now
      if (now - lastSeen > emptyRoomTtlMs(room)) {
        getRegistry().delete(room.id)
        getRegistry().clearActivity(room.id)
        if (PERSIST_ROOMS === 'sqlite') {
          getPersistence().markFinished(room.id, now)
        }
        console.log(`[room-manager] cleaned up empty room ${room.id}`)
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
        getRegistry().set(room)
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
        const room = getRegistry().get(roomId)
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
        const result = getLobby().dissolveRoomById(currentRoom.id, currentUserId)
        if (!result.ok) { sendCommandError(result.error ?? 'dissolve failed'); return }
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
        if (removal === 'empty' && !isFixedDevRoom(currentRoom.id)) {
          getRegistry().touchActivity(currentRoom.id, Date.now())
        }
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

export const getRooms = (limit?: number): RoomSummary[] => getLobby().getRooms(limit)

export const dissolveRoomById = (roomId: string, userId: string): { ok: boolean; error?: string } =>
  getLobby().dissolveRoomById(roomId, userId)

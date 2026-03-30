import type { IncomingMessage } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { GameSession, type SessionResponse } from './game-session.ts'
import { serializeState, rehydrateState, type SerializedGameState } from '../shared/game/serialization.ts'
import type { GameSyncPayload, StateUpdateCause, StateUpdateEnvelope } from '../shared/protocol/game.ts'
import type { ClientCommand, ServerEvent, RoomSummary } from '../shared/protocol/ws.ts'
import { validateSession } from './auth.ts'
import { getDb } from './db.ts'
import type { CustomCardData } from '../shared/cards/custom-registry.ts'

/** Load custom card data from DB by workshop_cards.id list. Allows published + author's drafts. */
function loadCustomCardsFromDb(cardDbIds: string[], requestUserId?: string): CustomCardData[] {
  if (!cardDbIds.length) return []
  const db = getDb()
  const result: CustomCardData[] = []
  for (const dbId of cardDbIds) {
    const row = db.prepare(
      'SELECT card_type, card_json, effect_dsl, compiled_code, status, author_id FROM workshop_cards WHERE id = ?',
    ).get(dbId) as {
      card_type: string; card_json: string; effect_dsl: string | null; compiled_code: string | null
      status: string; author_id: string
    } | undefined
    if (!row) continue
    const allowed = row.status === 'published' || (row.status === 'draft' && requestUserId === row.author_id)
    if (!allowed) continue
    try {
      result.push({
        cardType: row.card_type as 'minor' | 'occupation',
        cardJson: JSON.parse(row.card_json),
        effectDsl: row.effect_dsl ? JSON.parse(row.effect_dsl) : null,
        compiledCode: row.compiled_code ?? null,
      })
    } catch { /* skip malformed */ }
  }
  return result
}

/** Fixed room ID for dev: one persistent room, survives backend restart. */
export const FIXED_DEV_ROOM_ID = process.env.PERSISTENT_ROOM_ID ?? 'dev'

const PERSISTED_ROOMS_DIR = process.env.PERSISTED_ROOMS_DIR ?? join(process.cwd(), 'output')
const LEGACY_PERSISTED_ROOM_FILE = process.env.PERSISTED_ROOM_FILE ?? join(process.cwd(), '.persisted-room.json')

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

type Room = {
  id: string
  session: GameSession
  players: RoomPlayer[]
  maxPlayers: number
  version: number
  createdBy?: string
}

const rooms = new Map<string, Room>()

type JoinSeatResolution =
  | { ok: true; playerIndex: number; replacedExistingPlayer: boolean }
  | { ok: false; error: string }

const toPersistedRoomFileName = (roomId: string) =>
  `${roomId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`

const getPersistedRoomFile = (roomId: string) =>
  join(PERSISTED_ROOMS_DIR, toPersistedRoomFileName(roomId))

export const resolveJoinPlayerIndex = (
  room: Pick<Room, 'id' | 'maxPlayers' | 'players'>,
  requestedPlayerIndex?: number,
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
      if (room.id !== FIXED_DEV_ROOM_ID) {
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

// ── Persistence helpers ──────────────────────────────────────────────────────

function loadPersistedState(roomId: string): SerializedGameState | null {
  if (PERSIST_ROOMS === 'sqlite') {
    return loadPersistedStateSqlite(roomId)
  }
  return loadPersistedStateJson(roomId)
}

function savePersistedState(roomId: string, serialized: SerializedGameState, room?: Room): void {
  if (PERSIST_ROOMS === 'sqlite') {
    savePersistedStateSqlite(roomId, serialized, room)
  } else {
    savePersistedStateJson(roomId, serialized)
  }
}

function loadPersistedStateJson(roomId: string): SerializedGameState | null {
  const candidates = [getPersistedRoomFile(roomId)]
  if (roomId === FIXED_DEV_ROOM_ID) {
    candidates.push(LEGACY_PERSISTED_ROOM_FILE)
  }
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    try {
      const raw = readFileSync(filePath, 'utf-8')
      return JSON.parse(raw) as SerializedGameState
    } catch {
      continue
    }
  }
  return null
}

function savePersistedStateJson(roomId: string, serialized: SerializedGameState): void {
  try {
    mkdirSync(PERSISTED_ROOMS_DIR, { recursive: true })
    writeFileSync(
      getPersistedRoomFile(roomId),
      JSON.stringify(serialized, null, 0),
      'utf-8',
    )
  } catch (err) {
    console.warn('[room-manager] persist (json) failed:', err)
  }
}

function loadPersistedStateSqlite(roomId: string): SerializedGameState | null {
  try {
    const db = getDb()
    const row = db.prepare('SELECT state_json FROM rooms WHERE id = ?').get(roomId) as
      | { state_json: string | null }
      | undefined
    if (!row?.state_json) return null
    return JSON.parse(row.state_json) as SerializedGameState
  } catch (err) {
    console.warn('[room-manager] persist (sqlite) load failed:', err)
    return null
  }
}

function savePersistedStateSqlite(roomId: string, serialized: SerializedGameState, room?: Room): void {
  try {
    const db = getDb()
    const now = Date.now()
    const stateJson = JSON.stringify(serialized)
    const existing = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId)
    if (existing) {
      db.prepare(
        'UPDATE rooms SET state_json = ?, status = ?, version = version + 1, updated_at = ? WHERE id = ?',
      ).run(stateJson, 'playing', now, roomId)
    } else {
      db.prepare(
        'INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      ).run(roomId, room?.createdBy ?? null, stateJson, room?.maxPlayers ?? 2, 'playing', '[]', now, now)
    }
  } catch (err) {
    console.warn('[room-manager] persist (sqlite) save failed:', err)
  }
}

/** Write a room row to SQLite when it is first created (before any state). */
function ensureRoomRowSqlite(room: Room): void {
  if (PERSIST_ROOMS !== 'sqlite') return
  try {
    const db = getDb()
    const now = Date.now()
    const exists = db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(room.id)
    if (!exists) {
      db.prepare(
        'INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, 0, ?, ?, ?)',
      ).run(room.id, room.createdBy ?? null, room.maxPlayers, 'waiting', '[]', now, now)
    }
  } catch (err) {
    console.warn('[room-manager] ensureRoomRow failed:', err)
  }
}

/** Upsert a player row in room_players. */
function upsertRoomPlayer(roomId: string, userId: string, playerIndex: number): void {
  if (PERSIST_ROOMS !== 'sqlite' || !userId) return
  try {
    const db = getDb()
    const now = Date.now()
    const exists = db.prepare(
      'SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ?',
    ).get(roomId, userId)
    if (!exists) {
      db.prepare(
        'INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)',
      ).run(roomId, userId, playerIndex, now)
    }
  } catch (err) {
    console.warn('[room-manager] upsertRoomPlayer failed:', err)
  }
}

// ── Room lifecycle ───────────────────────────────────────────────────────────

function loadRoomFromState(roomId: string, serialized: SerializedGameState, maxPlayers = 2, createdBy?: string): Room {
  const session = new GameSession()
  try {
    session.loadState(rehydrateState(serialized))
  } catch (err) {
    console.warn(`[room-manager] failed to rehydrate room ${roomId}, starting fresh:`, err)
  }
  return { id: roomId, session, players: [], maxPlayers, version: 0, createdBy }
}

function ensurePersistentRoom(): void {
  if (rooms.has(FIXED_DEV_ROOM_ID)) return
  const serialized = loadPersistedState(FIXED_DEV_ROOM_ID)
  const session = new GameSession()
  if (serialized) {
    try {
      session.loadState(rehydrateState(serialized))
    } catch (err) {
      console.warn('[room-manager] load persisted state failed, starting fresh:', err)
    }
  }
  const room: Room = {
    id: FIXED_DEV_ROOM_ID,
    session,
    players: [],
    maxPlayers: 2,
    version: 0,
  }
  rooms.set(FIXED_DEV_ROOM_ID, room)
}

/**
 * In SQLite mode: restore all 'playing' rooms from the database into memory.
 * Called once at startup. Players will reconnect via joinRoom.
 */
function restoreRoomsFromSqlite(): void {
  if (PERSIST_ROOMS !== 'sqlite') return
  try {
    const db = getDb()
    const rows = db.prepare(
      "SELECT id, created_by, state_json, max_players FROM rooms WHERE status = 'playing' AND id != ?",
    ).all(FIXED_DEV_ROOM_ID) as Array<{
      id: string
      created_by: string | null
      state_json: string | null
      max_players: number
    }>
    for (const row of rows) {
      if (rooms.has(row.id)) continue
      if (!row.state_json) continue
      try {
        const serialized = JSON.parse(row.state_json) as SerializedGameState
        const room = loadRoomFromState(row.id, serialized, row.max_players, row.created_by ?? undefined)
        rooms.set(row.id, room)
        console.log(`[room-manager] restored room ${row.id} from SQLite`)
      } catch (err) {
        console.warn(`[room-manager] failed to restore room ${row.id}:`, err)
      }
    }
  } catch (err) {
    console.warn('[room-manager] restoreRoomsFromSqlite failed:', err)
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

const toSyncPayload = (resp: SessionResponse): GameSyncPayload => ({
  state: serializeState(resp.state),
  pending: resp.pending,
  interaction: resp.interaction,
  scores: resp.scores ?? null,
  pastureCapacities: resp.pastureCapacities,
  historyLength: resp.historyLength,
  hasActionStartSnapshot: resp.hasActionStartSnapshot,
  ok: resp.ok,
  actionAvailability: resp.actionAvailability,
  cardAvailability: resp.cardAvailability,
  error: resp.error,
})

const broadcastState = (room: Room, resp: SessionResponse, cause: StateUpdateCause) => {
  room.version += 1
  const envelope: StateUpdateEnvelope = {
    type: 'stateUpdate',
    roomId: room.id,
    version: room.version,
    sync: 'snapshot',
    cause,
    payload: toSyncPayload(resp),
    emittedAt: Date.now(),
  }
  broadcast(room, envelope)
  // Persist on every state change for sqlite, only dev room for json
  if (PERSIST_ROOMS === 'sqlite' || room.id === FIXED_DEV_ROOM_ID) {
    savePersistedState(room.id, serializeState(resp.state), room)
  }
  // Mark room as finished in SQLite when game ends
  if (PERSIST_ROOMS === 'sqlite' && resp.state.gameOver) {
    try {
      getDb().prepare("UPDATE rooms SET status = 'finished', updated_at = ? WHERE id = ?")
        .run(Date.now(), room.id)
    } catch { /* non-critical */ }
  }
}

const sendStateTo = (ws: WebSocket, room: Room, resp: SessionResponse) => {
  const envelope: StateUpdateEnvelope = {
    type: 'stateUpdate',
    roomId: room.id,
    version: room.version,
    sync: 'snapshot',
    cause: 'reconnect',
    payload: toSyncPayload(resp),
    emittedAt: Date.now(),
  }
  sendTo(ws, envelope)
}

// ── WebSocket server ─────────────────────────────────────────────────────────

/** TTL for empty rooms (no connected players) before they are cleaned up. */
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000  // 30 minutes
const roomLastActivity = new Map<string, number>()

function startRoomCleanup(): void {
  setInterval(() => {
    const now = Date.now()
    for (const [roomId, room] of rooms) {
      if (roomId === FIXED_DEV_ROOM_ID) continue
      if (room.players.length > 0) {
        roomLastActivity.set(roomId, now)
        continue
      }
      const lastSeen = roomLastActivity.get(roomId) ?? now
      if (now - lastSeen > EMPTY_ROOM_TTL_MS) {
        rooms.delete(roomId)
        roomLastActivity.delete(roomId)
        if (PERSIST_ROOMS === 'sqlite') {
          try {
            getDb().prepare("UPDATE rooms SET status = 'finished', updated_at = ? WHERE id = ?")
              .run(now, roomId)
          } catch { /* non-critical */ }
        }
        console.log(`[room-manager] cleaned up empty room ${roomId}`)
      }
    }
  }, 5 * 60 * 1000) // check every 5 minutes
}

export const createWsServer = (server: import('node:http').Server) => {
  if (process.env.NODE_ENV !== 'production') {
    ensurePersistentRoom()
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

      // ── Auth handshake ───────────────────────────────────────────────────
      if (msg.type === 'auth') {
        const user = validateSession(msg.token)
        if (!user) {
          sendTo(ws, { type: 'error', error: 'invalid or expired token' })
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
        sendTo(ws, { type: 'error', error: 'not authenticated' })
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
        const customCards = loadCustomCardsFromDb(customCardDbIds, currentUserId)
        if (customCards.length > 0) {
          await GameSession.preloadCardFiles(customCards)
        }
        const session = new GameSession(undefined, customCards.length > 0 ? customCards : undefined)
        const room: Room = { id: roomId, session, players: [], maxPlayers, version: 0, createdBy: currentUserId }
        rooms.set(roomId, room)
        currentRoom = room
        currentPlayerIndex = 0
        const name = typeof (msg as Record<string, unknown>).name === 'string'
          ? (msg as Record<string, unknown>).name as string
          : 'Player 1'
        room.players.push({ ws, playerIndex: 0, name, userId: currentUserId })
        // Persist room creation in SQLite
        ensureRoomRowSqlite(room)
        if (currentUserId) upsertRoomPlayer(roomId, currentUserId, 0)
        sendTo(ws, { type: 'roomCreated', roomId, playerIndex: 0 })
        return
      }

      if (msg.type === 'joinRoom') {
        const roomId = msg.roomId
        const room = rooms.get(roomId)
        if (!room) { sendTo(ws, { type: 'error', error: 'room not found' }); return }
        const requestedPlayerIndex =
          typeof msg.requestedPlayerIndex === 'number'
            ? msg.requestedPlayerIndex
            : undefined
        const seat = resolveJoinPlayerIndex(room, requestedPlayerIndex)
        if (!seat.ok) { sendTo(ws, { type: 'error', error: seat.error }); return }
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
        // Persist player join in SQLite
        ensureRoomRowSqlite(room)
        if (currentUserId) upsertRoomPlayer(roomId, currentUserId, currentPlayerIndex)
        sendTo(ws, { type: 'roomJoined', roomId, playerIndex: currentPlayerIndex })
        if (room.players.length === room.maxPlayers) {
          // Sync player names from join commands into the game state
          for (const p of room.players) {
            room.session.updatePlayerName(p.playerIndex, p.name)
          }
          const resp = room.session.getState()
          broadcastState(room, resp, 'reconnect')
          broadcast(room, { type: 'gameStarted' })
        }
        return
      }

      if (!currentRoom) { sendTo(ws, { type: 'error', error: 'not in a room' }); return }
      const room = currentRoom

      if (msg.type === 'getState') {
        const resp = room.session.getState()
        sendStateTo(ws, room, resp)
        return
      }

      if (msg.type === 'action') {
        const resp = room.session.takeAction(currentPlayerIndex, msg.spaceId)
        broadcastState(room, resp, 'action')
        return
      }

      if (msg.type === 'choice') {
        const resp = room.session.resolveChoice(currentPlayerIndex, msg.value)
        broadcastState(room, resp, 'choice')
        return
      }

      if (msg.type === 'anytime') {
        const resp = room.session.takeAnytimeAction(currentPlayerIndex, msg.actionId)
        broadcastState(room, resp, 'anytime')
        return
      }

      if (msg.type === 'reorg') {
        const resp = room.session.confirmAnimalReorg(currentPlayerIndex, msg.zones)
        broadcastState(room, resp, 'reorg')
        return
      }

      if (msg.type === 'feed') {
        const resp = room.session.confirmHarvestFeed(currentPlayerIndex, msg.selections)
        broadcastState(room, resp, 'feed')
        return
      }

      if (msg.type === 'nextPlayer') {
        const resp = room.session.confirmNextPlayer()
        broadcastState(room, resp, 'action')
        return
      }

      if (msg.type === 'confirmPlayerSwitch') {
        const resp = room.session.confirmPlayerSwitch()
        broadcastState(room, resp, 'action')
        return
      }

      if (msg.type === 'roundEnd') {
        const resp = room.session.performRoundEnd()
        broadcastState(room, resp, 'action')
        return
      }

      if (msg.type === 'commitFarm') {
        const resp = room.session.commitFarmChoice(currentPlayerIndex, msg.farmType, msg.payload)
        broadcastState(room, resp, 'choice')
        return
      }

      if (msg.type === 'undoStep') {
        const resp = room.session.undoStep()
        broadcastState(room, resp, 'undo')
        return
      }

      if (msg.type === 'undoAction') {
        const resp = room.session.undoAction()
        broadcastState(room, resp, 'undo')
        return
      }

      if (msg.type === 'newGame') {
        room.session = new GameSession(msg.seed)
        const resp = room.session.getState()
        broadcastState(room, resp, 'reconnect')
        return
      }

      if (msg.type === 'loadGame') {
        const resp = room.session.loadState(msg.state)
        broadcastState(room, resp, 'reconnect')
        return
      }

      if (msg.type === 'devCreatePasture') {
        const resp = room.session.startDevFenceSelect(currentPlayerIndex)
        broadcastState(room, resp, 'action')
        return
      }
    })

    ws.on('close', () => {
      clearTimeout(authTimer)
      if (currentRoom) {
        const beforeCount = currentRoom.players.length
        currentRoom.players = currentRoom.players.filter((p) => p.ws !== ws)
        const wasPresent = currentRoom.players.length !== beforeCount
        if (!wasPresent) return
        if (currentRoom.players.length === 0 && currentRoom.id !== FIXED_DEV_ROOM_ID) {
          rooms.delete(currentRoom.id)
        } else if (currentRoom.players.length > 0) {
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

export const getRooms = (): RoomSummary[] =>
  Array.from(rooms.values()).map((r) => ({
    id: r.id,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
  }))

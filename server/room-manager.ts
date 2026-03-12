import type { IncomingMessage } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { GameSession, type SessionResponse } from './game-session.ts'
import { serializeState, rehydrateState, type SerializedGameState } from '../shared/game/serialization.ts'
import type { GameSyncPayload, StateUpdateCause, StateUpdateEnvelope } from '../shared/protocol/game.ts'
import type { ClientCommand, ServerEvent, RoomSummary } from '../shared/protocol/ws.ts'

/** Fixed room ID for dev: one persistent room, survives backend restart. */
export const FIXED_DEV_ROOM_ID = process.env.PERSISTENT_ROOM_ID ?? 'dev'

const PERSISTED_ROOMS_DIR = process.env.PERSISTED_ROOMS_DIR ?? join(process.cwd(), 'output')
const LEGACY_PERSISTED_ROOM_FILE = process.env.PERSISTED_ROOM_FILE ?? join(process.cwd(), '.persisted-room.json')

type RoomPlayer = {
  ws: WebSocket
  playerIndex: number
  name: string
}

type Room = {
  id: string
  session: GameSession
  players: RoomPlayer[]
  maxPlayers: number
  version: number
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

function loadPersistedState(roomId: string): SerializedGameState | null {
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

function savePersistedState(roomId: string, serialized: SerializedGameState): void {
  try {
    mkdirSync(PERSISTED_ROOMS_DIR, { recursive: true })
    writeFileSync(
      getPersistedRoomFile(roomId),
      JSON.stringify(serialized, null, 0),
      'utf-8',
    )
  } catch (err) {
    console.warn('[room-manager] persist failed:', err)
  }
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
  historyLength: resp.historyLength,
  hasActionStartSnapshot: resp.hasActionStartSnapshot,
  ok: resp.ok,
  actionAvailability: resp.actionAvailability,
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
  if (room.id === FIXED_DEV_ROOM_ID) {
    savePersistedState(room.id, serializeState(resp.state))
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

export const createWsServer = (server: import('node:http').Server) => {
  ensurePersistentRoom()
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    let currentRoom: Room | null = null
    let currentPlayerIndex = -1

    ws.on('message', (raw: Buffer) => {
      let msg: ClientCommand
      try { msg = JSON.parse(raw.toString()) as ClientCommand } catch { return }

      if (msg.type === 'createRoom') {
        const roomId = generateRoomId()
        const maxPlayers = typeof (msg as Record<string, unknown>).maxPlayers === 'number'
          ? (msg as Record<string, unknown>).maxPlayers as number
          : 2
        const session = new GameSession()
        const room: Room = { id: roomId, session, players: [], maxPlayers, version: 0 }
        rooms.set(roomId, room)
        currentRoom = room
        currentPlayerIndex = 0
        const name = typeof (msg as Record<string, unknown>).name === 'string'
          ? (msg as Record<string, unknown>).name as string
          : 'Player 1'
        room.players.push({ ws, playerIndex: 0, name })
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
            try {
              existingPlayer.ws.close()
            } catch {
              // Ignore close errors during reconnect replacement.
            }
          }
        }
        room.players = room.players.filter(
          (player) => player.ws !== ws && player.playerIndex !== currentPlayerIndex,
        )
        room.players.push({ ws, playerIndex: currentPlayerIndex, name })
        room.players.sort((a, b) => a.playerIndex - b.playerIndex)
        sendTo(ws, { type: 'roomJoined', roomId, playerIndex: currentPlayerIndex })
        if (room.players.length === room.maxPlayers) {
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
        // Use server-side currentPlayerIndex for security - don't trust client
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
        // Use server-side currentPlayerIndex for consistency
        const resp = room.session.startDevFenceSelect(currentPlayerIndex)
        broadcastState(room, resp, 'action')
        return
      }
    })

    ws.on('close', () => {
      if (currentRoom) {
        const beforeCount = currentRoom.players.length
        currentRoom.players = currentRoom.players.filter((p) => p.ws !== ws)
        const wasPresent = currentRoom.players.length !== beforeCount
        if (!wasPresent) {
          return
        }
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

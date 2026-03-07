import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { GameSession, type SessionResponse } from './game-session.ts'
import { serializeState } from '../shared/game/serialization.ts'
import type { GameSyncPayload, StateUpdateCause, StateUpdateEnvelope } from '../shared/protocol/game.ts'
import type { ClientCommand, ServerEvent, RoomSummary } from '../shared/protocol/ws.ts'

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
  scores: resp.scores ?? null,
  historyLength: resp.historyLength,
  hasActionStartSnapshot: resp.hasActionStartSnapshot,
  ok: resp.ok,
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
        if (room.players.length >= room.maxPlayers) { sendTo(ws, { type: 'error', error: 'room full' }); return }
        currentRoom = room
        currentPlayerIndex = room.players.length
        const name = typeof (msg as Record<string, unknown>).name === 'string'
          ? (msg as Record<string, unknown>).name as string
          : `Player ${currentPlayerIndex + 1}`
        room.players.push({ ws, playerIndex: currentPlayerIndex, name })
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

      if (msg.type === 'roundEnd') {
        const resp = room.session.performRoundEnd()
        broadcastState(room, resp, 'action')
        return
      }
    })

    ws.on('close', () => {
      if (currentRoom) {
        currentRoom.players = currentRoom.players.filter((p) => p.ws !== ws)
        if (currentRoom.players.length === 0) {
          rooms.delete(currentRoom.id)
        } else {
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

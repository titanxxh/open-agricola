import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { GameSession, type SessionResponse } from './game-session.ts'

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
}

const rooms = new Map<string, Room>()

const generateRoomId = () => Math.random().toString(36).slice(2, 8)

const broadcast = (room: Room, message: unknown) => {
  const data = JSON.stringify(message)
  room.players.forEach((p) => {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data)
  })
}

const sendTo = (ws: WebSocket, message: unknown) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

const stripFunctions = (state: unknown) => {
  const s = state as Record<string, unknown>
  const result: Record<string, unknown> = { ...s, roundStartSnapshot: null }
  if (s && Array.isArray(s.actionSpaces)) {
    result.actionSpaces = (s.actionSpaces as Record<string, unknown>[]).map(
      ({ canBeExecutedByPlayer, execute, resolveChoice, flow, ...rest }) => rest,
    )
  }
  return result
}

const broadcastState = (room: Room, resp: SessionResponse) => {
  broadcast(room, {
    type: 'stateUpdate',
    state: stripFunctions(resp.state),
    pending: resp.pending,
    scores: resp.scores ?? null,
  })
}

export const createWsServer = (server: import('node:http').Server) => {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    let currentRoom: Room | null = null
    let currentPlayerIndex = -1

    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) as Record<string, unknown> } catch { return }

      const msgType = msg.type as string

      if (msgType === 'createRoom') {
        const roomId = generateRoomId()
        const maxPlayers = typeof msg.maxPlayers === 'number' ? msg.maxPlayers : 2
        const session = new GameSession()
        const room: Room = { id: roomId, session, players: [], maxPlayers }
        rooms.set(roomId, room)
        currentRoom = room
        currentPlayerIndex = 0
        const name = typeof msg.name === 'string' ? msg.name : 'Player 1'
        room.players.push({ ws, playerIndex: 0, name })
        sendTo(ws, { type: 'roomCreated', roomId, playerIndex: 0 })
        return
      }

      if (msgType === 'joinRoom') {
        const roomId = msg.roomId as string
        const room = rooms.get(roomId)
        if (!room) { sendTo(ws, { type: 'error', error: 'room not found' }); return }
        if (room.players.length >= room.maxPlayers) { sendTo(ws, { type: 'error', error: 'room full' }); return }
        currentRoom = room
        currentPlayerIndex = room.players.length
        const name = typeof msg.name === 'string' ? msg.name : `Player ${currentPlayerIndex + 1}`
        room.players.push({ ws, playerIndex: currentPlayerIndex, name })
        sendTo(ws, { type: 'roomJoined', roomId, playerIndex: currentPlayerIndex })
        if (room.players.length === room.maxPlayers) {
          const resp = room.session.getState()
          broadcastState(room, resp)
          broadcast(room, { type: 'gameStarted' })
        }
        return
      }

      if (!currentRoom) { sendTo(ws, { type: 'error', error: 'not in a room' }); return }
      const room = currentRoom

      if (msgType === 'getState') {
        const resp = room.session.getState()
        sendTo(ws, { type: 'stateUpdate', state: stripFunctions(resp.state), pending: resp.pending, scores: resp.scores ?? null })
        return
      }

      if (msgType === 'action') {
        const resp = room.session.takeAction(currentPlayerIndex, msg.spaceId as string)
        broadcastState(room, resp)
        return
      }

      if (msgType === 'choice') {
        const resp = room.session.resolveChoice(currentPlayerIndex, msg.value as string)
        broadcastState(room, resp)
        return
      }

      if (msgType === 'reorg') {
        const resp = room.session.confirmAnimalReorg(currentPlayerIndex, msg.zones as Parameters<GameSession['confirmAnimalReorg']>[1])
        broadcastState(room, resp)
        return
      }

      if (msgType === 'feed') {
        const resp = room.session.confirmHarvestFeed(currentPlayerIndex, msg.selections as Parameters<GameSession['confirmHarvestFeed']>[1])
        broadcastState(room, resp)
        return
      }

      if (msgType === 'nextPlayer') {
        const resp = room.session.confirmNextPlayer()
        broadcastState(room, resp)
        return
      }

      if (msgType === 'roundEnd') {
        const resp = room.session.performRoundEnd()
        broadcastState(room, resp)
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

export const getRooms = () =>
  Array.from(rooms.values()).map((r) => ({
    id: r.id,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
  }))

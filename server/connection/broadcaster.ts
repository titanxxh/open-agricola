import type { WebSocket } from 'ws'
import type { Room } from '../game/room.ts'
import type { SessionResponse } from '../game/authoritative-session.ts'
import type { RoomPersistenceCheckpoint } from '../game/room-persistence-checkpoint.ts'
import type { ServerEvent } from '../../shared/contract/protocol/ws.ts'
import type { StateUpdateCause } from '../../shared/contract/protocol/game.ts'
import { buildEnvelope } from './envelope-builder.ts'

const viewerIdForSeat = (resp: SessionResponse, seatIndex: number | undefined): string | null => {
  if (typeof seatIndex !== 'number') return null
  return resp.state.players[seatIndex]?.id ?? null
}

export class Broadcaster {
  private readonly checkpoint: RoomPersistenceCheckpoint

  constructor(deps: {
    checkpoint: RoomPersistenceCheckpoint
  }) {
    this.checkpoint = deps.checkpoint
  }

  broadcastState(room: Room, resp: SessionResponse, cause: StateUpdateCause, requestId?: string): void {
    room.version += 1
    const emittedAt = Date.now()
    for (const seat of room.players) {
      if (seat.ws.readyState !== seat.ws.OPEN) continue
      const env = buildEnvelope({
        room,
        resp,
        viewerPlayerId: viewerIdForSeat(resp, seat.playerIndex),
        version: room.version,
        cause,
        requestId,
        emittedAt,
      })
      seat.ws.send(JSON.stringify(env))
    }
    if (resp.state.gameOver) {
      this.checkpoint.completeGame(room)
    } else {
      this.checkpoint.recordState(room)
    }
  }

  sendStateTo(ws: WebSocket, room: Room, resp: SessionResponse, requestId?: string): void {
    const seat = room.players.find((p) => p.ws === ws)
    const env = buildEnvelope({
      room,
      resp,
      viewerPlayerId: viewerIdForSeat(resp, seat?.playerIndex),
      version: room.version,
      cause: 'reconnect',
      requestId,
      emittedAt: Date.now(),
    })
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(env))
  }

  broadcastEvent(room: Room, event: ServerEvent): void {
    const data = JSON.stringify(event)
    for (const seat of room.players) {
      if (seat.ws.readyState === seat.ws.OPEN) seat.ws.send(data)
    }
  }

  sendTo(ws: WebSocket, event: ServerEvent): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event))
  }
}

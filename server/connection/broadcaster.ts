import type { WebSocket } from 'ws'
import type { Room } from '../game/room.ts'
import type { SessionResponse } from '../game/authoritative-session.ts'
import type { RoomPersistenceCheckpoint } from '../game/room-persistence-checkpoint.ts'
import type { ServerEvent } from '../../shared/contract/protocol/ws.ts'
import type { StateUpdateCause } from '../../shared/contract/protocol/game.ts'
import { buildEnvelope } from './envelope-builder.ts'
import type { SyncPayloadMode } from '../../shared/session/sync-payload.ts'

const viewerIdForSeat = (resp: SessionResponse, seatIndex: number | undefined): string | null => {
  if (typeof seatIndex !== 'number') return null
  return resp.state.players[seatIndex]?.id ?? null
}

/**
 * A hotseat connection holds every seat, so per-seat redaction would hide the
 * very hands and prompts it has to play: masked cards, `private-prompt`
 * placeholders and a missing `cardAvailability` make seats other than the first
 * unplayable. Give it the unredacted projection instead — there is nobody on
 * the other end to hide anything from.
 */
const projectionModeFor = (room: Room): SyncPayloadMode | undefined =>
  room.hotseat === true ? 'debug' : undefined

type RequesterResponse = {
  ws: WebSocket
  response: SessionResponse
}

export class Broadcaster {
  private readonly checkpoint: RoomPersistenceCheckpoint

  constructor(deps: {
    checkpoint: RoomPersistenceCheckpoint
  }) {
    this.checkpoint = deps.checkpoint
  }

  broadcastState(
    room: Room,
    resp: SessionResponse,
    cause: StateUpdateCause,
    requestId?: string,
    requesterResponse?: RequesterResponse,
  ): void {
    room.version += 1
    this.broadcastCommitted(room, resp, cause, requestId, requesterResponse)
    if (resp.state.gameOver) {
      this.checkpoint.completeGame(room)
    } else {
      this.checkpoint.recordState(room)
    }
  }

  broadcastCommitted(
    room: Room,
    resp: SessionResponse,
    cause: StateUpdateCause,
    requestId?: string,
    requesterResponse?: RequesterResponse,
  ): void {
    const emittedAt = Date.now()
    for (const seat of room.players) {
      if (seat.ws.readyState !== seat.ws.OPEN) continue
      const env = buildEnvelope({
        room,
        resp: requesterResponse?.ws === seat.ws ? requesterResponse.response : resp,
        viewerPlayerId: viewerIdForSeat(resp, seat.playerIndex),
        version: room.version,
        cause,
        requestId,
        emittedAt,
        mode: projectionModeFor(room),
      })
      seat.ws.send(JSON.stringify(env))
    }
  }

  sendStateTo(
    ws: WebSocket,
    room: Room,
    resp: SessionResponse,
    requestId?: string,
    cause: StateUpdateCause = 'reconnect',
    mode?: SyncPayloadMode,
  ): void {
    const seat = room.players.find((p) => p.ws === ws)
    const env = buildEnvelope({
      room,
      resp,
      viewerPlayerId: viewerIdForSeat(resp, seat?.playerIndex),
      version: room.version,
      cause,
      requestId,
      emittedAt: Date.now(),
      mode: mode ?? projectionModeFor(room),
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

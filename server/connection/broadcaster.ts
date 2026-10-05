import { ExecutionAccess } from '../game/execution-access'
import { RoomDirectory, RoomOwnershipError } from '../game/room-directory'
import type { WebSocket } from 'ws'
import { isDevRoom, roomOccupiedSeatCount, type Room } from '../game/room.ts'
import type { SessionResponse } from '../game/authoritative-session.ts'
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
 *
 * A dev room keeps per-seat redaction but still shows the full round-card
 * order, which the `devMode` board preview relies on (ADR-0020).
 */
const projectionModeFor = (room: Room): SyncPayloadMode | undefined => {
  if (room.hotseat === true) return 'debug'
  return isDevRoom(room.id) ? 'dev-viewer' : undefined
}

type RequesterResponse = {
  ws: WebSocket
  response: SessionResponse
}

export class Broadcaster {
  private readonly tokens = new WeakMap<WebSocket, string>()
  authenticate(ws: WebSocket, token?: string): void { if (token) this.tokens.set(ws, token); else this.tokens.delete(ws) }
  private readonly directory?: RoomDirectory
  constructor(directory?: RoomDirectory) { this.directory = directory }

  private publish(room: Room, send: () => void, retired = false): void | Promise<void> {
    if (!this.directory) return send()
    if (!room.owner) return Promise.reject(new RoomOwnershipError('Room owner token is required'))
    return this.directory.db.transaction(async () => {
      await this.directory!.assertOwner(room.id, room.owner!, undefined, retired)
      if (!retired && room.executionStamp) await new ExecutionAccess(this.directory!.db).assert(room.executionStamp)
      if (!retired) await this.directory!.presence(room.id, room.owner!, room.players.length, roomOccupiedSeatCount(room))
      for (const seat of room.players) {
        const token = this.tokens.get(seat.ws)
        if (!token) continue
        const allowed = await this.directory!.db.prepare('SELECT token FROM sessions WHERE token=? AND expires_at>(extract(epoch FROM clock_timestamp())*1000)::bigint FOR SHARE').get(token)
        if (!allowed) seat.ws.close(1008, 'session revoked')
      }
      send()
    })()
  }

  sendRoomEvent(ws: WebSocket, room: Room, event: ServerEvent): void | Promise<void> {
    return this.publish(room, () => this.sendTo(ws, event))
  }

  broadcastCommitted(
    room: Room,
    resp: SessionResponse,
    cause: StateUpdateCause,
    requestId?: string,
    requesterResponse?: RequesterResponse,
  ): void | Promise<void> {
    return this.publish(room, () => {
    const emittedAt = Date.now()
    for (const seat of room.players) {
      if (seat.ws.readyState !== seat.ws.OPEN) continue
      const env = buildEnvelope({
        room,
        resp: requesterResponse?.ws === seat.ws ? requesterResponse.response : resp,
        viewerPlayerId: viewerIdForSeat(resp, seat.playerIndex),
        version: room.version,
        cause,
        requestId: requesterResponse && requesterResponse.ws !== seat.ws ? undefined : requestId,
        emittedAt,
        mode: projectionModeFor(room),
      })
      seat.ws.send(JSON.stringify(env))
    }
    })
  }

  sendStateTo(
    ws: WebSocket,
    room: Room,
    resp: SessionResponse,
    requestId?: string,
    cause: StateUpdateCause = 'reconnect',
    mode?: SyncPayloadMode,
  ): void | Promise<void> {
    return this.publish(room, () => {
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
    })
  }

  broadcastEvent(room: Room, event: ServerEvent): void | Promise<void> {
    return this.publish(room, () => {
    const data = JSON.stringify(event)
    for (const seat of room.players) {
      if (seat.ws.readyState === seat.ws.OPEN) seat.ws.send(data)
    }
    }, event.type === 'roomDissolved')
  }

  sendTo(ws: WebSocket, event: ServerEvent): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event))
  }
}

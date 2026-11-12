import { getSessionByToken } from '../auth'
import { isRoomSpectator, roomSpectators, drainRoomSpectators } from '../game/room-spectators'
import { ExecutionAccess } from '../game/execution-access'
import { measure, operationsMetrics, roundTag, sendObserved, safe } from '../observability/metrics'
import { RoomDirectory, RoomOwnershipError } from '../game/room-directory'
import type { WebSocket } from 'ws'
import { isDevRoom, roomConnections, roomConnectedPlayerCount, roomOccupiedSeatCount, type Room } from '../game/room.ts'
import type { SessionResponse } from '../game/authoritative-session.ts'
import type { ServerEvent, SpectatingEndReason } from '../../shared/contract/protocol/ws.ts'
import type { StateUpdateCause } from '../../shared/contract/protocol/game.ts'
import { buildEnvelope } from './envelope-builder.ts'
import type { SyncPayloadMode } from '../../shared/session/sync-payload.ts'
import { controlledSeatIndexes, visiblePlayerIdsForConnection } from '../game/room-viewer'
import { parseClientCapabilities, type ClientCapability } from '../../shared/contract/client-capabilities'

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
  private readonly clientCapabilities = new WeakMap<WebSocket, ReadonlySet<ClientCapability>>()
  declareClientCapabilities(ws: WebSocket, input: unknown): void {
    this.clientCapabilities.set(ws, parseClientCapabilities(input))
  }
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
      if (!retired) await this.directory!.presence(room.id, room.owner!, roomConnectedPlayerCount(room), roomOccupiedSeatCount(room))
      for (const ws of [...roomConnections(room), ...roomSpectators(room)]) {
        const token = this.tokens.get(ws)
        if (!token) continue
        const allowed = await getSessionByToken(token, { db: this.directory!.db, lock: 'share' })
        if (!allowed) ws.close(1008, 'session revoked')
      }
      send()
    })()
  }

  sendRoomEvent(ws: WebSocket, room: Room, event: ServerEvent): void | Promise<void> {
    return this.publish(room, () => { sendObserved(ws, event, roundTag(room.session.state)) })
  }

  broadcastCommitted(
    room: Room,
    resp: SessionResponse,
    cause: StateUpdateCause,
    requestId?: string,
    requesterResponse?: RequesterResponse,
  ): void | Promise<void> {
    return measure('publication', () => this.publish(room, () => {
      const emittedAt = Date.now()
      let bytes = 0
      let recipients = 0
      for (const ws of roomConnections(room)) {
        if (ws.readyState !== ws.OPEN) continue
        const env = measure('projection', () => buildEnvelope({
          room,
          resp: requesterResponse?.ws === ws ? requesterResponse.response : resp,
          visiblePlayerIds: visiblePlayerIdsForConnection(room, ws),
          controlledPlayerIndexes: controlledSeatIndexes(room, ws),
          version: room.version,
          cause,
          requestId: requesterResponse && requesterResponse.ws !== ws ? undefined : requestId,
          emittedAt,
          mode: projectionModeFor(room),
      }))
      bytes += sendObserved(ws, env)
      recipients++
    }
    const spectators = roomSpectators(room).filter(ws => ws.readyState === ws.OPEN)
    if (spectators.length) {
      const envelope = measure('projection', () => buildEnvelope({ room, resp, visiblePlayerIds: [], controlledPlayerIndexes: [],
        version: room.version, cause, emittedAt, mode: 'viewer' }))
      const data = JSON.stringify(envelope)
      for (const ws of spectators) { bytes += sendObserved(ws, envelope, roundTag(resp.state), data); recipients++ }
    }
    if (resp.state.gameOver) this.endSpectating(room, 'completed')
    safe(() => {
      operationsMetrics.broadcastSize.observe({ round: roundTag(resp.state) }, bytes)
      operationsMetrics.broadcastRecipients.observe({ round: roundTag(resp.state) }, recipients)
    })
    }))
  }

  sendStateTo(
    ws: WebSocket,
    room: Room,
    resp: SessionResponse,
    requestId?: string,
    cause: StateUpdateCause = 'reconnect',
    mode?: SyncPayloadMode,
  ): void | Promise<void> {
    return measure('publication', () => this.publish(room, () => {
      const env = measure('projection', () => buildEnvelope({
        room,
        resp,
        visiblePlayerIds: visiblePlayerIdsForConnection(room, ws),
        controlledPlayerIndexes: controlledSeatIndexes(room, ws),
        version: room.version,
        cause,
        requestId,
        emittedAt: Date.now(),
        mode: isRoomSpectator(room, ws) ? 'viewer' : mode ?? projectionModeFor(room),
    }))
    sendObserved(ws, env)
    }))
  }

  broadcastEvent(room: Room, event: ServerEvent): void | Promise<void> {
    return this.publish(room, () => {
    const data = JSON.stringify(event)
    const round = roundTag(room.session.state)
    for (const ws of roomConnections(room)) {
      sendObserved(ws, event, round, data)
    }
    if (event.type === 'roomPersistencePaused' || event.type === 'roomPersistenceResumed'
      || event.type === 'playerJoined' || event.type === 'playerDisconnected') {
      for (const ws of roomSpectators(room)) sendObserved(ws, event, round, data)
    }
    if (event.type === 'gameTerminated') this.endSpectating(room, 'terminated')
    else if (event.type === 'roomDissolved') this.endSpectating(room, 'removed')
    else if (event.type === 'playerDisconnected' && roomConnectedPlayerCount(room) === 0) this.endSpectating(room, 'offline')
    }, event.type === 'roomDissolved' || event.type === 'gameTerminated')
  }

  endSpectating(room: Room, reason: SpectatingEndReason): void {
    const viewers = drainRoomSpectators(room)
    try {
      for (const ws of viewers) sendObserved(ws, { type: 'spectatingEnded', roomId: room.id, reason })
    } finally {
      for (const ws of viewers) ws.close(1000, 'spectating ended')
    }
  }

  sendTo(ws: WebSocket, event: ServerEvent): void {
    sendObserved(ws, event)
  }
}

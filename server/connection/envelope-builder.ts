import { projectRoomHistoryNames } from './history-presentation'
import type { Room } from '../game/room'
import type { GameSession, SessionResponse } from '../game/authoritative-session.ts'
import type {
  StateUpdateCause,
  StateUpdateEnvelope,
} from '../../shared/contract/protocol/game.ts'
import { buildSessionSyncPayload } from '../game/custom-session-executor.ts'
import type { SyncPayloadMode } from '../../shared/session/sync-payload.ts'
import { connectedSeatIndexes } from '../game/room-viewer'

type Args = {
  room: { id: string; session: GameSession } & Partial<Pick<Room, 'players' | 'seatOwners' | 'inputWindow' | 'hotseat'>>
  resp: SessionResponse
  visiblePlayerIds: readonly string[]
  controlledPlayerIndexes: readonly number[]
  version: number
  cause: StateUpdateCause
  requestId?: string
  emittedAt: number
  sync?: 'snapshot'
  mode?: SyncPayloadMode
}

export function buildEnvelope(args: Args): StateUpdateEnvelope {
  const payload = args.mode === 'debug'
    ? buildSessionSyncPayload(args.room.session, args.resp, args.visiblePlayerIds, args.mode, true)
    : projectRoomHistoryNames(args.room, buildSessionSyncPayload(args.room.session, args.resp, args.visiblePlayerIds, args.mode, true, 'deferred'))
  const actor = payload.interaction.stateId === 'wait' ? payload.interaction.playerIndex : args.resp.state.currentPlayerIndex
  if (!args.controlledPlayerIndexes.includes(actor)) {
    payload.interaction = { ...payload.interaction, allowedCommands: [], anytimeActions: [] }
  }
  return {
    type: 'stateUpdate',
    ...(args.room.players ? { connectedPlayerIndexes: connectedSeatIndexes({ ...args.room, players: args.room.players }) } : {}),
    ...(args.room.inputWindow ? { inputWindow: { id: args.room.inputWindow.id, kind: args.room.inputWindow.kind } } : {}),
    roomId: args.room.id,
    version: args.version,
    sync: args.sync ?? 'snapshot',
    cause: args.cause,
    requestId: args.requestId,
    payload,
    emittedAt: args.emittedAt,
  }
}

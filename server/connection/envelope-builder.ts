import { projectRoomHistoryNames } from './history-presentation'
import type { Room } from '../game/room'
import type { GameSession, SessionResponse } from '../game/authoritative-session.ts'
import type {
  StateUpdateCause,
  StateUpdateEnvelope,
} from '../../shared/contract/protocol/game.ts'
import { buildSessionSyncPayload } from '../game/custom-session-executor.ts'
import type { SyncPayloadMode } from '../../shared/session/sync-payload.ts'

type Args = {
  room: { id: string; session: GameSession } & Partial<Pick<Room, 'players' | 'inputWindow'>>
  resp: SessionResponse
  viewerPlayerId: string | null
  version: number
  cause: StateUpdateCause
  requestId?: string
  emittedAt: number
  sync?: 'snapshot'
  mode?: SyncPayloadMode
}

export function buildEnvelope(args: Args): StateUpdateEnvelope {
  return {
    type: 'stateUpdate',
    ...(args.room.inputWindow ? { inputWindow: { id: args.room.inputWindow.id, kind: args.room.inputWindow.kind } } : {}),
    roomId: args.room.id,
    version: args.version,
    sync: args.sync ?? 'snapshot',
    cause: args.cause,
    requestId: args.requestId,
    payload: args.mode === 'debug'
      ? buildSessionSyncPayload(args.room.session, args.resp, args.viewerPlayerId, args.mode, true)
      : projectRoomHistoryNames(args.room, buildSessionSyncPayload(args.room.session, args.resp, args.viewerPlayerId, args.mode, true, 'deferred')),
    emittedAt: args.emittedAt,
  }
}

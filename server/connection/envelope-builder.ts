import type { GameSession, SessionResponse } from '../game/authoritative-session.ts'
import type {
  StateUpdateCause,
  StateUpdateEnvelope,
} from '../../shared/contract/protocol/game.ts'
import { buildSessionSyncPayload } from '../game/custom-session-executor.ts'
import type { SyncPayloadMode } from '../../shared/session/sync-payload.ts'

type Args = {
  room: { id: string; session: GameSession }
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
    roomId: args.room.id,
    version: args.version,
    sync: args.sync ?? 'snapshot',
    cause: args.cause,
    requestId: args.requestId,
    payload: buildSessionSyncPayload(args.room.session, args.resp, args.viewerPlayerId, args.mode),
    emittedAt: args.emittedAt,
  }
}

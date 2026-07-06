import type { GameSession, SessionResponse } from '../game/authoritative-session.ts'
import type {
  StateUpdateCause,
  StateUpdateEnvelope,
} from '../../shared/contract/protocol/game.ts'
import { buildGameSyncPayload } from '../game/sync-payload.ts'

type Args = {
  room: { id: string; session: GameSession }
  resp: SessionResponse
  viewerPlayerId: string | null
  version: number
  cause: StateUpdateCause
  requestId?: string
  emittedAt: number
  sync?: 'snapshot'
}

export function buildEnvelope(args: Args): StateUpdateEnvelope {
  return {
    type: 'stateUpdate',
    roomId: args.room.id,
    version: args.version,
    sync: args.sync ?? 'snapshot',
    cause: args.cause,
    requestId: args.requestId,
    payload: buildGameSyncPayload({
      session: args.room.session,
      resp: args.resp,
      viewerPlayerId: args.viewerPlayerId,
    }),
    emittedAt: args.emittedAt,
  }
}

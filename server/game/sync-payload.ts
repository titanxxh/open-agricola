import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { GameSession, SessionResponse, SyncPayloadMode } from './authoritative-session.ts'

type Args = {
  session: GameSession
  resp: SessionResponse
  viewerPlayerId: string | null
  mode?: SyncPayloadMode
}

export const buildGameSyncPayload = ({
  session,
  resp,
  viewerPlayerId,
  mode = 'viewer',
}: Args): GameSyncPayload => {
  return session.buildSyncPayload(resp, viewerPlayerId, mode)
}

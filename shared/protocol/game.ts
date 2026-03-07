import type { PendingAction } from '../game/types'
import type { SerializedGameState } from '../game/serialization'
import type { PlayerScoreSummary } from '../logic/scoring'

export type GameSyncPayload = {
  state: SerializedGameState
  pending: PendingAction
  scores: PlayerScoreSummary[] | null
  historyLength: number
  hasActionStartSnapshot: boolean
  ok: boolean
  error?: string
}

export type StateUpdateCause =
  | 'action'
  | 'choice'
  | 'reorg'
  | 'feed'
  | 'undo'
  | 'dev'
  | 'reconnect'

export type StateUpdateEnvelope = {
  type: 'stateUpdate'
  roomId: string
  version: number
  sync: 'snapshot'
  cause: StateUpdateCause
  payload: GameSyncPayload
  emittedAt: number
}

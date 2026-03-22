import type { InteractionState, PendingAction } from '../game/types'
import type { SerializedGameState } from '../game/serialization'
import type { PlayerScoreSummary } from '../logic/scoring'

export type GameSyncPayload = {
  state: SerializedGameState
  pending: PendingAction
  interaction: InteractionState
  scores: PlayerScoreSummary[] | null
  pastureCapacities?: Record<string, Record<string, number>>
  historyLength: number
  hasActionStartSnapshot: boolean
  ok: boolean
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
}

export type StateUpdateCause =
  | 'action'
  | 'choice'
  | 'anytime'
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

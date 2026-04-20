import type { InteractionState, PendingAction, PlayerState, Resource } from '../game/types'
import type { SerializedGameState } from '../game/serialization'
import type { PlayerScoreSummary } from '../logic/scoring'
import type { CardDefinition } from '../cards/types'

export type CustomCardDef = {
  cardType: 'minor' | 'occupation'
  cardJson: CardDefinition
  artUrl?: string | null
}

export type ActionDetailEffects = {
  buildRoom?: number
  buildStables?: number
  growFamily?: number
  plow?: number
  sowGrain?: number
  sowVegetable?: number
  renovate?: { from: PlayerState['houseType']; to: PlayerState['houseType'] }
  fencing?: number
  palisading?: number
  improvements?: string[]
  minorImprovements?: string[]
  startPlayer?: boolean
  bakeBread?: { count: number; food: number }
}

export type ActionDetailParts = {
  gains?: Partial<Resource>
  costs?: Partial<Resource>
  effects?: ActionDetailEffects
}

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
  /** Custom card definitions for frontend registration — treated identically to built-in cards. */
  customCardDefs?: CustomCardDef[]
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
  | 'draftSubmit'

export type StateUpdateEnvelope = {
  type: 'stateUpdate'
  roomId: string
  version: number
  sync: 'snapshot'
  cause: StateUpdateCause
  requestId?: string
  payload: GameSyncPayload
  emittedAt: number
}
